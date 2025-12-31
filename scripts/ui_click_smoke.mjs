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

  const isRpcUrl = url => rpcHosts.some(host => host && url.includes(host))
  const isSoftRpcText = text =>
    /503|Service Unavailable|gateway|Internal JSON-RPC error|failed to fetch|NetworkError|ECONNRESET|ETIMEDOUT/i.test(
      text
    )
  const isHardConsole = text => /ChunkLoadError|Loading chunk|Uncaught|TypeError|ReferenceError|Invariant failed/i.test(text)
  const isIgnoredWarning = text => /Redux-LocalStorage-Simple/i.test(text)

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  page.on('console', msg => {
    const text = msg.text()
    const line = `[console.${msg.type()}] ${text}`
    if (msg.type() === 'error' || msg.type() === 'warning') {
      const isSoftRpc = isSoftRpcText(text) && rpcHosts.some(host => text.includes(host))
      const recentRpc = Date.now() - lastRpcErrorAt < 10000
      if (isIgnoredWarning(text)) {
        return
      }
      if (isHardConsole(text)) {
        hardConsoleErrors += 1
        consoleErrors.push(line)
      } else if (isSoftRpc || (isSoftRpcText(text) && recentRpc)) {
        rpcSoft503 += 1
        rpcConsecutive += 1
        lastRpcErrorAt = Date.now()
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
    if (isRpcUrl(url) && /503|429|502|504|timeout|ECONNRESET|ETIMEDOUT/i.test(errText)) {
      rpcSoft503 += 1
      rpcConsecutive += 1
      lastRpcErrorAt = Date.now()
      return
    }
    requestFailures.push(line)
    if (isRpcUrl(url)) {
      rpcOtherErrors += 1
    }
  })
  page.on('response', res => {
    const url = res.url()
    if (res.status() === 404) {
      notFoundHits.push(url)
    }
    if (isRpcUrl(url)) {
      if ([429, 502, 503, 504].includes(res.status())) {
        rpcSoft503 += 1
        rpcConsecutive += 1
        lastRpcErrorAt = Date.now()
      } else if (res.status() >= 200 && res.status() < 400) {
        rpcConsecutive = 0
        lastRpcSuccessAt = Date.now()
      } else if (res.status() >= 400) {
        rpcOtherErrors += 1
      }
    }
  })
  page.on('request', req => {
    const url = req.url()
    if (/infura/i.test(url)) {
      infuraHits.push(url)
    }
    if (/uniswap/i.test(url)) {
      uniswapHits.push(url)
    }
  })

  await page.goto(DEBUG_URL, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: path.join(OUT_DIR, beforeShot), fullPage: true })

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

  await page.goto(`${DEBUG_URL}#/find`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(12000)
  const stillChecking = await page.locator('text=Checking position').count()
  if (stillChecking) {
    addLiquidityFailures.push('Import Pool stuck on "Checking position"')
  } else {
    routesRendered.import = true
  }

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

  if (wnovaAddress) {
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

  for (let i = 0; i < 3; i += 1) {
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
  }
  routesRendered.infoOverview = true

  await page.goto(`${BASE_URL}/info/#/tokens`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForTimeout(4000)
  const tokenRows = await page.locator('[data-testid^="token-row-"]').count()
  if (!tokenRows) {
    addLiquidityFailures.push('Tokens list is empty')
  } else {
    routesRendered.infoTokens = true
  }

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
  const rpcSoftFail = rpcSoft503 >= 5 || rpcConsecutive >= 3
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
      routesRendered
    }
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
