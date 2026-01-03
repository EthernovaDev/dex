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
const SQLITE_PATH = process.env.SQLITE_PATH || '/var/lib/novadex/metadata.db'
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/var/lib/novadex/uploads'
const PIN_PROVIDER = (process.env.PIN_PROVIDER || '').toLowerCase()
const PINATA_JWT = process.env.PINATA_JWT || ''
const IPFS_GATEWAY = process.env.IPFS_GATEWAY || 'https://cloudflare-ipfs.com/ipfs/'
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 2)
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 60)
const NONCE_TTL_SECONDS = Number(process.env.NONCE_TTL_SECONDS || 600)
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || 'https://dex.ethnova.net').replace(/\/+$/, '')
const RPC_URL = process.env.RPC_URL || config?.rpcUrl
const TOKEN_FACTORY = (process.env.TOKEN_FACTORY || config?.contracts?.tokenFactory || '').toLowerCase()
const WNOVA = (process.env.WNOVA || config?.tokens?.WNOVA?.address || '').toLowerCase()
const START_BLOCK = Number(process.env.START_BLOCK || config?.startBlock || 0)

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
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE TABLE IF NOT EXISTS nonces (
    address TEXT PRIMARY KEY,
    nonce TEXT,
    created_at INTEGER
  );
`)

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

function validateLogo(value, maxLength = 200000) {
  if (!value) return ''
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.startsWith('data:image/')) {
    return trimmed.length <= maxLength ? trimmed : ''
  }
  return validateUrl(trimmed)
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
  return {
    name: entry?.name || entry?.symbol || 'Token',
    symbol: entry?.symbol || '',
    description: entry?.description || '',
    image: entry?.image_uri || entry?.logo || '',
    external_url: PUBLIC_BASE_URL,
    links: {
      website: entry?.website || '',
      x: entry?.twitter || '',
      telegram: entry?.telegram || '',
      discord: entry?.discord || '',
    },
  }
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

app.get('/api/metadata/health', (req, res) => {
  res.json({ ok: true, pinProvider: PIN_PROVIDER || 'none', sqlite: true, wnova: WNOVA })
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
  res.json({
    name: `Pair ${entry.address}`,
    symbol: '',
    description: '',
    image: '',
    external_url: PUBLIC_BASE_URL,
    links: {},
  })
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

    let imageUri = ''
    if (req.file) {
      if (PIN_PROVIDER === 'pinata' && PINATA_JWT) {
        const cid = await pinFileToPinata(req.file.path, req.file.originalname || req.file.filename)
        imageUri = `ipfs://${cid}`
      } else {
        imageUri = `${PUBLIC_BASE_URL}/api/metadata/uploads/${req.file.filename}`
      }
    } else if (req.body?.logoUrl) {
      imageUri = validateLogo(req.body?.logoUrl)
    }

    const metadata = buildMetadata({ ...sanitized, image_uri: imageUri })
    let metadataUri = ''
    if (PIN_PROVIDER === 'pinata' && PINATA_JWT) {
      const metaCid = await pinJsonToPinata(metadata)
      metadataUri = `ipfs://${metaCid}`
    } else {
      metadataUri = `${PUBLIC_BASE_URL}/api/metadata/token/${resolvedToken}/json`
    }

    const now = Math.floor(Date.now() / 1000)

    db.prepare(
      `INSERT OR REPLACE INTO tokens(address, creator, metadata_uri, image_uri, name, symbol, description, website, twitter, telegram, discord, created_at, updated_at)
       VALUES(@address, @creator, @metadata_uri, @image_uri, @name, @symbol, @description, @website, @twitter, @telegram, @discord, COALESCE(@created_at, @now), @now)`
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
      created_at: tokenRecord.created_at || now,
      now,
    })

    const entry = db.prepare('SELECT * FROM tokens WHERE address = ?').get(resolvedToken)
    res.json({ ok: true, data: entry, metadataUri })
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
    const onchainTokens = await verifyPairOnchain(pairAddress, token0, token1)

    const now = Math.floor(Date.now() / 1000)
    db.prepare(
      `INSERT OR REPLACE INTO pairs(address, token0, token1, creator, metadata_uri, created_at, updated_at)
       VALUES(@address, @token0, @token1, @creator, @metadata_uri, COALESCE(@created_at, @now), @now)`
    ).run({
      address: pairAddress,
      token0: token0 || onchainTokens?.token0 || verification.token,
      token1: token1 || onchainTokens?.token1 || '',
      creator: verification.creator,
      metadata_uri: '',
      created_at: now,
      now,
    })

    const entry = db.prepare('SELECT * FROM pairs WHERE address = ?').get(pairAddress)
    res.json({ ok: true, data: entry })
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || 'Pair metadata update failed' })
  }
})

app.listen(PORT, HOST, () => {
  console.log(`[metadata-api] listening on ${HOST}:${PORT}`)
})
