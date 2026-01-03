import fs from 'fs'
import path from 'path'

const DEPLOYMENTS = '/opt/novadex/contracts/deployments.json'
const ENV_FILE = '/opt/novadex/.env'
const INFO_ENV = '/opt/novadex/dex-info/.env.local'

function parseEnv(file) {
  if (!fs.existsSync(file)) return {}
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  const out = {}
  for (const line of lines) {
    if (!line || line.trim().startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    const key = line.slice(0, idx).trim()
    const value = line.slice(idx + 1).trim()
    out[key] = value.replace(/^"|"$/g, '')
  }
  return out
}

const env = { ...parseEnv(ENV_FILE), ...parseEnv(INFO_ENV) }
const dexDomain = env.DEX_DOMAIN || 'dex.ethnova.net'
const subgraphUrl =
  env.REACT_APP_SUBGRAPH_URL || `https://${dexDomain}/info/subgraphs/name/novadex/novadex`

let deployments = {}
try {
  deployments = JSON.parse(fs.readFileSync(DEPLOYMENTS, 'utf8'))
} catch (err) {
  console.error('[ERROR] Unable to read deployments.json', err?.message || err)
  process.exit(1)
}

const wnova = (deployments?.addresses?.wnova || '').toLowerCase()
const tony = (deployments?.addresses?.tony || '').toLowerCase()
const pair = (deployments?.addresses?.pair || '').toLowerCase()

if (!wnova || !pair) {
  console.error('[ERROR] Missing WNOVA or pair address in deployments.json')
  process.exit(1)
}

async function gql(query, variables) {
  const res = await fetch(subgraphUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`Subgraph HTTP ${res.status}: ${text.slice(0, 200)}`)
  const json = JSON.parse(text)
  if (json?.errors?.length) {
    throw new Error(`Subgraph errors: ${JSON.stringify(json.errors)}`)
  }
  return json?.data
}

function toNum(value) {
  const num = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(num) ? num : 0
}

async function main() {
  console.log(`[INFO] Subgraph: ${subgraphUrl}`)
  console.log(`[INFO] Pair: ${pair}`)

  let data
  try {
    data = await gql(
      `query Pair($id: ID!) {
        pair(id: $id) {
          id
          reserve0
          reserve1
          volumeToken0
          volumeToken1
          token0 { id symbol }
          token1 { id symbol }
        }
        swaps(first: 1, orderBy: timestamp, orderDirection: desc, where: { pair: $id }) {
          id
          timestamp
          amount0In
          amount0Out
          amount1In
          amount1Out
        }
      }`,
      { id: pair }
    )
  } catch (err) {
    console.warn('[WARN] Subgraph unavailable; skipping metrics sanity', err?.message || err)
    process.exit(0)
  }

  const pairData = data?.pair
  if (!pairData) {
    console.warn('[WARN] Pair not indexed yet; skipping metrics sanity')
    process.exit(0)
  }

  const token0Id = (pairData?.token0?.id || '').toLowerCase()
  const token1Id = (pairData?.token1?.id || '').toLowerCase()
  const reserve0 = toNum(pairData.reserve0)
  const reserve1 = toNum(pairData.reserve1)
  const volume0 = toNum(pairData.volumeToken0)
  const volume1 = toNum(pairData.volumeToken1)
  const isToken0Wnova = token0Id === wnova
  const isToken1Wnova = token1Id === wnova
  const reserveWnova = isToken0Wnova ? reserve0 : isToken1Wnova ? reserve1 : 0
  const volumeWnova = isToken0Wnova ? volume0 : isToken1Wnova ? volume1 : 0

  console.log(`[INFO] reserveWNOVA=${reserveWnova} volumeWNOVA=${volumeWnova}`)

  if (reserveWnova <= 0) {
    console.error('[ERROR] reserveWNOVA is 0; expected >0 when liquidity exists')
    process.exit(1)
  }

  const swaps = data?.swaps || []
  if (swaps.length > 0 && volumeWnova <= 0) {
    console.error('[ERROR] swaps exist but volumeWNOVA is 0')
    process.exit(1)
  }

  if (tony) {
    const reserveToken = isToken0Wnova ? reserve1 : reserve0
    const priceWnova = reserveToken > 0 ? reserveWnova / reserveToken : 0
    if (priceWnova <= 0) {
      console.error('[ERROR] TONY price in WNOVA is 0; expected >0')
      process.exit(1)
    }
  }

  console.log('[OK] Metrics sanity checks passed')
}

main().catch((err) => {
  console.error('[ERROR] Metrics sanity failed', err?.message || err)
  process.exit(1)
})
