#!/usr/bin/env node
import { ethers } from 'ethers'

const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const rawLimitMb = Number(process.env.MAX_UPLOAD_MB || 5)
const payloadBytes = Math.floor(rawLimitMb * 1024 * 1024 + 1024)

const log = (msg) => process.stdout.write(`${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // ignore
  }
  return { res, text, json }
}

async function main() {
  const wallet = ethers.Wallet.createRandom()
  const challenge = await fetchJson(`${baseUrl}/api/metadata/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: wallet.address })
  })
  if (challenge.res.status === 429) {
    log(`[WARN] challenge rate-limited; skipping metadata limits smoke: ${challenge.text.slice(0, 200)}`)
    return
  }
  if (!challenge.res.ok || !challenge.json?.message) {
    fail(`challenge failed: ${challenge.text.slice(0, 200)}`)
  }
  const signature = await wallet.signMessage(challenge.json.message)

  const blob = new Blob([Buffer.alloc(payloadBytes, 1)], { type: 'image/png' })
  const form = new FormData()
  form.append('image', blob, 'too-big.png')

  const resp = await fetch(`${baseUrl}/api/metadata/image`, {
    method: 'POST',
    headers: { 'x-address': wallet.address, 'x-signature': signature },
    body: form
  })
  const text = await resp.text()
  if (resp.ok) {
    fail('expected oversized upload to be rejected, but succeeded')
  }
  if (![400, 413, 429, 507].includes(resp.status)) {
    fail(`unexpected status for oversized upload: ${resp.status} ${text.slice(0, 200)}`)
  }
  log(`[OK] oversized upload rejected (${resp.status})`)
}

main().catch((err) => fail(err.message))
