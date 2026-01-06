#!/usr/bin/env node
import fs from 'fs'
import { ethers } from '../dex-ui/node_modules/ethers/lib/ethers.js'

const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const CONFIG_PATH = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const PRIVKEY = (process.env.SMOKE_PRIVKEY || '').trim()
const PAIR_OVERRIDE = (process.env.SMOKE_PAIR || '').trim()
const DURATION = Number(process.env.SMOKE_BOOST_DURATION || '86400')

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
}

async function main() {
  if (!PRIVKEY) {
    console.log('[SKIP] SMOKE_PRIVKEY not set, skipping boost e2e.')
    return
  }

  const config = loadConfig()
  const boostRegistry = config.contracts.boostRegistry
  const wnova = config.tokens.WNOVA.address
  const pair = PAIR_OVERRIDE || config.contracts.pair

  if (!boostRegistry || !pair) {
    throw new Error('Missing boostRegistry or pair in config')
  }

  const provider = new ethers.providers.JsonRpcProvider(RPC_URL)
  const wallet = new ethers.Wallet(PRIVKEY, provider)

  const BOOST_ABI = [
    'function boostPair(address pair, uint256 duration) payable',
    'function feeAmount() view returns (uint256)',
    'function boostInfo(address pair) view returns (address booster, uint256 expiresAt)'
  ]
  const ERC20_ABI = ['function allowance(address,address) view returns (uint256)', 'function approve(address,uint256) returns (bool)']

  const boostContract = new ethers.Contract(boostRegistry, BOOST_ABI, wallet)
  const wnovaContract = new ethers.Contract(wnova, ERC20_ABI, wallet)

  const feeAmount = await boostContract.feeAmount()
  const nativeBalance = await provider.getBalance(wallet.address)
  let tx

  if (nativeBalance.gte(feeAmount)) {
    tx = await boostContract.boostPair(pair, DURATION, { value: feeAmount })
  } else {
    const allowance = await wnovaContract.allowance(wallet.address, boostRegistry)
    if (allowance.lt(feeAmount)) {
      const approveTx = await wnovaContract.approve(boostRegistry, feeAmount)
      await approveTx.wait(1)
    }
    tx = await boostContract.boostPair(pair, DURATION)
  }

  console.log('[INFO] boost tx:', tx.hash)
  const receipt = await tx.wait(1)
  console.log('[INFO] receipt status:', receipt.status, 'block', receipt.blockNumber)
  if (receipt.status !== 1) {
    throw new Error('Boost tx failed')
  }

  const [booster, expiresAt] = await boostContract.boostInfo(pair)
  const now = Math.floor(Date.now() / 1000)
  if (booster.toLowerCase() !== wallet.address.toLowerCase() || expiresAt.toNumber() <= now) {
    throw new Error('Boost info not updated')
  }
  console.log('[OK] boostInfo', { booster, expiresAt: expiresAt.toNumber() })
}

main().catch(err => {
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
