const express = require('express')
const cors = require('cors')
const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const Database = require('better-sqlite3')
const fetch = require('node-fetch')
const FormData = require('form-data')
const { ethers } = require('ethers')

const app = express()

const CONFIG_PATH = path.join(__dirname, '../../dex-ui/public/ethernova.config.json')
const config = fs.existsSync(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : {}

const HOST = process.env.HOST || '127.0.0.1'
const PORT = Number(process.env.PORT || 9099)
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || 'https://dex.ethnova.net'
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://dex.ethnova.net').replace(/\/+$/, '')
const SQLITE_PATH = process.env.SQLITE_PATH || '/var/lib/novadex/metadata.db'
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/lib/novadex/uploads'
const PIN_PROVIDER = (process.env.PIN_PROVIDER || '').toLowerCase()
const PINATA_JWT = process.env.PINATA_JWT || ''
const IPFS_API_URL = process.env.IPFS_API_URL || 'http://127.0.0.1:5001'
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || ''
const IPFS_GATEWAY_BASE = (process.env.IPFS_GATEWAY_BASE || IPFS_GATEWAY || `${PUBLIC_BASE_URL}/ipfs/`).replace(/\/?$/, '/')
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 2)
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 60)
const NONCE_TTL_SECONDS = Number(process.env.NONCE_TTL_SECONDS || 600)
const RPC_URL = process.env.RPC_URL || config?.rpcUrl
const TOKEN_FACTORY = (process.env.TOKEN_FACTORY || config?.contracts?.tokenFactory || '').toLowerCase()
const WNOVA = (process.env.WNOVA || config?.tokens?.WNOVA?.address || '').toLowerCase()
const START_BLOCK = Number(process.env.START_BLOCK || config?.startBlock || 0)
const REGISTRY_ADDRESS = (process.env.METADATA_REGISTRY || config?.contracts?.metadataRegistry || '').toLowerCase()
const REGISTRY_REGISTRAR_KEY = process.env.REGISTRY_REGISTRAR_KEY || ''

if (!RPC_URL) {
  console.error('[metadata-api] Missing RPC_URL')
  process.exit(1)
}

if (!fs.existsSync(path.dirname(SQLITE_PATH))) {
  fs.mkdirSync(path.dirname(SQLITE_PATH), { recursive: true })
}
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
}

const db = new Database(SQLITE_PATH)

db.exec(`
  CREATE TABLE IF NOT EXISTS tokens (
    address TEXT PRIMARY KEY,
    creator TEXT,
    metadata_uri TEXT,
    image_uri TEXT,
    name TEXT,
    symbol TEXT,
    description TEXT,
    website TEXT,
    twitter TEXT,
    telegram TEXT,
    discord TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS pairs (
    address TEXT PRIMARY KEY,
    token0 TEXT,
    token1 TEXT,
    creator TEXT,
    metadata_uri TEXT,
    content_hash TEXT,
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS nonces (
    address TEXT PRIMARY KEY,
    nonce TEXT,
    created_at INTEGER
  );
`)

function ensureColumn(table, column, type) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all()
  if (!columns.find((col) => col.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
  }
}

ensureColumn('tokens', 'content_hash', 'TEXT')
ensureColumn('tokens', 'image_hash', 'TEXT')
ensureColumn('pairs', 'content_hash', 'TEXT')

const provider = new ethers.providers.JsonRpcProvider(RPC_URL)

const TOKEN_FACTORY_ABI = [
  'event TokenCreated(address indexed creator,address indexed token,string name,string symbol,uint8 decimals,uint256 totalSupply)',
  'event TokenLaunched(address indexed creator,address indexed token,address indexed pair,uint256 wnovaAmount,uint256 tokenAmount)',
]
const tokenFactoryIface = new ethers.utils.Interface(TOKEN_FACTORY_ABI)

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
]

const REGISTRY_ABI = [
  'function registerToken(address token,address creator)',
  'function registerPair(address pair,address creator)',
  'function creatorOfToken(address token) view returns (address)',
  'function creatorOfPair(address pair) view returns (address)',
]

const rateBuckets = new Map()

function normAddr(value) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isHexAddress(value) {
  return /^0x[0-9a-fA-F]{40}$/.test(value || '')
}

function isHexHash(value) {
  return /^0x[0-9a-fA-F]{64}$/.test(value || '')
}

