#!/usr/bin/env node
import { ethers } from 'ethers'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)
let sharp
try {
  sharp = require('../server/metadata-api/node_modules/sharp')
} catch (err) {
  console.error('[ERROR] sharp not found. Run npm install in server/metadata-api.')
  process.exit(1)
}

const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const ipfsGatewayBase = (process.env.IPFS_GATEWAY_BASE || 'https://dex.ethnova.net/ipfs/').replace(/\/?$/, '/')

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
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
  const wallet = ethers.Wallet.createRandom()
  let challenge
  try {
    challenge = await fetchJson(
      `${baseUrl}/api/metadata/challenge`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address: wallet.address })
      },
      'challenge'
    )
  } catch (err) {
    const msg = String(err?.message || '')
    if (/HTTP 429|rate limit/i.test(msg)) {
      log(`[WARN] challenge rate-limited; skipping image upload smoke: ${msg.slice(0, 200)}`)
      return
    }
    throw err
  }
  const signature = await wallet.signMessage(challenge.message)

  const pngData = await sharp({
    create: {
      width: 1600,
      height: 1600,
      channels: 3,
      background: { r: 140, g: 30, b: 200 }
    }
  }).png().toBuffer()

  const form = new FormData()
  form.append('image', new Blob([pngData], { type: 'image/png' }), 'smoke.png')

  const resp = await fetch(`${baseUrl}/api/metadata/image`, {
    method: 'POST',
    headers: { 'x-address': wallet.address, 'x-signature': signature },
    body: form
  })
  const text = await resp.text()
  if (!resp.ok) {
    const msg = text.slice(0, 200)
    if (resp.status === 429 && /IP publish limit|IP request limit|IP bytes limit/i.test(msg)) {
      warn(`image upload blocked by IP limit (acceptable for smoke): ${msg}`)
      process.exit(0)
    }
    fail(`image upload failed: ${msg}`)
  }
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('image upload response is not JSON')
  }
  const imageUri = parsed?.ipfsUri || parsed?.imageUri || ''
  if (!imageUri) {
    fail('image upload did not return image uri')
  }
  if (String(imageUri).startsWith('data:image/')) {
    fail('image upload returned base64 image')
  }
  if (String(imageUri).startsWith('ipfs://')) {
    const cid = String(imageUri).replace('ipfs://', '')
    const gatewayUrl = `${ipfsGatewayBase}${cid}`
    const headResp = await fetch(gatewayUrl, { method: 'HEAD' })
    if (!headResp.ok) {
      fail(`image gateway HEAD failed: ${gatewayUrl} (${headResp.status})`)
    }
  } else if (!String(imageUri).includes('/ipfs/')) {
    warn(`image upload returned non-ipfs image: ${String(imageUri).slice(0, 60)}`)
  }
  log('[OK] image upload metadata POST')
}

main().catch((err) => fail(err.message))
