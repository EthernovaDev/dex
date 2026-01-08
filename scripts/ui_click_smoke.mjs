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
    infoPairs: false,
    create: false
  }
  const requireNonZero = process.env.SMOKE_REQUIRE_NONZERO === '1'
  const minLiqWnova = Number(process.env.SMOKE_MIN_LIQ_WNOVA || '0.1')
  const minVolWnova = Number(process.env.SMOKE_MIN_VOL24H_WNOVA || '0.001')
  const pairExpect = (process.env.SMOKE_PAIR_EXPECT || 'TONY-WNOVA').toUpperCase()
  const boostPairExpect = (process.env.SMOKE_BOOST_PAIR || '').toLowerCase()

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
  const rpcRetry = toInt(process.env.SMOKE_RPC_RETRY, 2)
  const rpcBackoffMs = toInt(process.env.SMOKE_RPC_BACKOFF_MS, 500)
  const rpcLogMax = toInt(process.env.SMOKE_RPC_LOG_MAX, 20)
  const rpcOverrideUrls = (process.env.SMOKE_RPC_URLS || '')
    .split(',')
    .map(url => url.trim())
    .filter(Boolean)
  const useRpcOverride = rpcOverrideUrls.length > 0
  let rpcOverrideIndex = 0
  let rpcFallbackEnabled = false
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
  const normalizeRpcUrl = url => {
    try {
      return new URL(url).origin
    } catch (_) {
      return url
    }
  }
  const buildRpcUrl = (base, original) => {
    try {
      const baseUrl = new URL(base)
      const originalUrl = new URL(original)
      return `${baseUrl.origin}${originalUrl.pathname}${originalUrl.search}`
    } catch (_) {
      return base
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
  const parseNumeric = text => {
    if (!text) return null
    const cleaned = text.replace(/[,\\s]/g, '')
    if (!cleaned || cleaned.includes('—')) return null
    const normalized = cleaned.startsWith('<') ? cleaned.slice(1) : cleaned
    const value = parseFloat(normalized)
    return Number.isFinite(value) ? value : null
  }

  console.log(
    `[INFO] RPC thresholds: window=${rpcErrorWindowMs}ms softMax=${rpcSoftMax} consecMax=${rpcConsecMax} logMax=${rpcLogMax} retry=${rpcRetry} backoff=${rpcBackoffMs}ms`
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
    if (useRpcOverride) {
      rpcFallbackEnabled = true
    }
    triggerRpcProbe()
  }

  const recordRpcSuccess = () => {
    lastRpcSuccessAt = Date.now()
    if (lastSoftIncidentAt && Date.now() - lastSoftIncidentAt > 4000) {
      rpcConsecutive = 0
    }
  }

  let rpcProbeInFlight = false
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
  const triggerRpcProbe = () => {
    if (rpcProbeInFlight) return
    rpcProbeInFlight = true
    const probeUrl = rpcBaseUrl !== 'unknown' ? rpcBaseUrl : rpcEnvUrl
    const attemptProbe = async () => {
      let lastErr = null
      for (let attempt = 0; attempt <= rpcRetry; attempt += 1) {
        try {
          const resp = await fetch(probeUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] })
          })
          if (!resp.ok) {
            lastErr = new Error(`HTTP ${resp.status}`)
            if (isSoftRpcStatus(resp.status())) {
              await sleep(rpcBackoffMs * (attempt + 1))
              continue
            }
            break
          }
          const json = await resp.json()
          if (json?.result) {
            recordRpcSuccess()
            return
          }
        } catch (err) {
          lastErr = err
          await sleep(rpcBackoffMs * (attempt + 1))
        }
      }
      if (lastErr) {
        rpcOtherErrors += 1
      }
    }
    attemptProbe().finally(() => {
      rpcProbeInFlight = false
    })
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
    const message = err?.message || String(err)
    const hostHint = rpcBaseUrl !== 'unknown' ? getHost(rpcBaseUrl) : null
    const isSoftRpc =
      isSoftRpcText(message) &&
      ((lastRpcUrl && isRpcUrl(lastRpcUrl)) || (hostHint && message.includes(hostHint)) || rpcHosts.some(host => message.includes(host)))
    if (isSoftRpc) {
      recordRpcSoft({ url: lastRpcUrl, method: '', status: 'other' })
      return
    }
    pageErrors.push(`[pageerror] ${message}`)
  })
  page.on('requestfailed', req => {
    const url = req.url()
    const errText = req.failure()?.errorText || ''
    if (/ERR_ABORTED/i.test(errText) && /\/subgraphs\//i.test(url)) {
      return
    }
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
    if (useRpcOverride && isRpcUrl(url)) {
      return
    }
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

  if (useRpcOverride) {
    const rpcTargets = rpcOverrideUrls.map(normalizeRpcUrl)
    page.route('**/*', async route => {
      const req = route.request()
      const url = req.url()
      const postData = req.postData() || ''
      const isJsonRpc = isJsonRpcPayload(postData)
      if (!isJsonRpc || !isRpcUrl(url)) {
        return route.continue()
      }
      const method = extractRpcMethods(postData)[0] || ''
      const targets = rpcFallbackEnabled ? rpcTargets : [rpcTargets[0]]
      let lastErr = null
      for (let i = 0; i < targets.length; i += 1) {
        const targetBase = targets[i]
        const targetUrl = buildRpcUrl(targetBase, url)
        lastRpcUrl = targetUrl
        if (rpcBaseUrl === 'unknown') {
          rpcBaseUrl = targetBase
        }
        try {
          const resp = await fetch(targetUrl, {
            method: req.method(),
            headers: req.headers(),
            body: postData || undefined
          })
          const body = await resp.text()
          if (isSoftRpcStatus(resp.status) && i < targets.length - 1) {
            recordRpcSoft({ url: targetUrl, method, status: `${resp.status}` })
            continue
          }
          if (resp.status >= 200 && resp.status < 400) {
            recordRpcSuccess()
          } else if (isSoftRpcStatus(resp.status)) {
            recordRpcSoft({ url: targetUrl, method, status: `${resp.status}` })
          } else {
            rpcOtherErrors += 1
            if (method) recordRpcMethod(method)
            pushRpcEvent({
              status: `${resp.status}`,
              url: targetUrl,
              route: getRouteLabel(),
              method,
              kind: 'other'
            })
          }
          return route.fulfill({
            status: resp.status,
            headers: Object.fromEntries(resp.headers.entries()),
            body
          })
        } catch (err) {
          lastErr = err
          recordRpcSoft({ url: targetUrl, method, status: 'other' })
        }
      }
      if (lastErr) {
        return route.abort('failed')
      }
      return route.continue()
    })
  }

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
    const tokenProfile = await page.locator('[data-testid="token-profile"]').count()
    if (tokenProfile) {
      const headerText = await page.locator('[data-testid="token-header"]').innerText()
      if (/Unknown Token/i.test(headerText) || /\(UNKNOWN\)/i.test(headerText)) {
        addLiquidityFailures.push('Token header did not fall back to profile metadata')
      }
    }
  }

  currentRoute = 'info-tokens'
  await page.goto(`${BASE_URL}/info/#/tokens`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)
  const tokenRows = await page.locator('[data-testid^="token-row-"]').count()
  if (!tokenRows) {
    addLiquidityFailures.push('Tokens list is empty')
  } else {
    routesRendered.infoTokens = true
  }
  if (requireNonZero && tokenRows) {
    const wnovaLower = wnovaAddress ? wnovaAddress.toLowerCase() : ''
    const tonyLower = tonyAddress ? tonyAddress.toLowerCase() : ''
    if (wnovaLower) {
      const wnovaPriceCell = page.locator(`[data-testid="token-price-${wnovaLower}"]`)
      const wnovaPriceText = (await wnovaPriceCell.count()) ? await wnovaPriceCell.innerText() : ''
      const wnovaPrice = parseNumeric(wnovaPriceText)
      if (!Number.isFinite(wnovaPrice) || wnovaPrice === null || wnovaPrice === 0) {
        addLiquidityFailures.push(`WNOVA price missing or zero in tokens table (${wnovaPriceText})`)
      }
    }
    if (tonyLower) {
      const liqCell = page.locator(`[data-testid="token-liquidity-${tonyLower}"]`)
      const volCell = page.locator(`[data-testid="token-volume-${tonyLower}"]`)
      const liqText = (await liqCell.count()) ? await liqCell.innerText() : ''
      const volText = (await volCell.count()) ? await volCell.innerText() : ''
      const liqVal = parseNumeric(liqText)
      const volVal = parseNumeric(volText)
      if (!Number.isFinite(liqVal) || liqVal === null || liqVal < minLiqWnova) {
        addLiquidityFailures.push(`TONY liquidity below threshold (${liqText})`)
      }
      if (!Number.isFinite(volVal) || volVal === null || volVal < minVolWnova) {
        addLiquidityFailures.push(`TONY volume below threshold (${volText})`)
      }
    }
  }

  currentRoute = 'info-pairs'
  await page.goto(`${BASE_URL}/info/#/pairs`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  try {
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid^="pair-row-"]').length > 0,
      {},
      { timeout: 25000 }
    )
  } catch (_) {
    // continue and evaluate below
  }
  const pairRows = await page.locator('[data-testid^="pair-row-"]').count()
  if (!pairRows) {
    addLiquidityFailures.push('Pairs list is empty')
  } else {
    routesRendered.infoPairs = true
  }
  let pairDiagnostics = {}
  if (pairAddress && pairRows) {
    const pairKey = pairAddress.toLowerCase()
    const liqSelector = `[data-testid="pair-liquidity-${pairKey}"]`
    try {
      await page.waitForSelector('[data-testid^="pair-liquidity-"]', { timeout: 15000 })
    } catch (_) {
      // ignore, fallback below
    }
    try {
      await page.waitForFunction(
        (key) => {
          const row =
            document.querySelector(`[data-testid=\"pair-row-${key}\"]`) ||
            document.querySelector('[data-testid^="pair-row-"]')
          if (!row) return false
          const text = row.textContent || ''
          return /TONY/i.test(text) && /WNOVA/i.test(text)
        },
        pairKey,
        { timeout: 20000 }
      )
    } catch (_) {
      // ignore, fallback below
    }
    try {
      await page.waitForFunction(
        (key) =>
          Boolean(document.querySelector(`[data-testid="pair-row-${key}"]`)) ||
          document.querySelectorAll('[data-testid^="pair-row-"]').length > 0,
        pairKey,
        { timeout: 15000 }
      )
    } catch (_) {
      // ignore, will handle below
    }

    const resolvePairLiquidity = async () => {
      let row = page.locator(`[data-testid="pair-row-${pairKey}"]`)
      if (!(await row.count())) {
        row = page
          .locator('[data-testid^="pair-row-"]')
          .filter({ hasText: /TONY/i })
          .filter({ hasText: /WNOVA/i })
          .first()
      }
      if (!(await row.count())) {
        row = page.locator('[data-testid^="pair-row-"]').first()
      }

      let cell = page.locator(liqSelector)
      if (!(await cell.count()) && (await row.count())) {
        cell = row.locator('[data-testid^="pair-liquidity-"]').first()
      }
      return { row, cell }
    }

    let { row: pairRow, cell: liqCell } = await resolvePairLiquidity()
    if (!(await liqCell.count())) {
      await page.waitForTimeout(8000)
      ;({ row: pairRow, cell: liqCell } = await resolvePairLiquidity())
    }
    try {
      await page.waitForFunction(
        () => {
          const row = document.querySelector('[data-testid^="pair-row-"]')
          if (!row) return false
          return (row.textContent || '').trim().length > 0
        },
        {},
        { timeout: 20000 }
      )
    } catch (_) {
      // ignore
    }

    const capturePairDiagnostics = async (label) => {
      const rowCount = await pairRow.count()
      const liqCount = await liqCell.count()
      const rowText = rowCount ? await pairRow.innerText() : ''
      const liqText = liqCount ? await liqCell.innerText() : ''
      return {
        attempt: label,
        rowCount,
        liqCount,
        rowText,
        liqText
      }
    }

    pairDiagnostics = {
      pairKey,
      liqSelector,
      ...(await capturePairDiagnostics('initial'))
    }

    if (!pairDiagnostics.rowText || !pairDiagnostics.liqCount) {
      await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 })
      await page.waitForTimeout(8000)
      ;({ row: pairRow, cell: liqCell } = await resolvePairLiquidity())
      pairDiagnostics = {
        ...pairDiagnostics,
        ...(await capturePairDiagnostics('reload'))
      }
    }

    if (pairDiagnostics.rowCount) {
      if (!/TONY/i.test(pairDiagnostics.rowText || '') || !/WNOVA/i.test(pairDiagnostics.rowText || '')) {
        addLiquidityFailures.push('Top pairs did not include TONY/WNOVA row')
      }
    }
    if (pairDiagnostics.liqCount) {
      if ((pairDiagnostics.liqText || '').includes('—')) {
        addLiquidityFailures.push('Top pair liquidity shows — despite existing pool')
      }
      if (requireNonZero) {
        const liqValue = parseNumeric(pairDiagnostics.liqText || '')
        if (!Number.isFinite(liqValue) || liqValue === null || liqValue < minLiqWnova) {
          addLiquidityFailures.push(`Top pair liquidity below threshold (${pairDiagnostics.liqText || 'n/a'})`)
        }
      }
    } else {
      addLiquidityFailures.push('Top pair liquidity cell missing')
    }
  }

  for (let i = 0; i < 20; i += 1) {
    currentRoute = 'info-overview'
    await page.goto(`${BASE_URL}/info/#/overview`, { waitUntil: 'domcontentloaded', timeout: 60000 })
    await page.waitForTimeout(4000)
    if (i === 0) {
      const marketTitle = await page.locator('[data-testid="market-activity-title"]').first()
      if (await marketTitle.count()) {
        const titleText = (await marketTitle.textContent()) || ''
        if (!/WNOVA/i.test(titleText) || !/\//.test(titleText)) {
          addLiquidityFailures.push(`Market activity title missing pair label (${titleText.trim() || 'empty'})`)
        }
      } else {
        addLiquidityFailures.push('Market activity title missing data-testid')
      }
      const priceCard = page.locator('[data-testid="market-pool-price"]')
      const priceLabel = page.locator('[data-testid="market-pool-price-label"]')
      const priceValue = page.locator('[data-testid="market-pool-price-value"]')
      if (await priceCard.count()) {
        const cardBox = await priceCard.boundingBox()
        const labelBox = await priceLabel.boundingBox()
        const valueBox = await priceValue.boundingBox()
        if (!labelBox || !valueBox || !cardBox) {
          addLiquidityFailures.push('Market price card missing bounding boxes')
        } else {
          if (valueBox.y <= labelBox.y + labelBox.height - 2) {
            addLiquidityFailures.push('Market price value overlaps label')
          }
          if (valueBox.y < cardBox.y || valueBox.y + valueBox.height > cardBox.y + cardBox.height) {
            addLiquidityFailures.push('Market price value out of card bounds')
          }
        }
      } else {
        addLiquidityFailures.push('Market price card missing data-testid')
      }
    }
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
    if (boostPairExpect) {
      const boostPairs = await page.$$eval('[data-boost-pair]', (nodes) =>
        nodes.map((node) => node.getAttribute('data-boost-pair')).filter(Boolean)
      )
      const found = boostPairs.some((addr) => String(addr).toLowerCase() === boostPairExpect)
      if (!found) {
        addLiquidityFailures.push(`Boosted pair not found in home list: ${boostPairExpect}`)
      }
    }
  }
  routesRendered.infoOverview = true

  currentRoute = 'info-home-rpcfail'
  await page.goto(`${BASE_URL}/info/?rpcFail=1#/home`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(3000)
  const rpcWarning = await page.locator('[data-testid="boost-rpc-warning"]').count()
  if (!rpcWarning) {
    addLiquidityFailures.push('RPC busy banner missing on home when rpcFail=1')
  }
  const boostedHeader = await page.locator('text=Boosted Tokens (24h)').count()
  if (!boostedHeader) {
    addLiquidityFailures.push('Boosted Tokens header missing on home when rpcFail=1')
  }
  const rpcFailHtml = await page.content()
  if (/Cannot read properties|TypeError|NovaDEX Analytics crashed/i.test(rpcFailHtml)) {
    addLiquidityFailures.push('RPC busy page contains JS TypeError text')
  }

  currentRoute = 'create'
  await page.goto(`${DEBUG_URL}#/create`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(2000)
  const createPage = await page.locator('[data-testid="create-page"]').count()
  if (!createPage) {
    addLiquidityFailures.push('Create page missing root testid')
  } else {
    const panelCount = await page.locator('[data-testid="create-info-panel"]').count()
    if (!panelCount) {
      addLiquidityFailures.push('Create info panel missing on desktop view')
    }
    const inputChecks = [
      ['create-input-name', 'Name your coin'],
      ['create-input-symbol', 'Add a coin ticker'],
      ['create-input-description', 'Write a short description'],
      ['create-input-logo-url', 'Image URL'],
      ['create-input-website', 'Add URL'],
      ['create-input-x', 'Add URL'],
      ['create-input-telegram', 'Add URL'],
      ['create-input-discord', 'Add URL']
    ]
    for (const [testId, placeholder] of inputChecks) {
      const locator = page.locator(`[data-testid="${testId}"]`)
      if (!(await locator.count())) {
        addLiquidityFailures.push(`Create input missing: ${testId}`)
        continue
      }
      const value = await locator.inputValue()
      if (value) {
        addLiquidityFailures.push(`Create input ${testId} not empty by default`)
      }
      if (placeholder) {
        const attr = await locator.getAttribute('placeholder')
        if (attr && !attr.includes(placeholder)) {
          addLiquidityFailures.push(`Create input ${testId} placeholder mismatch (${attr})`)
        }
      }
    }
    const fileInput = await page.locator('[data-testid="create-input-logo-file"]').count()
    if (!fileInput) {
      addLiquidityFailures.push('Create logo file picker missing')
    }
    routesRendered.create = true
  }
  const createSuccess = await page.locator('[data-testid="create-success"]').count()
  if (createSuccess) {
    const pairAddressBlock = await page.locator('[data-testid="create-success-pair-address"]').count()
    const pairStatusBlock = await page.locator('[data-testid="create-success-pair-status"]').count()
    if (!pairAddressBlock) {
      addLiquidityFailures.push('Create success missing pair address block')
    }
    if (!pairStatusBlock) {
      addLiquidityFailures.push('Create success missing pair status block')
    }
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
    rpcEvents,
    pairDiagnostics
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