function clampString(value, max) {
  if (!value) return ''
  const str = String(value)
  return str.length > max ? str.slice(0, max) : str
}

function validateUrl(value) {
  if (!value) return ''
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.toString()
  } catch {
    return ''
  }
}

function validateImageUri(value) {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('ipfs://')) return trimmed
  return validateUrl(trimmed)
}

function sanitizeImageUri(value) {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed || trimmed.startsWith('data:image/')) return ''
  return trimmed
}

async function pinRemoteImage(url) {
  const safeUrl = validateUrl(url)
  if (!safeUrl) throw new Error('Invalid image URL')
  const resp = await fetch(safeUrl)
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Image fetch failed: ${text.slice(0, 200)}`)
  }
  const contentType = (resp.headers.get('content-type') || '').toLowerCase()
  if (!contentType.startsWith('image/')) {
    throw new Error('Image URL is not an image')
  }
  const maxBytes = MAX_UPLOAD_MB * 1024 * 1024
  const contentLength = Number(resp.headers.get('content-length') || 0)
  if (contentLength && contentLength > maxBytes) {
    throw new Error('Image exceeds size limit')
  }
  const buffer = Buffer.from(await resp.arrayBuffer())
  if (buffer.length > maxBytes) {
    throw new Error('Image exceeds size limit')
  }
  const ext = contentType.split('/')[1] || 'png'
  const tmpName = `remote-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`
  const tmpPath = path.join(UPLOAD_DIR, tmpName)
  fs.writeFileSync(tmpPath, buffer)
  try {
    const cid = await pinFileToIPFS(tmpPath, tmpName)
    return { cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `${IPFS_GATEWAY_BASE}${cid}` }
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

async function normalizeImageUri(value) {
  if (!value) return ''
  const trimmed = String(value).trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:image/')) {
    const pinned = await pinInlineDataUri(trimmed)
    return pinned.ipfsUri || pinned.gatewayUrl
  }
  if (trimmed.startsWith('ipfs://') || trimmed.includes('/ipfs/')) {
    return trimmed
  }
  const pinned = await pinRemoteImage(trimmed)
  return pinned.ipfsUri || pinned.gatewayUrl
}

function validateLogo(value, maxLength = 200000) {
  if (!value) return ''
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:image/')) {
    return trimmed.length <= maxLength ? trimmed : ''
  }
  return validateImageUri(trimmed)
}

async function pinInlineDataUri(dataUri) {
  if (!dataUri || !dataUri.startsWith('data:image/')) {
    throw new Error('Invalid inline image data')
  }
  const [meta, encoded] = dataUri.split(',')
  if (!encoded) throw new Error('Invalid data URI encoding')
  const mimeMatch = meta.match(/data:(image\/[a-zA-Z0-9+.-]+);base64/)
  if (!mimeMatch) throw new Error('Invalid data URI mime')
  const ext = mimeMatch[1].split('/')[1] || 'png'
  const buffer = Buffer.from(encoded, 'base64')
  const tmpName = `inline-${Date.now()}.${ext}`
  const tmpPath = path.join(UPLOAD_DIR, tmpName)
  fs.writeFileSync(tmpPath, buffer)
  try {
    const cid = await pinFileToIPFS(tmpPath, tmpName)
    return { cid, ipfsUri: `ipfs://${cid}`, gatewayUrl: `${IPFS_GATEWAY_BASE}${cid}` }
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

function rateLimit(req, res, next) {
  const now = Date.now()
  const key = req.ip || req.connection?.remoteAddress || 'unknown'
  const bucket = rateBuckets.get(key) || { ts: now, count: 0 }
  if (now - bucket.ts > 60_000) {
    bucket.ts = now
    bucket.count = 0
  }
  bucket.count += 1
  rateBuckets.set(key, bucket)
  if (bucket.count > RATE_LIMIT_PER_MIN) {
    res.status(429).json({ ok: false, error: 'Rate limit exceeded' })
    return
  }
  next()
}

function buildMessage(address, nonce, timestamp) {
  return `NovaDEX Metadata Update\naddress: ${address}\nnonce: ${nonce}\ntimestamp: ${timestamp}`
}

function createNonce() {
  return crypto.randomBytes(16).toString('hex')
}

function getNonce(address) {
  return db.prepare('SELECT nonce, created_at FROM nonces WHERE address = ?').get(address)
}

function setNonce(address, nonce) {
  db.prepare('INSERT OR REPLACE INTO nonces(address, nonce, created_at) VALUES (?, ?, ?)').run(
    address,
    nonce,
    Math.floor(Date.now() / 1000)
  )
}

function clearNonce(address) {
  db.prepare('DELETE FROM nonces WHERE address = ?').run(address)
}

function verifySignature(address, signature) {
  const record = getNonce(address)
  if (!record) throw new Error('No challenge for address')
  const age = Math.floor(Date.now() / 1000) - record.created_at
  if (age > NONCE_TTL_SECONDS) {
    clearNonce(address)
    throw new Error('Challenge expired')
  }
  const message = buildMessage(address, record.nonce, record.created_at)
  const recovered = ethers.utils.verifyMessage(message, signature)
  if (normAddr(recovered) !== normAddr(address)) {
    throw new Error('Signature mismatch')
  }
  clearNonce(address)
  return { recovered, message }
}

function authGuard(req, res, next) {
  try {
    const addr = normAddr(req.headers['x-address'] || '')
    const sig = req.headers['x-signature']
    if (!addr || !sig) {
      res.status(401).json({ ok: false, error: 'Missing signature' })
      return
    }
    const { recovered } = verifySignature(addr, sig)
    req.auth = { address: normAddr(recovered) }
    next()
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || 'Invalid signature' })
  }
}

