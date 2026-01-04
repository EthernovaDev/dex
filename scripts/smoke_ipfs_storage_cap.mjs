#!/usr/bin/env node
const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')

const log = (msg) => process.stdout.write(`${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

async function main() {
  const res = await fetch(`${baseUrl}/api/metadata/stats`)
  const text = await res.text()
  if (!res.ok) fail(`stats failed: ${text.slice(0, 200)}`)
  let data
  try {
    data = JSON.parse(text)
  } catch {
    fail('stats response not JSON')
  }
  const ipfs = data?.ipfs || {}
  const repoSize = Number(ipfs.repoSize || 0)
  const storageMax = Number(ipfs.storageMax || 0)
  const percent = Number(ipfs.percentUsed ?? -1)
  if (!storageMax || storageMax < 180 * 1000 * 1000 * 1000) {
    fail(`storageMax invalid or below 200GB: ${storageMax}`)
  }
  if (percent >= 99) {
    fail(`ipfs percentUsed too high: ${percent}%`)
  }
  log(`[OK] ipfs storageMax=${storageMax} repoSize=${repoSize} percent=${percent}`)
}

main().catch((err) => fail(err.message))
