#!/usr/bin/env node
import fs from 'fs'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
const { ethers } = require('ethers')

const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const priv = process.env.SMOKE_PRIVKEY
const autoApprove = process.env.SMOKE_AUTO_APPROVE !== '0'
const amountWnova = process.env.SMOKE_AMOUNT_WNOVA || '0.1'
const tokenAmountStr = process.env.SMOKE_TOKEN_AMOUNT || '1000'
const supplyStr = process.env.SMOKE_TOTAL_SUPPLY || '1000000'
const existingToken = process.env.SMOKE_TOKEN_ADDRESS
const existingPair = process.env.SMOKE_PAIR_ADDRESS
const providedTxHash = process.env.SMOKE_TX_HASH

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

const getImageValue = (payload) => payload?.image || payload?.image_uri || ''
const ipfsGatewayBase = (process.env.IPFS_GATEWAY_BASE || 'https://dex.ethnova.net/ipfs/').replace(/\/?$/, '/')

const assertNoBase64Image = async (payload, label) => {
  const image = String(getImageValue(payload) || '')
  if (image.startsWith('data:image/')) {
    fail(`${label} contains base64 image (data:image/*)`)
  }
  if (!image) return
  if (image.startsWith('ipfs://')) {
    const cid = image.replace('ipfs://', '')
    const gatewayUrl = `${ipfsGatewayBase}${cid}`
    try {
      const res = await fetch(gatewayUrl, { method: 'HEAD' })
      if (!res.ok) {
        warn(`${label} gateway HEAD failed: ${gatewayUrl} (${res.status})`)
      }
    } catch (err) {
      warn(`${label} gateway HEAD failed: ${gatewayUrl} (${err?.message || 'error'})`)
    }
    return
  }
  if (!image.includes('/ipfs/')) {
    warn(`${label} image is not ipfs/gateway: ${image.slice(0, 60)}`)
  }
}

const configPath = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const deploymentsPath = '/opt/novadex/contracts/deployments.json'
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const deployments = fs.existsSync(deploymentsPath)
  ? JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
  : {}

const rpcUrl = process.env.RPC_URL || config?.rpcUrl || 'https://rpc.ethnova.net'
const tokenFactory = config?.contracts?.tokenFactory || deployments?.addresses?.tokenFactory
const wnova = config?.tokens?.WNOVA?.address || deployments?.addresses?.wnova
const registryAddress = config?.contracts?.metadataRegistry || deployments?.addresses?.metadataRegistry

const TOKEN_FACTORY_ABI = [
  'function createTokenAndLaunch(string name,string symbol,uint8 decimals,uint256 totalSupply,uint256 tokenAmount,uint256 wnovaAmount,address to,uint256 deadline) returns (address token,address pair,uint256 liquidity)',
  'event TokenCreated(address indexed creator,address indexed token,string name,string symbol,uint8 decimals,uint256 totalSupply)',
  'event TokenLaunched(address indexed creator,address indexed token,address indexed pair,uint256 wnovaAmount,uint256 tokenAmount)'
]

const REGISTRY_ABI = [
  'function tokenURI(address) view returns (string)',
  'function pairURI(address) view returns (string)',
  'function setTokenURI(address token,string uri,bytes32 contentHash)',
  'function setPairURI(address pair,string uri,bytes32 contentHash)'
]

const ERC20_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)',
  'function balanceOf(address owner) view returns (uint256)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function deposit() payable'
]

const PAIR_ABI = ['function getReserves() view returns (uint112,uint112,uint32)']

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(text || `HTTP ${res.status}`)
  }
  return JSON.parse(text)
}