async function verifyTokenTx(txHash, tokenAddress) {
  if (!TOKEN_FACTORY) throw new Error('TokenFactory not configured')
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) throw new Error('Transaction not found')
  if (receipt.status !== 1) throw new Error('Transaction failed')
  const tokenLower = normAddr(tokenAddress)
  for (const log of receipt.logs) {
    if (normAddr(log.address) !== TOKEN_FACTORY) continue
    try {
      const parsed = tokenFactoryIface.parseLog(log)
      if (parsed?.name === 'TokenCreated') {
        const token = normAddr(parsed.args.token)
        if (!tokenLower || token === tokenLower) {
          return {
            creator: normAddr(parsed.args.creator),
            token,
            name: parsed.args.name,
            symbol: parsed.args.symbol,
            decimals: Number(parsed.args.decimals),
            totalSupply: parsed.args.totalSupply?.toString?.() || undefined,
          }
        }
      }
    } catch {
      // ignore
    }
  }
  throw new Error('TokenCreated not found in tx')
}

async function verifyPairTx(txHash, pairAddress) {
  if (!TOKEN_FACTORY) throw new Error('TokenFactory not configured')
  const receipt = await provider.getTransactionReceipt(txHash)
  if (!receipt) throw new Error('Transaction not found')
  if (receipt.status !== 1) throw new Error('Transaction failed')
  const pairLower = normAddr(pairAddress)
  for (const log of receipt.logs) {
    if (normAddr(log.address) !== TOKEN_FACTORY) continue
    try {
      const parsed = tokenFactoryIface.parseLog(log)
      if (parsed?.name === 'TokenLaunched') {
        const pair = normAddr(parsed.args.pair)
        if (!pairLower || pair === pairLower) {
          return {
            creator: normAddr(parsed.args.creator),
            pair,
            token: normAddr(parsed.args.token),
          }
        }
      }
    } catch {
      // ignore
    }
  }
  throw new Error('TokenLaunched not found in tx')
}

async function verifyPairOnchain(pairAddress, token0, token1) {
  const code = await provider.getCode(pairAddress)
  if (!code || code === '0x') throw new Error('Pair contract not found')
  const contract = new ethers.Contract(pairAddress, PAIR_ABI, provider)
  const [onchain0, onchain1] = await Promise.all([contract.token0(), contract.token1()])
  if (token0 && normAddr(onchain0) !== normAddr(token0)) throw new Error('token0 mismatch')
  if (token1 && normAddr(onchain1) !== normAddr(token1)) throw new Error('token1 mismatch')
  return { token0: normAddr(onchain0), token1: normAddr(onchain1) }
}

