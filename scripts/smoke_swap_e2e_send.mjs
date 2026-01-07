#!/usr/bin/env node
import fs from 'fs'
import { Interface } from '../dex-ui/node_modules/@ethersproject/abi/lib/index.js'
import { JsonRpcProvider } from '../dex-ui/node_modules/@ethersproject/providers/lib/index.js'
import { Wallet } from '../dex-ui/node_modules/@ethersproject/wallet/lib/index.js'
import { BigNumber } from '../dex-ui/node_modules/@ethersproject/bignumber/lib/index.js'
import { parseUnits, formatUnits } from '../dex-ui/node_modules/@ethersproject/units/lib/index.js'

const CONFIG_PATH = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const RPC_URL = process.env.SMOKE_RPC_URL || 'https://rpc.ethnova.net'
const SMOKE_AMOUNT_WNOVA = process.env.SMOKE_AMOUNT_WNOVA || '0.01'
const SLIPPAGE_BPS = Number(process.env.SMOKE_SLIPPAGE_BPS || '50')
const DEADLINE_SECONDS = Number(process.env.DEADLINE_SECONDS || '1200')
const AUTO_APPROVE = (process.env.SMOKE_AUTO_APPROVE || '1') === '1'
const FEE_BPS = BigNumber.from(100)
const BPS = BigNumber.from(10000)
const PK_FILE = '/root/.novadex/smoke_pk'

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf8')
  return JSON.parse(raw)
}

