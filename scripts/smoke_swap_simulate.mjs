#!/usr/bin/env node
import fs from 'fs'
import { Interface } from '../dex-ui/node_modules/@ethersproject/abi/lib/index.js'

const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const CONFIG_PATH = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const FROM = (process.env.SMOKE_FROM || '').trim()
const AMOUNT_IN = BigInt(process.env.SMOKE_AMOUNT_IN_WEI || '1000000000000000000') // 1 WNOVA
const SLIPPAGE_BPS = Number(process.env.SMOKE_SLIPPAGE_BPS || '50')
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
  if (!res.ok) throw new Error(`RPC ${res.status}: ${text.slice(0, 200)}`)
  const json = JSON.parse(text)
  if (json.error) {
    throw new Error(json.error?.message || JSON.stringify(json.error))
  }
  return json.result
}

function decodeRevertData(raw) {
  if (!raw || raw === '0x') return 'execution reverted (no data)'
  const selector = raw.slice(0, 10)
  if (selector === '0x08c379a0') {
    try {
      const iface = new Interface(['function Error(string)'])
      const [reason] = iface.decodeFunctionData('Error', raw)
      return `Error(${reason})`
    } catch {
      return `Error(unknown): ${raw}`
    }
  }
  if (selector === '0x4e487b71') {
    return `Panic(${raw})`
  }
  return `execution reverted (raw): ${raw}`
}

function applyFee(amount) {
  const fee = (amount * TREASURY_FEE_BPS) / BPS
  return { fee, net: amount - fee }
}

function minOut(amountOut, slippageBps) {
  return (amountOut * BigInt(10000 - slippageBps)) / 10000n
}

async function main() {
  if (!FROM) {
    console.log('[SKIP] SMOKE_FROM not set, skipping swap simulate.')
    return
  }
  const config = loadConfig()
  const router = config.contracts.swapRouter || config.contracts.router
  const wnova = config.tokens.WNOVA.address
  const tony = config.tokens.TONY.address

  const ifaceErc20 = new Interface(['function balanceOf(address) view returns (uint256)', 'function allowance(address,address) view returns (uint256)'])
  const ifaceRouter = new Interface([
    'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'
  ])
  const ifaceGetAmounts = new Interface(['function getAmountsOut(uint256,address[]) view returns (uint256[])'])

  const balanceRaw = await rpcCall('eth_call', [{ to: wnova, data: ifaceErc20.encodeFunctionData('balanceOf', [FROM]) }, 'latest'])
  const allowanceRaw = await rpcCall('eth_call', [{ to: wnova, data: ifaceErc20.encodeFunctionData('allowance', [FROM, router]) }, 'latest'])
  const balance = BigInt(balanceRaw)
  const allowance = BigInt(allowanceRaw)

  if (balance < AMOUNT_IN) {
    console.log('[SKIP] insufficient balance for simulate')
    return
  }
  if (allowance < AMOUNT_IN) {
    console.log('[SKIP] insufficient allowance for simulate')
    return
  }

  const feeInfo = applyFee(AMOUNT_IN)
  const amountsRaw = await rpcCall('eth_call', [
    { to: router, data: ifaceGetAmounts.encodeFunctionData('getAmountsOut', [feeInfo.net.toString(), [wnova, tony]]) },
    'latest'
  ])
  const outArr = ifaceGetAmounts.decodeFunctionResult('getAmountsOut', amountsRaw)[0]
  const amountOut = BigInt(outArr[1].toString())
  const amountOutMin = minOut(amountOut, SLIPPAGE_BPS)

  const deadline = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS
  const data = ifaceRouter.encodeFunctionData('swapExactTokensForTokens', [
    AMOUNT_IN.toString(),
    amountOutMin.toString(),
    [wnova, tony],
    FROM,
    deadline
  ])

  try {
    await rpcCall('eth_call', [{ to: router, from: FROM, data }, 'pending'])
    console.log('[OK] eth_call simulate succeeded')
  } catch (err) {
    const message = err?.message || String(err)
    const match = message.match(/0x[0-9a-fA-F]+/)
    const raw = match ? match[0] : ''
    console.error('[ERROR] eth_call simulate reverted', decodeRevertData(raw))
    process.exit(1)
  }
}

main().catch(err => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