function buildMetadata(entry) {
  const createdAtSec = entry?.created_at || entry?.createdAt
  const createdIso = createdAtSec
    ? new Date(Number(createdAtSec) * 1000).toISOString()
    : new Date().toISOString()
  const shortAddr = (addr) => {
    if (!addr || addr.length < 10) return addr || ''
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`
  }
  const tokenLookup = (addr) => {
    if (!addr) return null
    return db.prepare('SELECT * FROM tokens WHERE address = ?').get(normAddr(addr))
  }

  const token0Addr = normAddr(entry?.token0 || '')
  const token1Addr = normAddr(entry?.token1 || '')
  const isPair = Boolean(token0Addr && token1Addr)

  if (isPair) {
    const token0Meta = tokenLookup(token0Addr)
    const token1Meta = tokenLookup(token1Addr)
    const symbol0 = token0Meta?.symbol || (token0Addr === WNOVA ? 'WNOVA' : shortAddr(token0Addr))
    const symbol1 = token1Meta?.symbol || (token1Addr === WNOVA ? 'WNOVA' : shortAddr(token1Addr))
    const name0 = token0Meta?.name || (token0Addr === WNOVA ? 'Wrapped NOVA' : symbol0)
    const name1 = token1Meta?.name || (token1Addr === WNOVA ? 'Wrapped NOVA' : symbol1)
    const otherMeta = token0Addr === WNOVA ? token1Meta : token1Addr === WNOVA ? token0Meta : token0Meta || token1Meta
    const otherSymbol = token0Addr === WNOVA ? symbol1 : token1Addr === WNOVA ? symbol0 : symbol1
    const image = sanitizeImageUri(entry?.image_uri || entry?.logo || otherMeta?.image_uri || otherMeta?.logo || '')
    const links = {
      website: entry?.website || otherMeta?.website || '',
      x: entry?.twitter || otherMeta?.twitter || '',
      telegram: entry?.telegram || otherMeta?.telegram || '',
      discord: entry?.discord || otherMeta?.discord || '',
    }
    return {
      name: entry?.name || `${symbol0}/${symbol1} Pool`,
      symbol: entry?.symbol || `${symbol0}-${symbol1}`,
      description:
        entry?.description ||
        `WNOVA pool for ${otherSymbol}. LP fee 0.30% (LPs) + protocol fee 1% in WNOVA.`,
      image,
      external_url: PUBLIC_BASE_URL,
      links,
      attributes: [
        { trait_type: 'chain', value: 'Ethernova' },
        { trait_type: 'token0', value: token0Addr },
        { trait_type: 'token1', value: token1Addr },
        { trait_type: 'token0_symbol', value: symbol0 },
        { trait_type: 'token1_symbol', value: symbol1 },
        { trait_type: 'token0_name', value: name0 },
        { trait_type: 'token1_name', value: name1 },
        { trait_type: 'pair', value: entry?.address || entry?.pair || '' },
      ].filter((attr) => attr?.value),
      createdAt: createdIso,
      creator: entry?.creator || '',
    }
  }

  return {
    name: entry?.name || entry?.symbol || 'Token',
    symbol: entry?.symbol || '',
    description: entry?.description || '',
    image: sanitizeImageUri(entry?.image_uri || entry?.logo || ''),
    external_url: PUBLIC_BASE_URL,
    links: {
      website: entry?.website || '',
      x: entry?.twitter || '',
      telegram: entry?.telegram || '',
      discord: entry?.discord || '',
    },
    attributes: [
      { trait_type: 'chain', value: 'Ethernova' },
      entry?.pair ? { trait_type: 'pair', value: entry.pair } : null,
    ].filter(Boolean),
    createdAt: createdIso,
    creator: entry?.creator || '',
  }
}

function computeContentHash(payload) {
  try {
    const json = JSON.stringify(payload)
    return ethers.utils.keccak256(ethers.utils.toUtf8Bytes(json))
  } catch {
    return ethers.constants.HashZero
  }
}

function getRegistryContract(signerOrProvider) {
  if (!REGISTRY_ADDRESS) return null
  return new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, signerOrProvider)
}

async function registerTokenOnchain(token, creator) {
  if (!REGISTRY_ADDRESS || !REGISTRY_REGISTRAR_KEY) return { ok: false, skipped: true }
  const wallet = new ethers.Wallet(REGISTRY_REGISTRAR_KEY, provider)
  const registry = getRegistryContract(wallet)
  const existing = await registry.creatorOfToken(token)
  if (normAddr(existing) === normAddr(creator)) return { ok: true, skipped: true }
  if (existing && normAddr(existing) !== '0x0000000000000000000000000000000000000000') {
    throw new Error('Token already registered with different creator')
  }
  const tx = await registry.registerToken(token, creator)
  const receipt = await tx.wait(1)
  return { ok: true, txHash: receipt.transactionHash }
}

async function registerPairOnchain(pair, creator) {
  if (!REGISTRY_ADDRESS || !REGISTRY_REGISTRAR_KEY) return { ok: false, skipped: true }
  const wallet = new ethers.Wallet(REGISTRY_REGISTRAR_KEY, provider)
  const registry = getRegistryContract(wallet)
  const existing = await registry.creatorOfPair(pair)
  if (normAddr(existing) === normAddr(creator)) return { ok: true, skipped: true }
  if (existing && normAddr(existing) !== '0x0000000000000000000000000000000000000000') {
    throw new Error('Pair already registered with different creator')
  }
  const tx = await registry.registerPair(pair, creator)
  const receipt = await tx.wait(1)
  return { ok: true, txHash: receipt.transactionHash }
}

async function pinFileToPinata(filePath, filename) {
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), filename)
  const resp = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: { Authorization: `Bearer ${PINATA_JWT}` },
    body: form,
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Pinata file upload failed: ${text}`)
  }
  const data = await resp.json()
  return data.IpfsHash
}