async function fetchSignatureHeaders(account, signer) {
  const challenge = await fetchJson(`${baseUrl}/api/metadata/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account })
  })
  if (!challenge?.message) throw new Error('challenge failed')
  const signature = await signer.signMessage(challenge.message)
  return {
    'x-address': account,
    'x-signature': signature
  }
}

async function main() {
  if (!priv) {
    warn('SMOKE_PRIVKEY not set; skipping e2e metadata create')
    return
  }
  if (!tokenFactory || !wnova) {
    fail('TokenFactory or WNOVA address missing in config')
  }

  const JsonRpcProvider = ethers.providers?.JsonRpcProvider || ethers.JsonRpcProvider
  if (!JsonRpcProvider) {
    fail('JsonRpcProvider not available from ethers')
  }
  const provider = new JsonRpcProvider(rpcUrl)
  const Wallet = ethers.Wallet || ethers.Wallet
  const wallet = new Wallet(priv, provider)

  const wnovaContract = new ethers.Contract(wnova, ERC20_ABI, wallet)
  const factory = new ethers.Contract(tokenFactory, TOKEN_FACTORY_ABI, wallet)

  const decimals = 18
  const parseUnits = ethers.utils?.parseUnits || ethers.parseUnits
  const totalSupply = parseUnits(supplyStr, decimals)
  const tokenAmount = parseUnits(tokenAmountStr, decimals)
  const wnovaAmount = parseUnits(amountWnova, decimals)

  let tokenAddress = existingToken || ''
  let pairAddress = existingPair || ''
  let createTxHash = ''
  let name = ''
  let symbol = ''
  if (tokenAddress && pairAddress) {
    log(`[INFO] using existing token/pair: ${tokenAddress} / ${pairAddress}`)
    try {
      const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
      name = await tokenContract.name()
      symbol = await tokenContract.symbol()
    } catch {
      name = `Smoke Token ${Date.now()}`
      symbol = `SMK${Date.now().toString().slice(-4)}`
    }
  } else {
    const wnovaBalance = await wnovaContract.balanceOf(wallet.address)
    const needsWrap =
      typeof wnovaBalance === 'bigint'
        ? wnovaBalance < wnovaAmount
        : wnovaBalance.lt(wnovaAmount)
    if (needsWrap) {
      const wrapAmount =
        typeof wnovaBalance === 'bigint'
          ? wnovaAmount - wnovaBalance
          : wnovaAmount.sub(wnovaBalance)
      log(`[INFO] wrapping NOVA -> WNOVA: ${wrapAmount.toString()}`)
      const wrapTx = await wnovaContract.deposit({ value: wrapAmount })
      log(`[INFO] wrap tx: ${wrapTx.hash}`)
      await wrapTx.wait(1)
    }

    const allowance = await wnovaContract.allowance(wallet.address, tokenFactory)
    const needsApproval =
      typeof allowance === 'bigint'
        ? allowance < wnovaAmount
        : allowance.lt(wnovaAmount)
    if (needsApproval) {
      if (!autoApprove) {
        fail('WNOVA allowance too low and SMOKE_AUTO_APPROVE=0')
      }
      const maxUint = ethers.constants?.MaxUint256 || ethers.MaxUint256
      const approveTx = await wnovaContract.approve(tokenFactory, maxUint)
      log(`[INFO] approve tx: ${approveTx.hash}`)
      await approveTx.wait(1)
    }

    name = `Smoke Token ${Date.now()}`
    symbol = `SMK${Date.now().toString().slice(-4)}`
    const deadline = Math.floor(Date.now() / 1000) + 1200

    log('[INFO] creating token + launch...')
    const tx = await factory.createTokenAndLaunch(
      name,
      symbol,
      decimals,
      totalSupply,
      tokenAmount,
      wnovaAmount,
      wallet.address,
      deadline
    )
    log(`[INFO] create tx: ${tx.hash}`)
    createTxHash = tx.hash
    const receipt = await tx.wait(1)
    if (receipt.status !== 1) {
      fail(`create tx failed: ${tx.hash}`)
    }

    const iface = new (ethers.utils?.Interface || ethers.Interface)(TOKEN_FACTORY_ABI)
    for (const logEntry of receipt.logs) {
      if (logEntry.address.toLowerCase() !== tokenFactory.toLowerCase()) continue
      try {
        const parsed = iface.parseLog(logEntry)
        if (parsed?.name === 'TokenCreated') {
          tokenAddress = parsed.args.token
        }
        if (parsed?.name === 'TokenLaunched') {
          pairAddress = parsed.args.pair
        }
      } catch {
        // ignore
      }
    }
    if (!tokenAddress || !pairAddress) {
      fail('Token or pair not found in receipt logs')
    }
    log(`[OK] token=${tokenAddress} pair=${pairAddress}`)
  }

  const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, provider)
  const reserves = await pairContract.getReserves()
  const reserve0Zero =
    typeof reserves?.[0] === 'bigint'
      ? reserves[0] === 0n
      : reserves?.[0]?.isZero?.()
  const reserve1Zero =
    typeof reserves?.[1] === 'bigint'
      ? reserves[1] === 0n
      : reserves?.[1]?.isZero?.()
  if (!reserves || (reserve0Zero && reserve1Zero)) {
    warn('Pair reserves are zero; autolist may have failed')
  } else {
    log(`[OK] reserves: ${reserves[0].toString()} / ${reserves[1].toString()}`)
  }

  const headers = await fetchSignatureHeaders(wallet.address, wallet)
  const dataUrlLogo =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAv4B0w0X4csAAAAASUVORK5CYII='

  const form = new FormData()
  form.append('tokenAddress', tokenAddress)
  const finalTxHash = createTxHash || providedTxHash
  if (finalTxHash) {
    form.append('txHash', finalTxHash)
  }
  form.append('name', name)
  form.append('symbol', symbol)
  form.append('description', 'Smoke E2E metadata test')
  form.append('website', 'https://dex.ethnova.net')
  form.append('twitter', 'https://x.com/ethernova')
  form.append('telegram', 'https://t.me/ethernova')
  form.append('discord', 'https://discord.gg/ethernova')
  form.append('logoUrl', dataUrlLogo)

  const tokenResp = await fetch(`${baseUrl}/api/metadata/token`, {
    method: 'POST',
    headers,
    body: form
  })
  const tokenText = await tokenResp.text()
  if (!tokenResp.ok) {
    fail(`metadata token POST failed: ${tokenText.slice(0, 200)}`)
  }
  const tokenJson = JSON.parse(tokenText)
  const metadataUri = tokenJson?.metadataUri || tokenJson?.data?.metadata_uri
  const contentHash = tokenJson?.contentHash || tokenJson?.data?.content_hash
  if (!metadataUri) {
    fail('metadataUri missing from metadata response')
  }
  log(`[OK] metadataUri=${metadataUri}`)

  const pairHeaders = await fetchSignatureHeaders(wallet.address, wallet)
  const pairResp = await fetch(`${baseUrl}/api/metadata/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...pairHeaders },
    body: JSON.stringify({
      pairAddress,
      txHash: finalTxHash || undefined,
      metadataUri,
      contentHash
    })
  })
  const pairText = await pairResp.text()
  if (!pairResp.ok) {
    fail(`metadata pair POST failed: ${pairText.slice(0, 200)}`)
  }
  log('[OK] pair metadata saved')

  if (registryAddress) {
    const hashZero = ethers.constants?.HashZero || ethers.ZeroHash
    const registry = new ethers.Contract(registryAddress, REGISTRY_ABI, wallet)
    const setTokenTx = await registry.setTokenURI(
      tokenAddress,
      metadataUri,
      contentHash || hashZero
    )
    log(`[INFO] setTokenURI tx: ${setTokenTx.hash}`)
    await setTokenTx.wait(1)
    const setPairTx = await registry.setPairURI(
      pairAddress,
      metadataUri,
      contentHash || hashZero
    )
    log(`[INFO] setPairURI tx: ${setPairTx.hash}`)
    await setPairTx.wait(1)
    const onchainTokenUri = await registry.tokenURI(tokenAddress)
    const onchainPairUri = await registry.pairURI(pairAddress)
    if (onchainTokenUri !== metadataUri) fail('tokenURI mismatch')
    if (onchainPairUri !== metadataUri) fail('pairURI mismatch')
    log('[OK] registry tokenURI/pairURI set')
  } else {
    warn('metadataRegistry not configured; skipping on-chain set')
  }

  const jsonResp = await fetch(`${baseUrl}/api/metadata/json/token/${tokenAddress}`)
  if (!jsonResp.ok) {
    fail('metadata JSON endpoint failed')
  }
  const json = await jsonResp.json()
  if (!json?.name || !json?.symbol) {
    fail('metadata JSON missing name/symbol')
  }
  await assertNoBase64Image(json, 'token metadata JSON')
  log('[OK] metadata JSON accessible')

  const pairJsonResp = await fetch(`${baseUrl}/api/metadata/json/pair/${pairAddress}`)
  if (!pairJsonResp.ok) {
    fail('pair metadata JSON endpoint failed')
  }
  const pairJson = await pairJsonResp.json()
  if (!pairJson?.name || !pairJson?.symbol) {
    fail('pair metadata JSON missing name/symbol')
  }
  await assertNoBase64Image(pairJson, 'pair metadata JSON')
  log('[OK] pair metadata JSON accessible')

  if (createTxHash) {
    log(`[DONE] tx=${createTxHash} token=${tokenAddress} pair=${pairAddress}`)
  } else {
    log(`[DONE] token=${tokenAddress} pair=${pairAddress}`)
  }
}

main().catch((err) => fail(err.message))
