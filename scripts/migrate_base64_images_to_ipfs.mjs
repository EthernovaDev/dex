#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'

const require = createRequire(new URL('../server/metadata-api/package.json', import.meta.url))
const Database = require('better-sqlite3')
const FormData = require('form-data')
const fetch = require('node-fetch')

const log = (msg) => process.stdout.write(`${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

function loadEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return
  const lines = fs.readFileSync(filePath, 'utf8').split('\n')
  lines.forEach((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return
    const idx = trimmed.indexOf('=')
    if (idx === -1) return
    const key = trimmed.slice(0, idx).trim()
    const value = trimmed.slice(idx + 1).trim()
    if (!process.env[key]) {
      process.env[key] = value
    }
  })
}

loadEnvFile(process.env.METADATA_ENV || '/etc/novadex/metadata.env')

const SQLITE_PATH = process.env.SQLITE_PATH || '/var/lib/novadex/metadata.db'
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/lib/novadex/uploads'
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001'
const IPFS_GATEWAY_BASE = (process.env.IPFS_GATEWAY_BASE || 'https://dex.ethnova.net/ipfs/').replace(/\/?$/, '/')

if (!fs.existsSync(SQLITE_PATH)) {
  fail(`SQLite DB not found at ${SQLITE_PATH}`)
}

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

async function pinFileToKubo(filePath, filename) {
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), filename)
  const headers = form.getHeaders()
  try {
    headers['content-length'] = String(form.getLengthSync())
  } catch {}
  const resp = await fetch(`${IPFS_API_URL}/api/v0/add?pin=true&wrap-with-directory=false`, {
    method: 'POST',
    body: form,
    headers,
  })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Kubo upload failed: ${text.slice(0, 200)}`)
  }
  const lines = text.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1]
  const data = JSON.parse(last)
  return data.Hash
}

async function pinInlineDataUri(dataUri) {
  if (!dataUri.startsWith('data:image/')) {
    throw new Error('Invalid data URI')
  }
  const [meta, encoded] = dataUri.split(',')
  if (!encoded) throw new Error('Invalid data URI encoding')
  const mimeMatch = meta.match(/data:(image\/[a-zA-Z0-9+.-]+);base64/)
  if (!mimeMatch) throw new Error('Invalid data URI mime')
  const ext = mimeMatch[1].split('/')[1] || 'png'
  const buffer = Buffer.from(encoded, 'base64')
  const tmpName = `migrate-${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`
  const tmpPath = path.join(UPLOAD_DIR, tmpName)
  fs.writeFileSync(tmpPath, buffer)
  try {
    const cid = await pinFileToKubo(tmpPath, tmpName)
    return { cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `${IPFS_GATEWAY_BASE}${cid}` }
  } finally {
    try {
      fs.unlinkSync(tmpPath)
    } catch {}
  }
}

async function main() {
  try {
    const resp = await fetch(`${IPFS_API_URL}/api/v0/version`, { method: 'POST' })
    if (!resp.ok) {
      const text = await resp.text()
      fail(`IPFS API not healthy: ${text.slice(0, 200)}`)
    }
  } catch (err) {
    fail(`IPFS API not reachable: ${err?.message || 'error'}`)
  }
  const db = new Database(SQLITE_PATH)
  const rows = db
    .prepare("SELECT address, image_uri FROM tokens WHERE image_uri LIKE 'data:image/%'")
    .all()
  if (!rows.length) {
    log('[OK] No base64 images found in tokens table')
    return
  }
  log(`[INFO] Found ${rows.length} token(s) with base64 images`)
  const update = db.prepare(
    'UPDATE tokens SET image_uri = ?, image_hash = ?, updated_at = ? WHERE address = ?'
  )
  const now = Math.floor(Date.now() / 1000)
  for (const row of rows) {
    const addr = row.address
    const image = row.image_uri
    try {
      const pinned = await pinInlineDataUri(image)
      update.run(pinned.ipfsUri, pinned.cid, now, addr)
      log(`[OK] ${addr} -> ${pinned.ipfsUri}`)
    } catch (err) {
      log(`[WARN] ${addr} failed: ${err.message || 'pin failed'}`)
    }
  }
  log('[DONE] Migration finished')
}

main().catch((err) => fail(err.message))
