import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'

const OUT_DIR = '/opt/novadex/scripts/out'
const BASE_URL = process.env.BASE_URL || 'https://dex.ethnova.net'
const DEBUG_URL = `${BASE_URL}/?debug=1`
const DEPLOYMENTS_PATH = '/opt/novadex/contracts/deployments.json'

function ts() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function writeFile(file, data) {
  fs.writeFileSync(path.join(OUT_DIR, file), data)
}

function hasCrash(errors, pageErrors) {
  const combined = [...errors, ...pageErrors].join('\n')
  return /ChunkLoadError|Loading chunk|Uncaught|TypeError|ReferenceError|Invariant failed/i.test(combined)
}

function isWhiteScreen(html) {
  if (!html) return true
  const trimmed = html.replace(/\s+/g, '')
  return trimmed.length < 50
}

async function main() {
  ensureDir()
  const stamp = ts()
  const logFile = `ui_click_smoke-${stamp}.log`
  const beforeShot = `ui_click_smoke-${stamp}-before.png`
  const afterShot = `ui_click_smoke-${stamp}-after.png`

  const consoleErrors = []
  const pageErrors = []
  const requestFailures = []
  const infuraHits = []
  const uniswapHits = []
  const notFoundHits = []
  const addLiquidityFailures = []
  const routesRendered = {
    swap: false,
    pool: false,
    explore: false,
    import: false,
    infoPair: false,
    infoOverview: false,
    infoTokens: false,
    infoPairs: false
  }

  let rpcSoft503 = 0
  let rpcOtherErrors = 0
  let hardConsoleErrors = 0
  let rpcConsecutive = 0
  let lastRpcErrorAt = 0
  let lastRpcSuccessAt = 0
  let lastRpcSoftIncrementAt = 0
  let lastSoftIncidentAt = 0
  let lastSoftIncidentUrl = ''
  let lastSoftIncidentMethod = ''
  let lastRpcUrl = ''
  let lastSoft503Url = ''
  let lastSoft503At = ''
  let lastSoftRpcMethod = ''
  let rpcBaseUrl = 'unknown'
  const toInt = (val, fallback) => {
    const parsed = parseInt(val, 10)
    return Number.isFinite(parsed) ? parsed : fallback
  }
  const rpcErrorWindowMs = toInt(process.env.SMOKE_RPC_WINDOW_MS, 15000)
  const rpcSoftMax = toInt(process.env.SMOKE_RPC_SOFT_MAX, 5)
  const rpcConsecMax = toInt(process.env.SMOKE_RPC_CONSEC_MAX, 3)
  const rpcLogMax = toInt(process.env.SMOKE_RPC_LOG_MAX, 20)
  const rpcEvents = []
  const rpcMethodCounts = {}

  let wnovaAddress = ''
  let tonyAddress = ''
  let pairAddress = ''
  try {
    const raw = fs.readFileSync(DEPLOYMENTS_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    wnovaAddress = parsed?.addresses?.wnova || ''
    tonyAddress = parsed?.addresses?.tony || ''
    pairAddress = parsed?.addresses?.pair || ''
  } catch (err) {
    console.warn(`[WARN] Failed to read deployments.json: ${err?.message || err}`)
  }

  const rpcEnvUrl = process.env.RPC_URL || 'https://rpc.ethnova.net'
  const rpcHosts = [rpcEnvUrl]
    .map(url => {
      try {
        return new URL(url).host
      } catch (_) {
        return url.replace(/^https?:\/\//, '').split('/')[0]
      }
    })
    .filter(Boolean)

  const getHost = url => {
    try {
      return new URL(url).host
    } catch (_) {
      return url.replace(/^https?:\/\//, '').split('/')[0]
    }
  }
  const isRpcHost = url => {
    if (rpcBaseUrl && rpcBaseUrl !== 'unknown') {
      return getHost(url) === getHost(rpcBaseUrl)
    }
    return rpcHosts.some(host => host && url.includes(host))
  }
  const isRpcUrl = url => isRpcHost(url)
  const isJsonRpcPayload = data => /\"jsonrpc\"\s*:\s*\"2\.0\"/.test(data || '')
  const extractRpcMethods = data => {
    if (!data) return []
    try {
      const parsed = JSON.parse(data)
      if (Array.isArray(parsed)) {
        return parsed.map(item => item?.method).filter(Boolean)
      }
      return parsed?.method ? [parsed.method] : []
    } catch (_) {
      return []
    }
  }
  const registerRpcHost = url => {
    try {
      const host = new URL(url).host
      if (host && !rpcHosts.includes(host)) {
        rpcHosts.push(host)
      }
    } catch (_) {
      // ignore
    }
  }
  const isSoftRpcText = text =>
    /429|502|503|504|Service Unavailable|Bad Gateway|gateway|Internal JSON-RPC error|failed to fetch|NetworkError|ECONNRESET|ETIMEDOUT/i.test(
      text
    )
  const isSoftRpcStatus = status => [429, 502, 503, 504].includes(status)
  const isHardConsole = text => /ChunkLoadError|Loading chunk|Uncaught|TypeError|ReferenceError|Invariant failed/i.test(text)
  const isIgnoredWarning = text => /Redux-LocalStorage-Simple/i.test(text)

  console.log(
    `[INFO] RPC thresholds: window=${rpcErrorWindowMs}ms softMax=${rpcSoftMax} consecMax=${rpcConsecMax} logMax=${rpcLogMax}`
  )

  let currentRoute = 'swap'

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  const pushRpcEvent = ({ status, url, route, method, kind }) => {
    rpcEvents.push({
      time: new Date().toISOString(),
      status,
      method: method || 'unknown',
      url,
      route,
      kind
    })
    if (rpcEvents.length > rpcLogMax) {
      rpcEvents.splice(0, rpcEvents.length - rpcLogMax)
    }
  }

  const getRouteLabel = () => currentRoute || 'unknown'

  const recordRpcMethod = method => {
    if (!method) return
    rpcMethodCounts[method] = (rpcMethodCounts[method] || 0) + 1
  }

  const recordRpcSoft = ({ url = '', method = '', status = 'soft' } = {}) => {
    const now = Date.now()
    const isDistinct =
      now - lastSoftIncidentAt > 1500 ||
      (url && url !== lastSoftIncidentUrl) ||
      (method && method !== lastSoftIncidentMethod)
    lastRpcErrorAt = now
    if (!isDistinct) {
      return
    }
    if (!lastRpcSoftIncrementAt || now - lastRpcSoftIncrementAt > rpcErrorWindowMs) {
      rpcSoft503 += 1
      lastRpcSoftIncrementAt = now
    }
    if (!lastSoftIncidentAt || now - lastSoftIncidentAt < 4000) {
      rpcConsecutive += 1
    } else {
      rpcConsecutive = 1
    }
    lastSoftIncidentAt = now
    if (url) lastSoftIncidentUrl = url
    if (method) lastSoftIncidentMethod = method
    if (url) {
      lastSoft503Url = url
      lastSoft503At = new Date().toISOString()
    }
    if (method) {
      lastSoftRpcMethod = method
      recordRpcMethod(method)
    }
    pushRpcEvent({
      status,
      url: url || 'unknown',
      route: getRouteLabel(),
      method,
      kind: 'soft'
    })
  }

  const recordRpcSuccess = () => {
    lastRpcSuccessAt = Date.now()
    if (lastSoftIncidentAt && Date.now() - lastSoftIncidentAt > 4000) {
      rpcConsecutive = 0
    }
  }

  page.on('console', msg => {
    const text = msg.text()
    const line = `[console.${msg.type()}] ${text}`
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const hostHint = rpcBaseUrl !== 'unknown' ? getHost(rpcBaseUrl) : null
      const isSoftRpc =
        isSoftRpcText(text) &&
        ((lastRpcUrl && isRpcUrl(lastRpcUrl)) || (hostHint && text.includes(hostHint)) || rpcHosts.some(host => text.includes(host)))
      const recentRpc = Date.now() - lastRpcErrorAt < rpcErrorWindowMs
      if (isIgnoredWarning(text)) {
        return
      }
      if (isHardConsole(text)) {
        hardConsoleErrors += 1
        consoleErrors.push(line)
      } else if (isSoftRpc || (isSoftRpcText(text) && recentRpc)) {
        recordRpcSoft({ url: lastRpcUrl, method: '', status: 'other' })
      } else {
        hardConsoleErrors += 1
        consoleErrors.push(line)
      }
    }
  })
  page.on('pageerror', err => {
    pageErrors.push(`[pageerror] ${err?.message || err}`)
  })
  page.on('requestfailed', req => {
    const url = req.url()
    const errText = req.failure()?.errorText || ''
    const line = `[requestfailed] ${url} - ${errText}`
    const postData = req.postData() || ''
    const isJsonRpc = isJsonRpcPayload(postData)
    const methods = extractRpcMethods(postData)
    const method = methods[0] || ''
    if (isJsonRpc) {
      registerRpcHost(url)
    }
    if (isRpcUrl(url) && /503|429|502|504|timeout|ECONNRESET|ETIMEDOUT/i.test(errText)) {
      recordRpcSoft({ url, method, status: 'other' })
      return
    }
    requestFailures.push(line)
    if (isRpcUrl(url)) {
      rpcOtherErrors += 1
      if (method) recordRpcMethod(method)
      pushRpcEvent({ status: 'other', url, route: getRouteLabel(), method, kind: 'other' })
    }
  })
  page.on('response', res => {
    const url = res.url()
    const req = res.request()
    const postData = req?.postData?.() || ''
    const methods = extractRpcMethods(postData)
    const method = methods[0] || ''
    if (isJsonRpcPayload(postData)) {
      registerRpcHost(url)
    }
    if (isRpcUrl(url) || isJsonRpcPayload(postData)) {
      lastRpcUrl = url
      if (rpcBaseUrl === 'unknown') {
        try {
          rpcBaseUrl = new URL(url).origin
        } catch (_) {
          rpcBaseUrl = url
        }
      }
    }
    if (res.status() === 404) {
      notFoundHits.push(url)
    }
    if (isRpcUrl(url)) {
      if (isSoftRpcStatus(res.status())) {
        recordRpcSoft({ url, method, status: `${res.status()}` })
      } else if (res.status() >= 200 && res.status() < 400) {
        recordRpcSuccess()
      } else if (res.status() >= 400) {
        rpcOtherErrors += 1
        if (method) recordRpcMethod(method)
        pushRpcEvent({
          status: `${res.status()}`,
          url,
          route: getRouteLabel(),
          method,
          kind: 'other'
        })
      }
    }
  })
  page.on('request', req => {
    const url = req.url()
    const postData = req.postData() || ''
    const isJsonRpc = isJsonRpcPayload(postData)
    if (isJsonRpc) {
      registerRpcHost(url)
    }
    if (isRpcUrl(url) || isJsonRpc) {
      lastRpcUrl = url
      if (rpcBaseUrl === 'unknown') {
        try {
          rpcBaseUrl = new URL(url).origin
        } catch (_) {
          rpcBaseUrl = url
        }
      }
    }
    if (/infura/i.test(url)) {
      infuraHits.push(url)
    }
    if (/uniswap/i.test(url)) {
      uniswapHits.push(url)
    }
  })

  currentRoute = 'swap'
  await page.goto(DEBUG_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT_DIR, beforeShot), fullPage: true })
  if (rpcBaseUrl === 'unknown') {
    try {
      const cfgResp = await page.request.get(`${BASE_URL}/ethernova.config.json`, { timeout: 5000 })
      if (cfgResp.ok()) {
        const cfg = await cfgResp.json()
        const urls = []
        if (typeof cfg?.rpcUrl === 'string') urls.push(cfg.rpcUrl)
        if (Array.isArray(cfg?.rpcUrls)) urls.push(...cfg.rpcUrls)
        const first = urls.find(Boolean)
        if (first) {
          try {
            rpcBaseUrl = new URL(first).origin
          } catch (_) {
            rpcBaseUrl = first
          }
        }
      }
    } catch (_) {
      // best-effort only
    }
  }

  const openTokenModal = async () => {
    const selectTokenButton = await page.locator('button:has-text("Select a token")').first()
    if (await selectTokenButton.count()) {
      await selectTokenButton.click()
    } else {
      await page.locator('.open-currency-select-button').first().click()
    }
    await page.waitForSelector('#token-search-input', { timeout: 30000 })
  }

  await openTokenModal()
  routesRendered.swap = true
  const pinnedWnova = page.locator('button:has-text("WNOVA")').first()
  if (await pinnedWnova.count()) {
    await pinnedWnova.click()
  } else {
    const firstTokenRow = page.locator('[class*="token-item-"]').first()
    if (await firstTokenRow.count()) await firstTokenRow.click()
  }
  await page.waitForTimeout(1000)

  // close modal if it is still open
  await page.keyboard.press('Escape').catch(() => undefined)
  await page.waitForTimeout(500)

  const poolTab = page.locator('a:has-text("Pool"), button:has-text("Pool")').first()
  if (await poolTab.count()) {
    await poolTab.click()
    routesRendered.pool = true
    currentRoute = 'pool'
  }
  await page.waitForTimeout(1500)

  const viewInfoLink = page.locator('a:has-text("View pool information")').first()
  if (await viewInfoLink.count()) {
    const href = await viewInfoLink.getAttribute('href')
    if (href && /uniswap/i.test(href)) {
      addLiquidityFailures.push(`Pool info link points to Uniswap: ${href}`)
    } else if (href && !/\/info\//.test(href)) {
      addLiquidityFailures.push(`Pool info link missing /info: ${href}`)
    }
  }

  const addLiquidity = page.locator('a:has-text("Add Liquidity"), button:has-text("Add Liquidity")').first()
  if (await addLiquidity.count()) {
    await addLiquidity.click()
    await page.waitForTimeout(1500)
    currentRoute = 'add-liquidity'
    const poolSelect = page.locator('button:has-text("Select a token")').first()
    if (await poolSelect.count()) {
      await poolSelect.click()
      try {
        await page.waitForSelector('#token-search-input', { timeout: 15000 })
        const poolPinned = page.locator('button:has-text("WNOVA")').first()
        if (await poolPinned.count()) {
          await poolPinned.click()
        }
      } catch (err) {
        consoleErrors.push(`[script] pool token modal not opened: ${err?.message || err}`)
      }
    }
  }

  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT_DIR, afterShot), fullPage: true })

  const addLiquidityRoutes = []
  if (wnovaAddress && tonyAddress) {
    addLiquidityRoutes.push(
      `${BASE_URL}/?debug=1#/add/${tonyAddress}/${wnovaAddress}`,
      `${BASE_URL}/?debug=1#/add/${wnovaAddress}/${tonyAddress}`
    )
  }

  for (const route of addLiquidityRoutes) {
    currentRoute = 'add-liquidity-route'
    await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(2000)
    // attempt to flip tokens by selecting the opposite token in the first selector
    const tokenAButton = page
      .locator('button:has-text("Select a token"), button:has-text("TONY"), button:has-text("WNOVA")')
      .first()
    if (await tokenAButton.count()) {
      await tokenAButton.click({ force: true })
      try {
        await page.waitForSelector('#token-search-input', { timeout: 15000 })
        const flipToken = page
          .locator('button:has-text("TONY"), button:has-text("WNOVA")')
          .nth(1)
        if (await flipToken.count()) {
          await flipToken.click({ force: true })
        }
      } catch (err) {
        consoleErrors.push(`[script] flip token modal not opened: ${err?.message || err}`)
      }
      await page.keyboard.press('Escape').catch(() => undefined)
    }
    const hasCrashText = await page.locator('text=NovaDEX crashed').count()
    if (hasCrashText) {
      addLiquidityFailures.push(`Crash screen detected for ${route}`)
    }

    const checkMaxForPanel = async (panelId, label) => {
      const panel = page.locator(`#${panelId}`)
      if (!(await panel.count())) return
      const maxButton = panel.locator('button:has-text("MAX")').first()
      if (!(await maxButton.count())) {
        return
      }
      let balanceText = ''
      try {
        balanceText = await panel.locator('text=/Balance:/').first().innerText()
      } catch (_) {
        balanceText = ''
      }
      const hasNonZeroBalance = balanceText && !/Balance:\s*0(\.0+)?/i.test(balanceText)
      if (!hasNonZeroBalance) {
        return
      }
      await maxButton.click({ force: true })
      await page.waitForTimeout(500)
      const input = panel.locator('input').first()
      const value = (await input.inputValue()) || ''
      if (!value || /^0(\.0+)?$/.test(value)) {
        addLiquidityFailures.push(`MAX ${label} produced "${value}" on ${route}`)
      }
    }

    await checkMaxForPanel('add-liquidity-input-tokena', 'tokenA')
    await checkMaxForPanel('add-liquidity-input-tokenb', 'tokenB')
  }

  currentRoute = 'import'
  await page.goto(`${DEBUG_URL}#/find`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(12000)
  const stillChecking = await page.locator('text=Checking position').count()
  if (stillChecking) {
    addLiquidityFailures.push('Import Pool stuck on "Checking position"')
  } else {
    routesRendered.import = true
  }

  currentRoute = 'explore'
  await page.goto(`${DEBUG_URL}#/explore`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(5000)
  const exploreCrash = await page.locator('text=NovaDEX crashed').count()
  if (exploreCrash) {
    addLiquidityFailures.push('NovaDEX crashed on Explore')
  } else {
    routesRendered.explore = true
  }

  const infoPairUrl = pairAddress
    ? `${BASE_URL}/info/#/pair/${pairAddress}`
    : `${BASE_URL}/info/`

  currentRoute = 'info-pair'
  await page.goto(infoPairUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(6000)
  const infoCrash = await page.locator('text=NovaDEX Analytics crashed').count()
  if (infoCrash) {
    addLiquidityFailures.push('NovaDEX Analytics crashed')
  }
  const candlePresent = await page.locator('#novadex-candle-chart').count()
  if (!candlePresent) {
    addLiquidityFailures.push('Analytics chart element not found')
  } else {
    routesRendered.infoPair = true
  }
  const currentUrl = page.url()
  if (/uniswap/i.test(currentUrl)) {
    addLiquidityFailures.push(`Analytics URL redirected to Uniswap: ${currentUrl}`)
  }
  const tradeLabelCount = await page.locator('text=/SELL TONY|BUY TONY/i').count()
  const noTradesLabel = await page.locator('text=No trades yet.').count()
  if (!tradeLabelCount && !noTradesLabel) {
    addLiquidityFailures.push('Recent trades missing BUY/SELL TONY labels')
  }

  if (wnovaAddress) {
    currentRoute = 'info-token'
    const tokenUrl = `${BASE_URL}/info/#/token/${wnovaAddress}`
    await page.goto(tokenUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(6000)
    const tokenCrash = await page.locator('text=NovaDEX Analytics crashed').count()
    if (tokenCrash) {
      addLiquidityFailures.push('Token page crashed for WNOVA')
    }
    const tokenHeader = await page.locator('[data-testid="token-header"]').count()
    if (!tokenHeader) {
      addLiquidityFailures.push('Token header missing on WNOVA token page')
    }
  }

  for (let i = 0; i < 20; i += 1) {
    currentRoute = 'info-overview'
    await page.goto(`${BASE_URL}/info/#/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(4000)
    const volumeCharts = await page.locator('[data-testid="chart-volume"]').count()
    const liquidityCharts = await page.locator('[data-testid="chart-liquidity"]').count()
    if (volumeCharts !== 1) {
      addLiquidityFailures.push(`Overview volume charts count ${volumeCharts} (refresh ${i + 1})`)
    }
    if (liquidityCharts !== 1) {
      addLiquidityFailures.push(`Overview liquidity charts count ${liquidityCharts} (refresh ${i + 1})`)
    }
    const banner = await page.locator('text=Subgraph offline').count()
    if (banner && (volumeCharts !== 1 || liquidityCharts !== 1)) {
      addLiquidityFailures.push('Subgraph offline banner blocked chart render')
    }
    const htmlContent = await page.content()
    if (/undefined%|NaN%/i.test(htmlContent)) {
      addLiquidityFailures.push('Overview contains undefined%/NaN%')
    }
    if (/\$/i.test(htmlContent)) {
      addLiquidityFailures.push('Overview contains $ (USD) strings')
    }
    if (/Page\\s+1\\s+of\\s+0/i.test(htmlContent)) {
      addLiquidityFailures.push('Overview pagination shows Page 1 of 0')
    }
  }
  routesRendered.infoOverview = true

  currentRoute = 'info-tokens'
  await page.goto(`${BASE_URL}/info/#/tokens`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)
  const tokenRows = await page.locator('[data-testid^="token-row-"]').count()
  if (!tokenRows) {
    addLiquidityFailures.push('Tokens list is empty')
  } else {
    routesRendered.infoTokens = true
  }

  currentRoute = 'info-pairs'
  await page.goto(`${BASE_URL}/info/#/pairs`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)
  const pairRows = await page.locator('[data-testid^="pair-row-"]').count()
  if (!pairRows) {
    addLiquidityFailures.push('Pairs list is empty')
  } else {
    routesRendered.infoPairs = true
  }

  const rootHtml = await page.evaluate(() => {
    const root = document.getElementById('root')
    return root ? root.innerHTML : ''
  })

  if (lastRpcSuccessAt > lastRpcErrorAt) {
    rpcConsecutive = 0
  }

  const crash = hasCrash(consoleErrors, pageErrors)
  const whiteScreen = isWhiteScreen(rootHtml)
  const rpcSoftFail = rpcSoft503 >= rpcSoftMax || rpcConsecutive >= rpcConsecMax
  const topRpcMethods = Object.entries(rpcMethodCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([method, count]) => ({ method, count }))
  const log = {
    url: DEBUG_URL,
    consoleErrors,
    pageErrors,
    requestFailures,
    infuraHits,
    uniswapHits,
    notFoundHits,
    addLiquidityFailures,
    whiteScreen,
    crash,
    summary: {
      consoleErrorsHard: hardConsoleErrors,
      rpcSoft503,
      rpcOtherErrors,
      rpcConsecutive,
      navigationOK: !crash && !whiteScreen,
      routesRendered,
      rpcBaseUrl,
      lastRpcUrl,
      lastSoft503Url,
      lastSoft503At,
      lastSoftRpcUrl: lastSoft503Url,
      lastSoftRpcAt: lastSoft503At,
      lastSoftRpcMethod,
      topRpcMethods
    },
    rpcEvents
  }
  writeFile(logFile, JSON.stringify(log, null, 2))

  await browser.close()

  const fatal =
    crash ||
    whiteScreen ||
    addLiquidityFailures.length > 0 ||
    infuraHits.length > 0 ||
    uniswapHits.length > 0 ||
    notFoundHits.length > 0 ||
    rpcSoftFail
  const warnings =
    hardConsoleErrors > 0 ||
    pageErrors.length > 0 ||
    requestFailures.length > 0 ||
    notFoundHits.length > 0 ||
    rpcOtherErrors > 0
  if (fatal) {
    console.error(`ui_click_smoke failed. See ${path.join(OUT_DIR, logFile)}`)
    process.exit(1)
  }
  if (warnings) {
    console.warn(`ui_click_smoke warnings. See ${path.join(OUT_DIR, logFile)}`)
  } else {
    console.log(`ui_click_smoke passed. See ${path.join(OUT_DIR, logFile)}`)
  }
}

main().catch(err => {
  console.error('ui_click_smoke error', err)
  process.exit(1)
})
