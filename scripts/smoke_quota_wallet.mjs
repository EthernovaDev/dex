#!/usr/bin/env node
import { ethers } from 'ethers'

const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const attempts = Number(process.env.SMOKE_QUOTA_ATTEMPTS || 11)
const expectedLimit = Number(process.env.SMOKE_QUOTA_LIMIT || 10)
const tokenAddress = (process.env.SMOKE_QUOTA_TOKEN || '0x0000000000000000000000000000000000000001').toLowerCase()

const log = (msg) => process.stdout.write(`${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function fetchJson(url, opts, label) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {
    // ignore parse errors for error bodies
  }
  return { res, text, json }
}

async function signHeaders(wallet) {
  const { res, json, text } = await fetchJson(
    `${baseUrl}/api/metadata/challenge`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: wallet.address })
    },
    'challenge'
  )
  if (!res.ok || !json?.message) {
    throw new Error(`challenge failed: ${text.slice(0, 200)}`)
  }
  const signature = await wallet.signMessage(json.message)
  return { 'x-address': wallet.address, 'x-signature': signature }
}

async function main() {
  const wallet = ethers.Wallet.createRandom()
  let hitLimit = false

  for (let i = 1; i <= attempts; i += 1) {
    const headers = await signHeaders(wallet)
    const payload = {
      token: tokenAddress,
      creator: wallet.address,
      name: `Smoke Token ${i}`,
      symbol: `SMK${i}`,
      description: 'Quota smoke test'
    }
    const { res, text } = await fetchJson(
      `${baseUrl}/api/metadata/publish`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify(payload)
      },
      'publish'
    )
    if (res.status === 429) {
      hitLimit = true
      const msg = text.slice(0, 200)
      const isIpLimit = /IP publish limit|IP request limit|IP bytes limit|Rate limit exceeded/i.test(msg)
      if (i <= expectedLimit && !isIpLimit) {
        fail(`quota triggered too early on attempt ${i}: ${msg}`)
      }
      if (isIpLimit && i <= expectedLimit) {
        log(`[OK] quota triggered by IP limit on attempt ${i} (acceptable)`)
      } else {
        log(`[OK] quota limit triggered on attempt ${i}`)
      }
      break
    }
    if (!res.ok) {
      fail(`publish failed on attempt ${i}: ${text.slice(0, 200)}`)
    }
    await sleep(100)
  }

  if (!hitLimit && attempts >= expectedLimit + 1) {
    fail(`quota limit not triggered after ${attempts} attempts`)
  }

  log('[OK] quota wallet limit enforced')
}

main().catch((err) => fail(err.message))
