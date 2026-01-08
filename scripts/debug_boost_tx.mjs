import fs from 'fs'
import { ethers } from 'ethers'

const txHash = process.argv[2]
if (!txHash) {
  console.error('Usage: node scripts/debug_boost_tx.mjs <txHash>')
  process.exit(1)
}

const rpcUrl = process.env.RPC_URL || 'https://rpc.ethnova.net'
const boostRegistry = process.env.BOOST_REGISTRY || '0xd77c78F49C59aB0BccF131a71F63B125352D5240'

const BOOST_EVENT_ABI = ['event Boosted(address indexed pair, address indexed booster, uint256 amount, uint256 expiresAt)']
const idFn = ethers.id || (ethers.utils && ethers.utils.id)
const InterfaceCtor = ethers.Interface || (ethers.utils && ethers.utils.Interface)
const BOOST_TOPIC = idFn('Boosted(address,address,uint256,uint256)')

const toNumberSafe = (value) => {
  try {
    if (value === null || value === undefined) return 0
    if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : 0
    const text = value.toString()
    const parsed = Number.parseInt(text, text.startsWith('0x') ? 16 : 10)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

const main = async () => {
  const JsonRpcProvider = ethers.providers?.JsonRpcProvider || ethers.JsonRpcProvider
  const provider = new JsonRpcProvider(rpcUrl)
  const tx = await provider.getTransaction(txHash)
  if (!tx) {
    console.error('[ERROR] tx not found')
    process.exit(1)
  }
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) {
    console.error('[ERROR] receipt not found')
    process.exit(1)
  }

  console.log('[tx] to', tx.to)
  console.log('[tx] input', tx.data || tx.input)
  console.log('[tx] value', tx.value?.toString?.() || String(tx.value || '0'))
  console.log('[receipt] status', receipt.status)
  console.log('[receipt] block', receipt.blockNumber)

  const iface = new InterfaceCtor(BOOST_EVENT_ABI)
  const logs = receipt.logs.filter((log) => log.address.toLowerCase() === boostRegistry.toLowerCase())
  const parsed = []
  for (const log of logs) {
    if (!log.topics?.length || log.topics[0].toLowerCase() !== BOOST_TOPIC.toLowerCase()) continue
    try {
      const decoded = iface.parseLog(log)
      const pair = decoded?.args?.pair || decoded?.args?.[0]
      const booster = decoded?.args?.booster || decoded?.args?.[1]
      const amountRaw = decoded?.args?.amount || decoded?.args?.[2]
      const expiresAtRaw = decoded?.args?.expiresAt || decoded?.args?.[3]
      const expiresAt = toNumberSafe(expiresAtRaw)
      parsed.push({ pair, booster, amount: amountRaw?.toString?.() || String(amountRaw), expiresAt })
    } catch (err) {
      console.warn('[WARN] failed to parse log', err)
    }
  }

  if (!parsed.length) {
    console.warn('[WARN] no Boosted event found in receipt')
  } else {
    const now = Math.floor(Date.now() / 1000)
    for (const entry of parsed) {
      console.log('[event] pair', entry.pair)
      console.log('[event] booster', entry.booster)
      console.log('[event] amount', entry.amount)
      console.log('[event] expiresAt', entry.expiresAt, `active=${entry.expiresAt > now}`)
    }
  }
}

main().catch((err) => {
  console.error('[ERROR]', err)
  process.exit(1)
})
