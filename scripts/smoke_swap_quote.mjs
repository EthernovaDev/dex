#!/usr/bin/env node
import fs from 'fs'
import { Interface } from '../dex-ui/node_modules/@ethersproject/abi/lib/index.js'

const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const CONFIG_PATH = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'

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

async function main() {
  const config = loadConfig()
  const router = config.contracts.swapRouter || config.contracts.router
  const wnova = config.tokens.WNOVA.address
  const tony = config.tokens.TONY.address

  const iface = new Interface(['function getAmountsOut(uint256,address[]) view returns (uint256[])'])
  const amountWnova = BigInt(process.env.SMOKE_AMOUNT_WNOVA || '1000000000000000000') // 1 WNOVA
  const amountTony = BigInt(process.env.SMOKE_AMOUNT_TONY || '1000000000000000000000') // 1000 TONY

  const dataWn = iface.encodeFunctionData('getAmountsOut', [amountWnova.toString(), [wnova, tony]])
  const dataTy = iface.encodeFunctionData('getAmountsOut', [amountTony.toString(), [tony, wnova]])

  const outWn = await rpcCall('eth_call', [{ to: router, data: dataWn }, 'latest'])
  const outTy = await rpcCall('eth_call', [{ to: router, data: dataTy }, 'latest'])

  const decodedWn = iface.decodeFunctionResult('getAmountsOut', outWn)[0]
  const decodedTy = iface.decodeFunctionResult('getAmountsOut', outTy)[0]

  if (!decodedWn || decodedWn.length < 2 || decodedWn[1].isZero()) {
    throw new Error('getAmountsOut WNOVA->TONY returned zero')
  }
  if (!decodedTy || decodedTy.length < 2 || decodedTy[1].isZero()) {
    throw new Error('getAmountsOut TONY->WNOVA returned zero')
  }

  console.log('[OK] getAmountsOut WNOVA->TONY:', decodedWn[1].toString())
  console.log('[OK] getAmountsOut TONY->WNOVA:', decodedTy[1].toString())
}

main().catch(err => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
