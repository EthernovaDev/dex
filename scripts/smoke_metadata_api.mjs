#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { ethers } from 'ethers'

const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const configPath = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const wnova = config?.tokens?.WNOVA?.address || ''

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

const getImageValue = (payload) => {
  if (!payload) return ''
  return (
    payload.image ||
    payload.image_uri ||
    payload?.data?.image ||
    payload?.data?.image_uri ||
    ''
  )
}

const assertNoBase64Image = (payload, label) => {
  const image = String(getImageValue(payload) || '')
  if (image.startsWith('data:image/')) {
    fail(`${label} contains base64 image (data:image/*)`)
  }
  if (image && !image.startsWith('ipfs://') && !image.includes('/ipfs/')) {
    warn(`${label} image is not ipfs/gateway: ${image.slice(0, 60)}`)
  }
}

const RETRY_STATUSES = new Set([429, 502, 503, 504])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(url, opts, label = 'request') {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const res = await fetch(url, opts)
      const text = await res.text()
      if (!res.ok) {
        if (RETRY_STATUSES.has(res.status)) {
          lastErr = new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
          await sleep(300 * attempt)
          continue
        }
        throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
      }
      return JSON.parse(text)
    } catch (err) {
      lastErr = err
      if (attempt < 3) {
        await sleep(300 * attempt)
        continue
      }
      break
    }
  }
  throw new Error(`${label} failed after retries: ${lastErr?.message || 'unknown error'}`)
}

async function main() {
  const health = await fetchJson(`${baseUrl}/api/metadata/health`, undefined, 'health')
  if (!health?.ok) fail('metadata health failed')
  log(`[OK] health: pin=${health.pinProvider || 'none'} sqlite=${health.sqlite}`)

  if (wnova) {
    const wnovaMeta = await fetchJson(`${baseUrl}/api/metadata/token/${wnova}`, undefined, 'get token metadata')
    log(`[OK] token metadata GET: ${wnova} -> ${wnovaMeta?.missing ? 'missing' : 'present'}`)
    assertNoBase64Image(wnovaMeta, 'wnova token metadata')
  } else {
    warn('WNOVA address missing from config')
  }

  const priv = process.env.SMOKE_PRIVKEY
  const tokenAddress = process.env.SMOKE_TOKEN_ADDRESS
  const txHash = process.env.SMOKE_TOKEN_TX
  const pairAddress = process.env.SMOKE_PAIR_ADDRESS
  if (!priv || !tokenAddress || !txHash) {
    warn('SMOKE_PRIVKEY + SMOKE_TOKEN_ADDRESS + SMOKE_TOKEN_TX not set; skipping POST tests')
    if (pairAddress) {
      const pairJson = await fetchJson(
        `${baseUrl}/api/metadata/json/pair/${pairAddress}`,
        undefined,
        'get pair metadata json'
      )
      const attrs = Array.isArray(pairJson?.attributes) ? pairJson.attributes : []
      const hasToken0 = attrs.some((a) => a?.trait_type === 'token0' && a?.value)
      const hasToken1 = attrs.some((a) => a?.trait_type === 'token1' && a?.value)
      if (!pairJson?.name || !pairJson?.symbol || !hasToken0 || !hasToken1) {
        fail('pair metadata JSON missing name/symbol/token0/token1')
      }
      assertNoBase64Image(pairJson, 'pair metadata json')
      log('[OK] pair metadata JSON present')
    }
    return
  }

  const wallet = new ethers.Wallet(priv)
  const challenge = await fetchJson(`${baseUrl}/api/metadata/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address }),
  }, 'challenge')
  if (!challenge?.message) fail('challenge failed')
  const signature = await wallet.signMessage(challenge.message)

  const form = new FormData()
  form.append('tokenAddress', tokenAddress)
  form.append('txHash', txHash)
  form.append('name', 'Smoke Token')
  form.append('symbol', 'SMOKE')
  form.append('description', 'Smoke metadata test')

  const resp = await fetch(`${baseUrl}/api/metadata/token`, {
    method: 'POST',
    headers: { 'x-address': wallet.address, 'x-signature': signature },
    body: form,
  })
  const text = await resp.text()
  if (!resp.ok) fail(`token POST failed: ${text.slice(0, 200)}`)
  log('[OK] token metadata POST')

  const getToken = await fetchJson(`${baseUrl}/api/metadata/token/${tokenAddress}`, undefined, 'get token metadata (persisted)')
  if (!getToken?.data) fail('token metadata not persisted')
  assertNoBase64Image(getToken, 'token metadata persisted')
  log('[OK] token metadata persisted')

  if (pairAddress) {
    const pairJson = await fetchJson(
      `${baseUrl}/api/metadata/json/pair/${pairAddress}`,
      undefined,
      'get pair metadata json'
    )
    const attrs = Array.isArray(pairJson?.attributes) ? pairJson.attributes : []
    const hasToken0 = attrs.some((a) => a?.trait_type === 'token0' && a?.value)
    const hasToken1 = attrs.some((a) => a?.trait_type === 'token1' && a?.value)
    if (!pairJson?.name || !pairJson?.symbol || !hasToken0 || !hasToken1) {
      fail('pair metadata JSON missing name/symbol/token0/token1')
    }
    assertNoBase64Image(pairJson, 'pair metadata json')
    log('[OK] pair metadata JSON present')
  }
}

main().catch((err) => fail(err.message))