async function pinJsonToPinata(payload) {
  const resp = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Pinata JSON upload failed: ${text}`)
  }
  const data = await resp.json()
  return data.IpfsHash
}

async function pinFileToKubo(filePath, filename) {
  const form = new FormData()
  form.append('file', fs.createReadStream(filePath), filename)
  const resp = await fetch(`${IPFS_API_URL}/api/v0/add?pin=true&wrap-with-directory=false`, {
    method: 'POST',
    body: form,
  })
  const text = await resp.text()
  if (!resp.ok) {
    throw new Error(`Kubo add failed: ${text.slice(0, 200)}`)
  }
  const lines = text.trim().split('\n').filter(Boolean)
  const last = lines[lines.length - 1]
  const data = JSON.parse(last)
  return data.Hash
}

async function pinJsonToKubo(payload) {
  const tmpName = `metadata-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.json`
  const tmpPath = path.join(UPLOAD_DIR, tmpName)
  fs.writeFileSync(tmpPath, JSON.stringify(payload))
  try {
    return await pinFileToKubo(tmpPath, tmpName)
  } finally {
    fs.unlinkSync(tmpPath)
  }
}

async function pinFileToIPFS(filePath, filename) {
  if (PIN_PROVIDER === 'kubo') {
    return pinFileToKubo(filePath, filename)
  }
  if (PIN_PROVIDER === 'pinata' && PINATA_JWT) {
    return pinFileToPinata(filePath, filename)
  }
  throw new Error('Pinning provider not configured')
}

async function pinJsonToIPFS(payload) {
  if (PIN_PROVIDER === 'kubo') {
    return pinJsonToKubo(payload)
  }
  if (PIN_PROVIDER === 'pinata' && PINATA_JWT) {
    return pinJsonToPinata(payload)
  }
  throw new Error('Pinning provider not configured')
}

app.use(rateLimit)
app.use(express.json({ limit: '1mb' }))
app.use(
  cors({
    origin: ALLOWED_ORIGIN,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['content-type', 'x-address', 'x-signature'],
  })
)

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || '').slice(0, 10)
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`)
    },
  }),
  limits: { fileSize: MAX_UPLOAD_MB * 1024 * 1024 },
})

app.get('/api/metadata/health', async (req, res) => {
  let ipfsOk = false
  let ipfsError = ''
  if (PIN_PROVIDER === 'kubo') {
    try {
      const resp = await fetch(`${IPFS_API_URL}/api/v0/version`, { method: 'POST' })
      ipfsOk = resp.ok
      if (!resp.ok) {
        ipfsError = (await resp.text()).slice(0, 200)
      }
    } catch (err) {
      ipfsOk = false
      ipfsError = err?.message || 'ipfs error'
    }
  }
  res.json({
    ok: true,
    pinProvider: PIN_PROVIDER || 'none',
    sqlite: true,
    wnova: WNOVA,
    ipfsOk,
    ipfsError: ipfsError || undefined,
  })
})

app.post('/api/metadata/challenge', (req, res) => {
  const address = normAddr(req.body?.address || '')
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  const nonce = createNonce()
  setNonce(address, nonce)
  const record = getNonce(address)
  const message = buildMessage(address, record.nonce, record.created_at)
  res.json({ ok: true, nonce: record.nonce, message })
})

