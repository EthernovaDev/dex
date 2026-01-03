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

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return JSON.parse(text)
}

async function main() {
  const health = await fetchJson(`${baseUrl}/api/metadata/health`)
  if (!health?.ok) fail('metadata health failed')
  log(`[OK] health: pin=${health.pinProvider || 'none'} sqlite=${health.sqlite}`)

  if (wnova) {
    const wnovaMeta = await fetchJson(`${baseUrl}/api/metadata/token/${wnova}`)
    log(`[OK] token metadata GET: ${wnova} -> ${wnovaMeta?.missing ? 'missing' : 'present'}`)
  } else {
    warn('WNOVA address missing from config')
  }

  const priv = process.env.SMOKE_PRIVKEY
  const tokenAddress = process.env.SMOKE_TOKEN_ADDRESS
  const txHash = process.env.SMOKE_TOKEN_TX
  if (!priv || !tokenAddress || !txHash) {
    warn('SMOKE_PRIVKEY + SMOKE_TOKEN_ADDRESS + SMOKE_TOKEN_TX not set; skipping POST tests')
    return
  }

  const wallet = new ethers.Wallet(priv)
  const challenge = await fetchJson(`${baseUrl}/api/metadata/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address }),
  })
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

  const getToken = await fetchJson(`${baseUrl}/api/metadata/token/${tokenAddress}`)
  if (!getToken?.data) fail('token metadata not persisted')
  log('[OK] token metadata persisted')
}

main().catch((err) => fail(err.message))
