import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'

const OUT_DIR = '/opt/novadex/scripts/out'
const BASE_URL = process.env.BASE_URL || 'https://dex.ethnova.net'
const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const ACCOUNT = (process.env.TEST_ADDRESS || '0x2DAf4F20180b5f5b2DaD430691f5ac961d7295b6').toLowerCase()
const CHAIN_ID_HEX = '0x1dab5'
const DEPLOYMENTS = '/opt/novadex/contracts/deployments.json'

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function writeFile(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), data)
}

async function main() {
  ensureDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logFile = `ui_max_token_smoke-${stamp}.log`
  const log = { steps: [] }

  let wnova = 'WNOVA'
  let tony = 'TONY'
  let wnovaAddress = ''
  let tonyAddress = ''
  try {
    const raw = fs.readFileSync(DEPLOYMENTS, 'utf8')
    const parsed = JSON.parse(raw)
    wnova = parsed?.tokens?.WNOVA?.symbol || 'WNOVA'
    tony = parsed?.tokens?.TONY?.symbol || 'TONY'
    wnovaAddress = parsed?.addresses?.wnova || ''
    tonyAddress = parsed?.addresses?.tony || ''
  } catch {
    // ignore
  }

  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  await page.addInitScript(({ rpcUrl, account, chainIdHex }) => {
    const listeners = {}
    const request = async ({ method, params }) => {
      if (method === 'eth_chainId') return chainIdHex
      if (method === 'net_version') return String(parseInt(chainIdHex, 16))
      if (method === 'eth_accounts' || method === 'eth_requestAccounts') return [account]
      if (method === 'wallet_switchEthereumChain' || method === 'wallet_addEthereumChain') return null
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
      })
      const text = await res.text()
      if (!res.ok || /^\s*</.test(text)) {
        throw new Error(`RPC ${res.status}`)
      }
      const json = JSON.parse(text)
      if (json.error) throw new Error(json.error.message || 'RPC error')
      return json.result
    }

    const send = async (methodOrPayload, paramsOrCallback) => {
      if (typeof methodOrPayload === 'string') {
        return request({ method: methodOrPayload, params: paramsOrCallback })
      }
      const payload = methodOrPayload
      const callback = typeof paramsOrCallback === 'function' ? paramsOrCallback : undefined
      try {
        const result = await request({ method: payload.method, params: payload.params })
        const response = { jsonrpc: '2.0', id: payload.id, result }
        callback && callback(null, response)
        return response
      } catch (err) {
        const response = { jsonrpc: '2.0', id: payload.id, error: err }
        callback && callback(err, response)
        throw err
      }
    }

    window.ethereum = {
      isMetaMask: true,
      request,
      send,
      sendAsync: send,
      enable: () => request({ method: 'eth_requestAccounts', params: [] }),
      on: (event, handler) => {
        listeners[event] = listeners[event] || []
        listeners[event].push(handler)
      },
      removeListener: (event, handler) => {
        if (!listeners[event]) return
        listeners[event] = listeners[event].filter(fn => fn !== handler)
      }
    }
  }, { rpcUrl: RPC_URL, account: ACCOUNT, chainIdHex: CHAIN_ID_HEX })

  await page.goto(`${BASE_URL}/?debug=1#/swap`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.waitForTimeout(1500)

  const connectButton = page.locator('button:has-text("Connect Wallet")')
  if (await connectButton.count()) {
    await connectButton.click({ force: true })
    const injectedButton = page.locator('button:has-text("MetaMask"), button:has-text("Injected"), button:has-text("Browser Wallet")').first()
    if (await injectedButton.count()) {
      await injectedButton.click({ force: true })
    }
    await page.waitForTimeout(1200)
  }

  const pickToken = async (buttonSelector, tokenSymbol) => {
    await page.locator(buttonSelector).first().click({ force: true })
    await page.waitForSelector('#token-search-input', { timeout: 15000 })
    const tokenButton = page.locator(`button:has-text("${tokenSymbol}")`).first()
    if (!(await tokenButton.count())) {
      throw new Error(`Token ${tokenSymbol} not found in modal`)
    }
    await tokenButton.click({ force: true })
  }

  await pickToken('#swap-currency-input .open-currency-select-button', tony)
  await page.waitForTimeout(500)
  await pickToken('#swap-currency-output .open-currency-select-button', wnova)
  await page.waitForTimeout(1200)

  const maxButton = page.locator('#swap-currency-input button:has-text("MAX")')
  if (!(await maxButton.count())) throw new Error('MAX button not found on swap')

  const isDisabled = await maxButton.isDisabled()
  if (isDisabled) {
    throw new Error('MAX button is disabled on swap input')
  }

  const input = page.locator('#swap-currency-input input.token-amount-input')
  const before = await input.inputValue()
  await maxButton.click({ force: true })
  await page.waitForTimeout(600)
  const after = await input.inputValue()

  log.steps.push({ step: 'swap-max', before, after })

  if (!after || after === '0' || after === before) {
    throw new Error(`Swap MAX did not update input (before=${before}, after=${after})`)
  }

  if (!wnovaAddress || !tonyAddress) {
    throw new Error('Missing token addresses in deployments.json for add-liquidity route')
  }

  await page.goto(`${BASE_URL}/?debug=1#/add/${tonyAddress}/${wnovaAddress}`, {
    waitUntil: 'domcontentloaded',
    timeout: 60000
  })
  await page.waitForTimeout(2000)

  const maxA = page.locator('#add-liquidity-input-tokena button:has-text("MAX")')
  if (!(await maxA.count())) throw new Error('MAX button not found on add-liquidity tokenA')
  if (await maxA.isDisabled()) throw new Error('MAX tokenA is disabled')
  const inputA = page.locator('#add-liquidity-input-tokena input.token-amount-input')
  const beforeA = await inputA.inputValue()
  await maxA.click({ force: true })
  await page.waitForTimeout(600)
  const afterA = await inputA.inputValue()
  log.steps.push({ step: 'add-liq-max-a', before: beforeA, after: afterA })
  if (!afterA || afterA === '0' || afterA === beforeA) {
    throw new Error(`Add liquidity MAX tokenA did not update (before=${beforeA}, after=${afterA})`)
  }

  const maxB = page.locator('#add-liquidity-input-tokenb button:has-text("MAX")')
  if (await maxB.count()) {
    if (!(await maxB.isDisabled())) {
      const inputB = page.locator('#add-liquidity-input-tokenb input.token-amount-input')
      const beforeB = await inputB.inputValue()
      await maxB.click({ force: true })
      await page.waitForTimeout(600)
      const afterB = await inputB.inputValue()
      log.steps.push({ step: 'add-liq-max-b', before: beforeB, after: afterB })
      if (!afterB || afterB === '0' || afterB === beforeB) {
        throw new Error(`Add liquidity MAX tokenB did not update (before=${beforeB}, after=${afterB})`)
      }
    }
  }

  const crash = await page.locator('text=NovaDEX crashed').count()
  if (crash) throw new Error('NovaDEX crashed during MAX token smoke')

  await browser.close()
  writeFile(logFile, JSON.stringify(log, null, 2))
  console.log(`ui_max_token_smoke passed. See ${path.join(OUT_DIR, logFile)}`)
}

main().catch(err => {
  console.error('ui_max_token_smoke failed', err)
  process.exit(1)
})
