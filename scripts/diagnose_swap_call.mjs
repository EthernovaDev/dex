#!/usr/bin/env node
import fs from 'fs'
import { Interface } from '../dex-ui/node_modules/@ethersproject/abi/lib/index.js'

const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const CONFIG_PATH = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const SWAP_FROM = (process.env.SWAP_FROM || '').trim()
const TOKEN_IN = (process.env.TOKEN_IN || '').trim()
const TOKEN_OUT = (process.env.TOKEN_OUT || '').trim()
const ROUTER_OVERRIDE = (process.env.ROUTER || '').trim()
const AMOUNT_IN = BigInt(process.env.AMOUNT_IN_WEI || '1000000000000000000') // 1 WNOVA default
const SLIPPAGE_BPS = Number(process.env.SLIPPAGE_BPS || '50')
const DEADLINE_SECONDS = Number(process.env.DEADLINE_SECONDS || '1200')
const TREASURY_FEE_BPS = 100n
const BPS = 10000n

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
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
  if (!data || data === '0x') return 'execution reverted (no data)'
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

function applyFee(amount) {
  const fee = (amount * TREASURY_FEE_BPS) / BPS
  return { fee, net: amount - fee }
}

function minOut(amountOut, slippageBps) {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n
}

function getAmountOut(amountIn, reserveIn, reserveOut) {
  const amountInWithFee = amountIn * 997n
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn * 1000n + amountInWithFee
  return numerator / denominator
}

async function main() {
  if (!SWAP_FROM || !SWAP_FROM.startsWith('0x') || SWAP_FROM.length !== 42) {
    throw new Error('SWAP_FROM is required and must be a valid address')
  }
  const config = loadConfig()
  const wnova = config.tokens.WNOVA.address
  const tony = config.tokens.TONY.address
  const router = ROUTER_OVERRIDE || config.contracts.swapRouter || config.contracts.router
  const pair = config.contracts.pair

  const tokenIn = TOKEN_IN || wnova
  const tokenOut = TOKEN_OUT || tony
  const tokenInLower = tokenIn.toLowerCase()
  const wnovaLower = wnova.toLowerCase()

  const ifaceErc20 = new Interface(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'])
  const ifacePair = new Interface(['function getReserves() view returns (uint112,uint112,uint32)', 'function token0() view returns (address)', 'function token1() view returns (address)'])
  const ifaceRouter = new Interface(['function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)', 'function getAmountsOut(uint256,address[]) view returns (uint256[])'])

  const token0Raw = await rpcCall('eth_call', [{ to: pair, data: ifacePair.encodeFunctionData('token0') }, 'latest'])
  const token1Raw = await rpcCall('eth_call', [{ to: pair, data: ifacePair.encodeFunctionData('token1') }, 'latest'])
  const token0 = ifacePair.decodeFunctionResult('token0', token0Raw)[0].toLowerCase()
  const token1 = ifacePair.decodeFunctionResult('token1', token1Raw)[0].toLowerCase()
  const reservesRaw = await rpcCall('eth_call', [{ to: pair, data: ifacePair.encodeFunctionData('getReserves') }, 'latest'])
  const [reserve0, reserve1] = ifacePair.decodeFunctionResult('getReserves', reservesRaw)
  const r0 = BigInt(reserve0.toString())
  const r1 = BigInt(reserve1.toString())

  const reserveIn = token0 === tokenInLower ? r0 : r1
  const reserveOut = token0 === tokenInLower ? r1 : r0

  const balanceRaw = await rpcCall('eth_call', [{ to: tokenIn, data: ifaceErc20.encodeFunctionData('balanceOf', [SWAP_FROM]) }, 'latest'])
  const allowanceRaw = await rpcCall('eth_call', [{ to: tokenIn, data: ifaceErc20.encodeFunctionData('allowance', [SWAP_FROM, router]) }, 'latest'])

  const balance = BigInt(balanceRaw)
  const allowance = BigInt(allowanceRaw)

  const feeInfo = tokenInLower === wnovaLower ? applyFee(AMOUNT_IN) : { fee: 0n, net: AMOUNT_IN }
  const grossOut = getAmountOut(AMOUNT_IN, reserveIn, reserveOut)
  const netOut = getAmountOut(feeInfo.net, reserveIn, reserveOut)
  const minOutGross = minOut(grossOut, SLIPPAGE_BPS)
  const minOutNet = minOut(netOut, SLIPPAGE_BPS)

  console.log('[INFO] swapFrom', SWAP_FROM)
  console.log('[INFO] tokenIn/tokenOut', tokenIn, tokenOut)
  console.log('[INFO] reserves', { reserveIn: reserveIn.toString(), reserveOut: reserveOut.toString() })
  console.log('[INFO] balance/allowance', { balance: balance.toString(), allowance: allowance.toString() })
  console.log('[INFO] fee', { amountIn: AMOUNT_IN.toString(), fee: feeInfo.fee.toString(), netToPair: feeInfo.net.toString() })
  console.log('[INFO] outputs', { grossOut: grossOut.toString(), netOut: netOut.toString(), minOutGross: minOutGross.toString(), minOutNet: minOutNet.toString() })

  const path = [tokenIn, tokenOut]
  const nowTs = Math.floor(Date.now() / 1000)
  const deadline = nowTs + DEADLINE_SECONDS
  console.log('[INFO] deadline', { nowTs, deadlineTs: deadline, delta: deadline - nowTs })
  const dataGross = ifaceRouter.encodeFunctionData('swapExactTokensForTokens', [
    AMOUNT_IN.toString(),
    minOutGross.toString(),
    path,
    SWAP_FROM,
    deadline
  ])
  const dataNet = ifaceRouter.encodeFunctionData('swapExactTokensForTokens', [
    AMOUNT_IN.toString(),
    minOutNet.toString(),
    path,
    SWAP_FROM,
    deadline
  ])

  const call = async (label, data) => {
    try {
      await rpcCall('eth_call', [{ to: router, from: SWAP_FROM, data }, 'latest'])
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
