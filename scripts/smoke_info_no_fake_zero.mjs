#!/usr/bin/env node
import fs from 'fs'
import { chromium } from 'playwright'

const baseUrl = (process.env.DEX_URL || 'https://dex.ethnova.net').replace(/\/$/, '')
const graphUrl = `${baseUrl}/info/subgraphs/name/novadex/novadex`
const configPath = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const pairAddress = (config?.contracts?.pair || '').toLowerCase()
const wnovaAddress = (config?.tokens?.WNOVA?.address || '').toLowerCase()

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

const parseNum = (text) => {
  if (!text) return null
  const cleaned = text.replace(/[^0-9.]/g, '')
  if (!cleaned) return null
  const num = Number(cleaned)
  return Number.isFinite(num) ? num : null
}

async function fetchGraph(query, variables = {}) {
  const res = await fetch(graphUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables })
  })
  if (!res.ok) throw new Error(`GraphQL HTTP ${res.status}`)
  const json = await res.json()
  if (json.errors) throw new Error(JSON.stringify(json.errors))
  return json.data
}

async function main() {
  if (!pairAddress || !wnovaAddress) {
    warn('Missing pair or WNOVA address in config; skipping')
    return
  }

  let swapsCount = 0
  let reserveWnova = null
  try {
    const data = await fetchGraph(
      `query PairSnapshot($id: String!, $ts: Int!) {
        pair(id: $id) { id reserve0 reserve1 token0 { id } token1 { id } }
        swaps(where: { pair: $id, timestamp_gt: $ts }, first: 1) { id }
      }`,
      { id: pairAddress, ts: Math.floor(Date.now() / 1000) - 86400 }
    )
    swapsCount = data?.swaps?.length || 0
    if (data?.pair) {
      const t0 = data.pair.token0.id.toLowerCase()
      const t1 = data.pair.token1.id.toLowerCase()
      const r0 = Number(data.pair.reserve0)
      const r1 = Number(data.pair.reserve1)
      if (t0 === wnovaAddress) reserveWnova = r0
      if (t1 === wnovaAddress) reserveWnova = r1
    }
  } catch (err) {
    warn(`GraphQL unavailable (${err.message}); skipping UI check`) 
    return
  }

  const browser = await chromium.launch()
  const page = await browser.newPage()
  await page.goto(`${baseUrl}/info/#/pairs`, { waitUntil: 'networkidle' })

  const liqSel = `[data-testid="pair-liquidity-${pairAddress}"]`
  const volSel = `[data-testid="pair-volume-${pairAddress}"]`
  await page.waitForSelector(liqSel, { timeout: 20000 })

  const liqText = await page.textContent(liqSel)
  const volText = await page.textContent(volSel)
  const liqNum = parseNum(liqText)
  const volNum = parseNum(volText)

  if (reserveWnova && reserveWnova > 0 && (!liqNum || liqNum <= 0)) {
    await browser.close()
    fail(`Liquidity shown as '${liqText}' but reserve WNOVA is ${reserveWnova}`)
  }
  if (swapsCount > 0 && (!volNum || volNum <= 0)) {
    await browser.close()
    fail(`Volume shown as '${volText}' but swaps exist in last 24h`) 
  }

  await page.goto(`${baseUrl}/info/#/tokens`, { waitUntil: 'networkidle' })
  const tokenLiqSel = `[data-testid="token-liquidity-${wnovaAddress}"]`
  await page.waitForSelector(tokenLiqSel, { timeout: 20000 })
  const tokenLiqText = await page.textContent(tokenLiqSel)
  const tokenLiqNum = parseNum(tokenLiqText)
  if (reserveWnova && reserveWnova > 0 && (!tokenLiqNum || tokenLiqNum <= 0)) {
    await browser.close()
    fail(`Token liquidity shown as '${tokenLiqText}' but reserve WNOVA is ${reserveWnova}`)
  }

  await browser.close()
  log('[OK] smoke_info_no_fake_zero')
}

main().catch((err) => fail(err.message))