app.post('/api/metadata/verify', (req, res) => {
  const address = normAddr(req.body?.address || '')
  const signature = req.body?.signature
  if (!isHexAddress(address) || !signature) {
    res.status(400).json({ ok: false, error: 'Missing address or signature' })
    return
  }
  try {
    verifySignature(address, signature)
    res.json({ ok: true })
  } catch (err) {
    res.status(401).json({ ok: false, error: err.message || 'Invalid signature' })
  }
})

app.get('/api/metadata/token/:address', (req, res) => {
  const address = normAddr(req.params.address)
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  const entry = db.prepare('SELECT * FROM tokens WHERE address = ?').get(address)
  res.json({ ok: true, data: entry || null, missing: !entry })
})

app.get('/api/metadata/token/:address/json', (req, res) => {
  const address = normAddr(req.params.address)
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  const entry = db.prepare('SELECT * FROM tokens WHERE address = ?').get(address)
  if (!entry) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  res.json(buildMetadata(entry))
})

app.get('/api/metadata/json/token/:address', (req, res) => {
  const address = normAddr(req.params.address)
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  req.url = `/api/metadata/token/${address}/json`
  return app._router.handle(req, res)
})

app.get('/api/metadata/pair/:address', (req, res) => {
  const address = normAddr(req.params.address)
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  const entry = db.prepare('SELECT * FROM pairs WHERE address = ?').get(address)
  res.json({ ok: true, data: entry || null, missing: !entry })
})

app.get('/api/metadata/pair/:address/json', (req, res) => {
  const address = normAddr(req.params.address)
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  const entry = db.prepare('SELECT * FROM pairs WHERE address = ?').get(address)
  if (!entry) {
    res.status(404).json({ ok: false, error: 'Not found' })
    return
  }
  res.json(buildMetadata(entry))
})

app.get('/api/metadata/json/pair/:address', (req, res) => {
  const address = normAddr(req.params.address)
  if (!isHexAddress(address)) {
    res.status(400).json({ ok: false, error: 'Invalid address' })
    return
  }
  req.url = `/api/metadata/pair/${address}/json`
  return app._router.handle(req, res)
})

app.get('/api/metadata/tokens', (req, res) => {
  const tokens = db.prepare('SELECT * FROM tokens').all()
  const mapped = {}
  tokens.forEach((token) => {
    mapped[token.address] = token
  })
  res.json({ ok: true, data: mapped })
})

app.get('/api/metadata/pairs', (req, res) => {
  const pairs = db.prepare('SELECT * FROM pairs').all()
  const mapped = {}
  pairs.forEach((pair) => {
    mapped[pair.address] = pair
  })
  res.json({ ok: true, data: mapped })
})

app.get('/api/metadata/uploads/:file', (req, res) => {
  const file = req.params.file
  const filePath = path.join(UPLOAD_DIR, file)
  if (!fs.existsSync(filePath)) {
    res.status(404).json({ ok: false, error: 'File not found' })
    return
  }
  res.sendFile(filePath)
})

app.post('/api/metadata/image', authGuard, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ ok: false, error: 'Image file missing' })
      return
    }
    let imageUri = ''
    let imageUrl = ''
    let cid = ''
    cid = await pinFileToIPFS(req.file.path, req.file.originalname || req.file.filename)
    imageUri = `ipfs://${cid}`
    imageUrl = `${IPFS_GATEWAY_BASE}${cid}`
    const contentHash = ethers.utils.keccak256(fs.readFileSync(req.file.path))
    res.json({
      ok: true,
      cid,
      ipfsUri: imageUri,
      gatewayUrl: imageUrl,
      imageUri,
      imageUrl,
      contentHash
    })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Image upload failed' })
  }
})

