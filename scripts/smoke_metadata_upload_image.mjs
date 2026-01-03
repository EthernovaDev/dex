#!/usr/bin/env node
import fs from 'fs'
import { ethers } from 'ethers'

const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const priv = process.env.SMOKE_PRIVKEY
const tokenAddress = process.env.SMOKE_TOKEN_ADDRESS
const txHash = process.env.SMOKE_TOKEN_TX

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`)
  return JSON.parse(text)
}

async function main() {
  if (!priv || !tokenAddress || !txHash) {
    warn('SMOKE_PRIVKEY + SMOKE_TOKEN_ADDRESS + SMOKE_TOKEN_TX not set; skipping image upload test')
    return
  }

  const wallet = new ethers.Wallet(priv)
  const challenge = await fetchJson(`${baseUrl}/api/metadata/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address }),
  })
  const signature = await wallet.signMessage(challenge.message)

  const pngData = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAv4B0w0X4csAAAAASUVORK5CYII=',
    'base64'
  )
  const blob = new Blob([pngData], { type: 'image/png' })
  const form = new FormData()
  form.append('tokenAddress', tokenAddress)
  form.append('txHash', txHash)
  form.append('name', 'Smoke Token')
  form.append('symbol', 'SMK')
  form.append('logo', blob, 'logo.png')

  const resp = await fetch(`${baseUrl}/api/metadata/token`, {
    method: 'POST',
    headers: { 'x-address': wallet.address, 'x-signature': signature },
    body: form,
  })
  const text = await resp.text()
  if (!resp.ok) fail(`image upload failed: ${text.slice(0, 200)}`)
  log('[OK] image upload metadata POST')
}

main().catch((err) => fail(err.message))
