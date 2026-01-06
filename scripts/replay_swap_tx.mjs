#!/usr/bin/env node
import fs from 'fs'
import { Interface } from '../dex-ui/node_modules/@ethersproject/abi/lib/index.js'

const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'

function readInput() {
  const arg = process.argv[2]
  if (arg) {
    if (arg.trim().startsWith('{')) return arg
    if (fs.existsSync(arg)) return fs.readFileSync(arg, 'utf8')
  }
  return fs.readFileSync(0, 'utf8')
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
    const data = json.error?.data
    const err = new Error(msg)
    err.data = data
    throw err
  }
  return json.result
}

function decodeRevertData(raw) {
  if (!raw) return 'execution reverted (no data)'
  const data = typeof raw === 'string' ? raw : typeof raw?.data === 'string' ? raw.data : ''
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
  return `execution reverted (raw): ${data}`
}

async function main() {
  const raw = readInput()
  if (!raw || !raw.trim()) {
    throw new Error('Provide txRequest JSON via stdin or as an argument')
  }
  let txRequest
  try {
    txRequest = JSON.parse(raw)
  } catch (err) {
    throw new Error('Invalid JSON for txRequest')
  }
  if (txRequest?.gasLimit && !txRequest?.gas) {
    txRequest.gas = txRequest.gasLimit
    delete txRequest.gasLimit
  }
  if (typeof txRequest?.gas === 'string') {
    let gasHex = txRequest.gas.toLowerCase()
    if (gasHex.startsWith('0x0') && gasHex.length > 3) {
      gasHex = `0x${gasHex.replace(/^0x0+/, '')}`
      if (gasHex === '0x') gasHex = '0x0'
      txRequest.gas = gasHex
    }
  }
  // eth_call/estimateGas do not accept chainId in tx params
  if (txRequest?.chainId !== undefined) {
    delete txRequest.chainId
  }
  if (typeof txRequest?.value === 'string') {
    try {
      const valueBig = BigInt(txRequest.value)
      txRequest.value = valueBig === 0n ? '0x0' : `0x${valueBig.toString(16)}`
    } catch {
      // keep original
    }
  }
  const blockTag = process.env.BLOCK_TAG || 'pending'
  const nowTs = Math.floor(Date.now() / 1000)
  console.log('[INFO] blockTag:', blockTag, 'nowTs:', nowTs)
  try {
    await rpcCall('eth_call', [txRequest, blockTag])
    console.log('[SIMULATE] ok')
  } catch (err) {
    const data =
      err?.data ||
      err?.error?.data ||
      err?.error?.error?.data ||
      err?.error?.data?.data ||
      err?.data?.data
    const reason = decodeRevertData(data)
    console.log('[SIMULATE] reverted:', reason)
    if (data) console.log('[SIMULATE] raw:', data)
    if (err?.message) console.log('[SIMULATE] message:', err.message)
    process.exitCode = 1
  }

  try {
    const gas = await rpcCall('eth_estimateGas', [txRequest, blockTag])
    console.log('[ESTIMATE] gas:', gas)
  } catch (err) {
    const data =
      err?.data ||
      err?.error?.data ||
      err?.error?.error?.data ||
      err?.error?.data?.data ||
      err?.data?.data
    const reason = decodeRevertData(data)
    console.log('[ESTIMATE] reverted:', reason)
    if (data) console.log('[ESTIMATE] raw:', data)
    if (err?.message) console.log('[ESTIMATE] message:', err.message)
    process.exitCode = 1
  }
}

main().catch(err => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
