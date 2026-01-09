import fs from 'fs'
import path from 'path'
import { chromium } from 'playwright'

const OUT_DIR = '/opt/novadex/scripts/out'
const BASE_URL = process.env.BASE_URL || 'https://dex.ethnova.net'
const RPC_URL = process.env.RPC_URL || 'https://rpc.ethnova.net'
const ACCOUNT = (process.env.TEST_ADDRESS || '0x2DAf4F20180b5f5b2DaD430691f5ac961d7295b6').toLowerCase()
const CHAIN_ID_HEX = '0x1dab5'

function ensureDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function writeFile(name, data) {
  fs.writeFileSync(path.join(OUT_DIR, name), data)
}

async function rpc(method, params) {
  const res = await fetch(RPC_URL, {
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

async function main() {
  ensureDir()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const logFile = `ui_max_native_smoke-${stamp}.log`

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
  await page.waitForTimeout(2000)

  const connectButton = page.locator('button:has-text("Connect Wallet")')
  if (await connectButton.count()) {
    await connectButton.click({ force: true })
    const injectedButton = page.locator('button:has-text("MetaMask"), button:has-text("Injected"), button:has-text("Browser Wallet")').first()
    if (await injectedButton.count()) {
      await injectedButton.click({ force: true })
    }
    await page.waitForTimeout(1500)
  }

  const maxButton = page.locator('#swap-currency-input button:has-text("MAX")')
  if (!(await maxButton.count())) {
    throw new Error('MAX button not found')
  }
  await maxButton.click({ force: true })
  await page.waitForTimeout(800)

  const input = page.locator('#swap-currency-input input.token-amount-input')
  const rawValue = await input.inputValue()
  const maxValue = Number(rawValue)

  const balanceHex = await rpc('eth_getBalance', [ACCOUNT, 'latest'])
  const balanceWei = BigInt(balanceHex)
  const balance = Number(balanceWei) / 1e18
  const buffer = balance - maxValue

  const log = {
    account: ACCOUNT,
    maxValue: rawValue,
    balance,
    buffer
  }
  writeFile(logFile, JSON.stringify(log, null, 2))

  await browser.close()

  if (!Number.isFinite(maxValue) || maxValue <= 0) {
    throw new Error('MAX value is not a positive number')
  }
  if (!Number.isFinite(buffer) || buffer <= 0) {
    throw new Error('MAX did not leave a gas buffer')
  }

  console.log(`ui_max_native_smoke passed. See ${path.join(OUT_DIR, logFile)}`)
}

main().catch(err => {
  console.error('ui_max_native_smoke failed', err)
  process.exit(1)
})