app.post('/api/metadata/publish', authGuard, async (req, res) => {
  try {
    const now = Math.floor(Date.now() / 1000)
    const payload = req.body || {}
    const token = normAddr(payload.token || '')
    const pair = normAddr(payload.pair || '')
    const creator = normAddr(payload.creator || req.auth.address || '')
    if (!isHexAddress(token)) {
      res.status(400).json({ ok: false, error: 'Invalid token address' })
      return
    }
    let imageUri = ''
    if (payload.imageURI || payload.imageUri) {
      imageUri = await normalizeImageUri(payload.imageURI || payload.imageUri)
    }

    const sanitized = {
      address: token,
      creator,
      name: clampString(payload.name, 80),
      symbol: clampString(payload.symbol, 20),
      description: clampString(payload.description, 500),
      website: validateUrl(payload.website),
      twitter: validateUrl(payload.x || payload.twitter || ''),
      telegram: validateUrl(payload.telegram),
      discord: validateUrl(payload.discord),
      image_uri: imageUri,
      pair: isHexAddress(pair) ? pair : '',
      createdAt: new Date().toISOString(),
    }
    const metadata = buildMetadata(sanitized)
    const contentHash = computeContentHash(metadata)
    let metadataUri = ''
    const metaCid = await pinJsonToIPFS(metadata)
    metadataUri = `ipfs://${metaCid}`
    db.prepare(
      `INSERT OR REPLACE INTO tokens(address, creator, metadata_uri, image_uri, name, symbol, description, website, twitter, telegram, discord, content_hash, created_at, updated_at)
       VALUES(@address, @creator, @metadata_uri, @image_uri, @name, @symbol, @description, @website, @twitter, @telegram, @discord, @content_hash, COALESCE(@created_at, @now), @now)`
    ).run({
      address: token,
      creator,
      metadata_uri: metadataUri,
      image_uri: sanitized.image_uri,
      name: sanitized.name,
      symbol: sanitized.symbol,
      description: sanitized.description,
      website: sanitized.website,
      twitter: sanitized.twitter,
      telegram: sanitized.telegram,
      discord: sanitized.discord,
      content_hash: contentHash,
      created_at: now,
      now,
    })
    if (pair) {
      db.prepare(
        `INSERT OR REPLACE INTO pairs(address, token0, token1, creator, metadata_uri, content_hash, created_at, updated_at)
         VALUES(@address, @token0, @token1, @creator, @metadata_uri, @content_hash, COALESCE(@created_at, @now), @now)`
      ).run({
        address: pair,
        token0: '',
        token1: '',
        creator,
        metadata_uri: metadataUri,
        content_hash: contentHash,
        created_at: now,
        now,
      })
    }
    res.json({ ok: true, token, pair: pair || null, metadataUri, contentHash })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Publish failed' })
  }
})

app.post('/api/metadata/token', authGuard, upload.single('logo'), async (req, res) => {
  try {
    const signer = req.auth.address
    const tokenAddress = normAddr(req.body?.tokenAddress || '')
    const txHash = req.body?.txHash
    const pairAddress = normAddr(req.body?.pairAddress || '')

    let tokenRecord = tokenAddress
      ? db.prepare('SELECT * FROM tokens WHERE address = ?').get(tokenAddress)
      : null

    let verification = null
    if (txHash && isHexHash(txHash)) {
      verification = await verifyTokenTx(txHash, tokenAddress)
    } else if (!tokenRecord) {
      res.status(400).json({ ok: false, error: 'Missing txHash for new token' })
      return
    }

    const resolvedToken = verification?.token || tokenAddress
    if (!resolvedToken || !isHexAddress(resolvedToken)) {
      res.status(400).json({ ok: false, error: 'Token address missing' })
      return
    }

    tokenRecord = tokenRecord || {}
    const creator = verification?.creator || tokenRecord.creator
    if (creator && normAddr(creator) !== signer) {
      res.status(403).json({ ok: false, error: 'Signer is not token creator' })
      return
    }

    const sanitized = {
      name: clampString(req.body?.name || verification?.name || '', 64),
      symbol: clampString(req.body?.symbol || verification?.symbol || '', 16),
      description: clampString(req.body?.description || '', 500),
      website: validateUrl(req.body?.website || ''),
      twitter: validateUrl(req.body?.twitter || ''),
      telegram: validateUrl(req.body?.telegram || ''),
      discord: validateUrl(req.body?.discord || ''),
    }

    let imageUri = tokenRecord?.image_uri || ''
    if (imageUri && String(imageUri).startsWith('data:image/')) {
      imageUri = await normalizeImageUri(imageUri)
    }
    if (req.file) {
      const cid = await pinFileToIPFS(req.file.path, req.file.originalname || req.file.filename)
      imageUri = `ipfs://${cid}`
    } else if (req.body?.logoUrl) {
      imageUri = await normalizeImageUri(req.body?.logoUrl)
    }

    const metadata = buildMetadata({ ...sanitized, image_uri: imageUri, creator: creator || signer })
    const contentHash = computeContentHash(metadata)
    let metadataUri = ''
    const metaCid = await pinJsonToIPFS(metadata)
    metadataUri = `ipfs://${metaCid}`

    const now = Math.floor(Date.now() / 1000)

    db.prepare(
      `INSERT OR REPLACE INTO tokens(address, creator, metadata_uri, image_uri, name, symbol, description, website, twitter, telegram, discord, content_hash, created_at, updated_at)
       VALUES(@address, @creator, @metadata_uri, @image_uri, @name, @symbol, @description, @website, @twitter, @telegram, @discord, @content_hash, COALESCE(@created_at, @now), @now)`
    ).run({
      address: resolvedToken,
      creator: creator || signer,
      metadata_uri: metadataUri,
      image_uri: imageUri,
      name: sanitized.name,
      symbol: sanitized.symbol,
      description: sanitized.description,
      website: sanitized.website,
      twitter: sanitized.twitter,
      telegram: sanitized.telegram,
      discord: sanitized.discord,
      content_hash: contentHash,
      created_at: tokenRecord.created_at || now,
      now,
    })

    const entry = db.prepare('SELECT * FROM tokens WHERE address = ?').get(resolvedToken)
    let registryResult = null
    try {
      if (REGISTRY_ADDRESS && REGISTRY_REGISTRAR_KEY) {
        registryResult = await registerTokenOnchain(resolvedToken, creator || signer)
      }
    } catch (err) {
      registryResult = { ok: false, error: err.message || 'Registry register failed' }
    }
    res.json({ ok: true, data: entry, metadataUri, contentHash, registry: registryResult })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Metadata update failed' })
  }
})

