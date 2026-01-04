#!/usr/bin/env node
const baseUrl = (process.env.METADATA_BASE_URL || 'https://dex.ethnova.net').replace(/\/$/, '')

const log = (msg) => process.stdout.write(`${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

async function main() {
  let statsOk = false
  let repoSize = 0
  let storageMax = 0
  let percent = -1

  const res = await fetch(`${baseUrl}/api/metadata/stats`)
  const text = await res.text()
  if (res.ok) {
    try {
      const data = JSON.parse(text)
      const ipfs = data?.ipfs || {}
      repoSize = Number(ipfs.repoSize || 0)
      storageMax = Number(ipfs.storageMax || 0)
      percent = Number(ipfs.percentUsed ?? -1)
      statsOk = true
    } catch {
      // fall through to fallback
    }
  } else {
    log(`[WARN] stats failed (${res.status}): ${text.slice(0, 120)}`)
  }

  if (!statsOk) {
    const ipfsApi = (process.env.IPFS_API_URL || 'http://127.0.0.1:5001').replace(/\/$/, '')
    try {
      const ipfsRes = await fetch(`${ipfsApi}/api/v0/repo/stat`, { method: 'POST' })
      const ipfsText = await ipfsRes.text()
      if (!ipfsRes.ok) {
        fail(`ipfs repo/stat failed: ${ipfsText.slice(0, 200)}`)
      }
      const ipfsData = JSON.parse(ipfsText)
      repoSize = Number(ipfsData?.RepoSize || 0)
      storageMax = Number(ipfsData?.StorageMax || 0)
      percent = storageMax > 0 ? Number(((repoSize / storageMax) * 100).toFixed(2)) : -1
      statsOk = true
      log('[WARN] using ipfs repo/stat fallback (metadata stats unavailable)')
    } catch (err) {
      fail(`ipfs fallback failed: ${err?.message || err}`)
    }
  }

  if (!storageMax || storageMax < 180 * 1000 * 1000 * 1000) {
    fail(`storageMax invalid or below 200GB: ${storageMax}`)
  }
  if (percent >= 99) {
    fail(`ipfs percentUsed too high: ${percent}%`)
  }
  log(`[OK] ipfs storageMax=${storageMax} repoSize=${repoSize} percent=${percent}`)
}

main().catch((err) => fail(err.message))
