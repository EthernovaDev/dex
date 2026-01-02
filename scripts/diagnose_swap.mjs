#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { Interface } from '../dex-ui/node_modules/@ethersproject/abi/lib/index.js'

const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const CONFIG_PATH = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const AMOUNT_IN = BigInt(process.env.AMOUNT_IN_WEI || '1000000000000000000') // 1 WNOVA
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || '50')
const TREASURY_FEE_BPS = 100n
const BPS = 10000n

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
}

function toHex(value) {
  return '0x' + value.toString(16)
}

async function rpcCall(method, params) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  const res = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body
  })
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`RPC ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = JSON.parse(text)
  if (json.error) {
    const msg = json.error?.message || JSON.stringify(json.error)
    throw new Error(`RPC error: ${msg}`)
  }
  return json.result
}

function decodeRevert(data) {
  if (!data || data === '0x') return 'no revert data'
  const selector = data.slice(0, 10)
  if (selector === '0x08c379a0') {
    try {
      const iface = new Interface(['function Error(string)'])
      const [reason] = iface.decodeFunctionData('Error', data)
      return `Error(${reason})`
    } catch {
      return `Error(unknown): ${data}`
    }
  }
  if (selector === '0x4e487b71') {
    return `Panic(${data})`
  }
  return data
}

function getAmountOut(amountIn, reserveIn, reserveOut) {
  const amountInWithFee = amountIn * 997n
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn * 1000n + amountInWithFee
  return numerator / denominator
}

function applyFee(amount) {
  const fee = (amount * TREASURY_FEE_BPS) / BPS
  return { fee, net: amount - fee }
}

function minOut(amountOut, slippageBps) {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n
}

async function main() {
  const config = loadConfig()
  const pair = config.contracts.pair
  const router = config.contracts.swapRouter || config.contracts.router
  const wnova = config.tokens.WNOVA.address
  const tony = config.tokens.TONY.address
  const from = process.env.SWAP_FROM || '0x0000000000000000000000000000000000000000'

  const ifacePair = new Interface(['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)', 'function token1() view returns (address)'])
  const ifaceRouter = new Interface(['function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'])

  const token0 = await rpcCall('eth_call', [{ to: pair, data: ifacePair.encodeFunctionData('token0') }, 'latest'])
  const token1 = await rpcCall('eth_call', [{ to: pair, data: ifacePair.encodeFunctionData('token1') }, 'latest'])
  const t0 = ifacePair.decodeFunctionResult('token0', token0)[0].toLowerCase()
  const t1 = ifacePair.decodeFunctionResult('token1', token1)[0].toLowerCase()

  const reservesRaw = await rpcCall('eth_call', [{ to: pair, data: ifacePair.encodeFunctionData('getReserves') }, 'latest'])
  const [reserve0, reserve1] = ifacePair.decodeFunctionResult('getReserves', reservesRaw)
  const r0 = BigInt(reserve0.toString())
  const r1 = BigInt(reserve1.toString())

  const wnovaLower = wnova.toLowerCase()
  const tonyLower = tony.toLowerCase()

  const reserveWnova = t0 === wnovaLower ? r0 : r1
  const reserveTony = t0 === tonyLower ? r0 : r1

  const { fee, net: netIn } = applyFee(AMOUNT_IN)
  const grossOut = getAmountOut(AMOUNT_IN, reserveWnova, reserveTony)
  const netOut = getAmountOut(netIn, reserveWnova, reserveTony)
  const minOutGross = minOut(grossOut, SLIPPAGE_BPS)
  const minOutNet = minOut(netOut, SLIPPAGE_BPS)

  console.log('[INFO] Reserves:', {
    reserveWNOVA: reserveWnova.toString(),
    reserveTONY: reserveTony.toString()
  })
  console.log('[INFO] Input:', {
    amountIn: AMOUNT_IN.toString(),
    treasuryFee: fee.toString(),
    amountToPair: netIn.toString()
  })
  console.log('[INFO] Expected outputs:', {
    grossOut: grossOut.toString(),
    netOut: netOut.toString(),
    minOutGross: minOutGross.toString(),
    minOutNet: minOutNet.toString()
  })

  const path = [wnova, tony]
  const deadline = Math.floor(Date.now() / 1000) + 60 * 20
  const dataGross = ifaceRouter.encodeFunctionData('swapExactTokensForTokens', [AMOUNT_IN.toString(), minOutGross.toString(), path, from, deadline])
  const dataNet = ifaceRouter.encodeFunctionData('swapExactTokensForTokens', [AMOUNT_IN.toString(), minOutNet.toString(), path, from, deadline])

  const call = async (label, data) => {
    try {
      await rpcCall('eth_call', [{ to: router, from, data }, 'latest'])
      console.log(`[CALL ${label}] success`)
    } catch (err) {
      const message = err?.message || String(err)
      const revertDataMatch = message.match(/0x[0-9a-fA-F]+/)
      const revertData = revertDataMatch ? revertDataMatch[0] : ''
      console.log(`[CALL ${label}] revert`, decodeRevert(revertData))
    }
  }

  await call('minOutGross', dataGross)
  await call('minOutNet', dataNet)
}

main().catch(err => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