app.post('/api/metadata/pair', authGuard, async (req, res) => {
  try {
    const signer = req.auth.address
    const pairAddress = normAddr(req.body?.pairAddress || '')
    const txHash = req.body?.txHash
    if (!pairAddress || !isHexAddress(pairAddress)) {
      res.status(400).json({ ok: false, error: 'Invalid pair address' })
      return
    }
    if (!txHash || !isHexHash(txHash)) {
      res.status(400).json({ ok: false, error: 'Missing txHash' })
      return
    }

    const verification = await verifyPairTx(txHash, pairAddress)
    if (normAddr(verification.creator) !== signer) {
      res.status(403).json({ ok: false, error: 'Signer is not pair creator' })
      return
    }

    const token0 = normAddr(req.body?.token0 || '')
    const token1 = normAddr(req.body?.token1 || '')
    const metadataUri = req.body?.metadataUri ? String(req.body?.metadataUri) : ''
    const contentHash = req.body?.contentHash ? String(req.body?.contentHash) : ''
    const onchainTokens = await verifyPairOnchain(pairAddress, token0, token1)
    const resolvedToken0 = onchainTokens?.token0 || token0 || verification.token
    const resolvedToken1 = onchainTokens?.token1 || token1 || ''

    const now = Math.floor(Date.now() / 1000)
    const existing = db.prepare('SELECT * FROM pairs WHERE address = ?').get(pairAddress)
    db.prepare(
      `INSERT OR REPLACE INTO pairs(address, token0, token1, creator, metadata_uri, content_hash, created_at, updated_at)
       VALUES(@address, @token0, @token1, @creator, @metadata_uri, @content_hash, COALESCE(@created_at, @now), @now)`
    ).run({
      address: pairAddress,
      token0: resolvedToken0,
      token1: resolvedToken1,
      creator: verification.creator,
      metadata_uri: metadataUri || existing?.metadata_uri || '',
      content_hash: contentHash || existing?.content_hash || '',
      created_at: existing?.created_at || now,
      now,
    })

    const entry = db.prepare('SELECT * FROM pairs WHERE address = ?').get(pairAddress)
    let registryResult = null
    try {
      if (REGISTRY_ADDRESS && REGISTRY_REGISTRAR_KEY) {
        registryResult = await registerPairOnchain(pairAddress, verification.creator)
      }
    } catch (err) {
      registryResult = { ok: false, error: err.message || 'Registry register failed' }
    }
    res.json({ ok: true, data: entry, registry: registryResult })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Pair metadata update failed' })
  }
})

app.listen(PORT, HOST, () => {
  console.log(`[metadata-api] listening on ${HOST}:${PORT}`)
})