function loadPrivateKey() {
  if (process.env.SMOKE_PRIVKEY?.trim()) {
    const raw = process.env.SMOKE_PRIVKEY.trim()
    return raw.startsWith('0x') ? raw : `0x${raw}`
  }
  if (fs.existsSync(PK_FILE)) {
    const key = fs.readFileSync(PK_FILE, 'utf8').trim()
    if (!key) return null
    return key.startsWith('0x') ? key : `0x${key}`
  }
  return null
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

function extractRevertData(error) {
  const candidates = [
    error?.data,
    error?.error?.data,
    error?.error?.error?.data,
    error?.error?.data?.data,
    error?.data?.data,
    error?.cause?.data,
    error?.info?.data,
    error?.info?.error?.data,
    error?.info?.error?.error?.data
  ]
  return candidates.find((candidate) => typeof candidate === 'string' && candidate.startsWith('0x')) || null
}

function applyFee(amount) {
  const fee = amount.mul(FEE_BPS).div(BPS)
  return { fee, net: amount.sub(fee) }
}

function applySlippage(amountOut) {
  return amountOut.mul(BigNumber.from(10000 - SLIPPAGE_BPS)).div(BPS)
}

async function ensureAllowance(token, owner, spender, amount) {
  const allowance = await token.allowance(owner, spender)
  if (allowance.gte(amount)) return
  if (!AUTO_APPROVE) {
    throw new Error('Allowance too low and SMOKE_AUTO_APPROVE=0')
  }
  const tx = await token.approve(spender, amount)
  console.log('[APPROVE] tx', tx.hash)
  const receipt = await tx.wait(1)
  console.log('[APPROVE] status', receipt.status)
  if (receipt.status !== 1) {
    throw new Error('Approve failed')
  }
}

async function simulateSwap(router, method, args, from) {
  try {
    await router.callStatic[method](...args, { from })
    return { ok: true }
  } catch (err) {
    const data = extractRevertData(err)
    return { ok: false, reason: decodeRevertData(data), raw: data }
  }
}

async function main() {
  const privKey = loadPrivateKey()
  if (!privKey) {
    console.log('[SKIP] SMOKE_PRIVKEY not set and /root/.novadex/smoke_pk not found')
    return
  }
  const config = loadConfig()
  const routerAddress = config.contracts.swapRouter || config.contracts.router
  const wnovaAddress = config.tokens.WNOVA.address
  const tonyAddress = config.tokens.TONY.address

  const provider = new JsonRpcProvider(RPC_URL)
  const wallet = new Wallet(privKey, provider)
  const from = await wallet.getAddress()

  const erc20Iface = new Interface([
    'function balanceOf(address) view returns (uint256)',
    'function allowance(address,address) view returns (uint256)',
    'function approve(address,uint256) returns (bool)',
    'function decimals() view returns (uint8)',
    'function symbol() view returns (string)'
  ])
  const routerIface = new Interface([
    'function getAmountsOut(uint256,address[]) view returns (uint256[])',
    'function swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'
  ])

  const wnova = new (await import('../dex-ui/node_modules/@ethersproject/contracts/lib/index.js')).Contract(
    wnovaAddress,
    erc20Iface,
    wallet
  )
  const tony = new (await import('../dex-ui/node_modules/@ethersproject/contracts/lib/index.js')).Contract(
    tonyAddress,
    erc20Iface,
    wallet
  )
  const router = new (await import('../dex-ui/node_modules/@ethersproject/contracts/lib/index.js')).Contract(
    routerAddress,
    routerIface,
    wallet
  )

  const amountInGross = parseUnits(SMOKE_AMOUNT_WNOVA, 18)
  const { fee, net } = applyFee(amountInGross)
  const path = [wnovaAddress, tonyAddress]
  const nowTs = Math.floor(Date.now() / 1000)
  const deadline = nowTs + DEADLINE_SECONDS

  const amountsOut = await router.getAmountsOut(net, path)
  const amountOut = BigNumber.from(amountsOut[1].toString())
  const minOut = applySlippage(amountOut)

  console.log('[SWAP 1] WNOVA -> TONY')
  console.log('[SWAP 1] deadline', { nowTs, deadline, delta: deadline - nowTs })
  console.log('[SWAP 1] amountInGross', amountInGross.toString())
  console.log('[SWAP 1] fee', fee.toString())
  console.log('[SWAP 1] amountInNet', net.toString())
  console.log('[SWAP 1] quoteOut', amountOut.toString())
  console.log('[SWAP 1] minOut', minOut.toString())
  console.log('[SWAP 1] slippageBps', SLIPPAGE_BPS)

  await ensureAllowance(wnova, from, routerAddress, amountInGross)
  const sim1 = await simulateSwap(router, 'swapExactTokensForTokens', [amountInGross, minOut, path, from, deadline], from)
  if (!sim1.ok) {
    console.error('[SWAP 1] simulate reverted', sim1.reason)
    process.exit(1)
  }
  const estimate1 = await router.estimateGas.swapExactTokensForTokens(amountInGross, minOut, path, from, deadline)
  const tx1 = await router.swapExactTokensForTokens(amountInGross, minOut, path, from, deadline, {
    gasLimit: estimate1.mul(12).div(10)
  })
  console.log('[SWAP 1] tx', tx1.hash)
  const receipt1 = await tx1.wait(1)
  console.log('[SWAP 1] status', receipt1.status)
  if (receipt1.status !== 1) {
    throw new Error('Swap 1 failed')
  }

  const tonyBal = await tony.balanceOf(from)
  const amountInTony = tonyBal.div(10)
  if (amountInTony.isZero()) {
    console.log('[SWAP 2] skip: no TONY balance')
    return
  }

  const pathBack = [tonyAddress, wnovaAddress]
  const amountsOutBack = await router.getAmountsOut(amountInTony, pathBack)
  const grossOutBack = BigNumber.from(amountsOutBack[1].toString())
  const outNetBack = applyFee(grossOutBack).net
  const minOutBack = applySlippage(outNetBack)
  const deadline2 = Math.floor(Date.now() / 1000) + DEADLINE_SECONDS

  console.log('[SWAP 2] TONY -> WNOVA')
  console.log('[SWAP 2] amountIn', amountInTony.toString())
  console.log('[SWAP 2] quoteOutGross', grossOutBack.toString())
  console.log('[SWAP 2] outNet', outNetBack.toString())
  console.log('[SWAP 2] minOut', minOutBack.toString())
  console.log('[SWAP 2] deadline', deadline2)

  await ensureAllowance(tony, from, routerAddress, amountInTony)
  const sim2 = await simulateSwap(router, 'swapExactTokensForTokens', [amountInTony, minOutBack, pathBack, from, deadline2], from)
  if (!sim2.ok) {
    console.error('[SWAP 2] simulate reverted', sim2.reason)
    process.exit(1)
  }
  const estimate2 = await router.estimateGas.swapExactTokensForTokens(amountInTony, minOutBack, pathBack, from, deadline2)
  const tx2 = await router.swapExactTokensForTokens(amountInTony, minOutBack, pathBack, from, deadline2, {
    gasLimit: estimate2.mul(12).div(10)
  })
  console.log('[SWAP 2] tx', tx2.hash)
  const receipt2 = await tx2.wait(1)
  console.log('[SWAP 2] status', receipt2.status)
  if (receipt2.status !== 1) {
    throw new Error('Swap 2 failed')
  }
}

main().catch(err => {
  const data = extractRevertData(err)
  if (data) {
    console.error('[ERROR] revert', decodeRevertData(data))
    console.error('[ERROR] raw', data)
  }
  console.error('[ERROR]', err.message || err)
  process.exit(1)
})
