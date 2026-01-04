#!/usr/bin/env node
import fs from 'fs'

const configPath = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}

const rpcUrl = process.env.RPC_URL || config?.rpcUrl || 'https://rpc.ethnova.net'
const retryMax = Number(process.env.SMOKE_RPC_RETRY || '2')
const backoffMs = Number(process.env.SMOKE_RPC_BACKOFF_MS || '500')
const softMax = Number(process.env.SMOKE_RPC_SOFT_MAX || '5')
const totalCalls = Number(process.env.SMOKE_RPC_CALLS || '10')

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

const softStatuses = new Set([429, 502, 503, 504])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function rpcCall(method, params = []) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params })
  for (let attempt = 0; attempt <= retryMax; attempt += 1) {
    try {
      const res = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body
      })
      const text = await res.text()
      if (!res.ok) {
        if (softStatuses.has(res.status)) {
          if (attempt < retryMax) {
            await sleep(backoffMs * (attempt + 1))
            continue
          }
          return { ok: false, soft: true, status: res.status, error: text }
        }
        return { ok: false, soft: false, status: res.status, error: text }
      }
      const json = JSON.parse(text)
      if (json?.error) {
        return { ok: false, soft: false, status: 'rpc_error', error: JSON.stringify(json.error) }
      }
      return { ok: true, result: json?.result }
    } catch (err) {
      if (attempt < retryMax) {
        await sleep(backoffMs * (attempt + 1))
        continue
      }
      return { ok: false, soft: true, status: 'network', error: err?.message || 'network error' }
    }
  }
  return { ok: false, soft: true, status: 'unknown', error: 'unknown' }
}

async function main() {
  const calls = [
    { method: 'eth_chainId', params: [] },
    { method: 'net_version', params: [] },
    { method: 'eth_blockNumber', params: [] },
    { method: 'eth_blockNumber', params: [] },
    { method: 'eth_blockNumber', params: [] }
  ]

  const wnova = config?.tokens?.WNOVA?.address
  if (wnova && /^0x[0-9a-fA-F]{40}$/.test(wnova)) {
    const balanceOfSelector = '0x70a08231'
    const addressArg = wnova.toLowerCase().replace('0x', '').padStart(64, '0')
    calls.push({
      method: 'eth_call',
      params: [
        { to: wnova, data: `${balanceOfSelector}${addressArg}` },
        'latest'
      ]
    })
  }

  calls.push(
    { method: 'eth_getLogs', params: [{ fromBlock: 'latest', toBlock: 'latest' }] },
    { method: 'eth_blockNumber', params: [] },
    { method: 'eth_chainId', params: [] },
    { method: 'eth_blockNumber', params: [] }
  )

  const plan = calls.slice(0, totalCalls)
  let softErrors = 0
  let hardErrors = 0
  const events = []

  for (const entry of plan) {
    const res = await rpcCall(entry.method, entry.params)
    if (!res.ok) {
      if (res.soft) softErrors += 1
      else hardErrors += 1
    }
    events.push({
      method: entry.method,
      ok: res.ok,
      soft: res.soft || false,
      status: res.status,
      error: res.error || ''
    })
  }

  log(`[INFO] RPC health: url=${rpcUrl}`)
  log(`[INFO] softErrors=${softErrors} hardErrors=${hardErrors} total=${plan.length}`)
  events.slice(0, 10).forEach((ev) => {
    log(`[INFO] ${ev.method} ok=${ev.ok} status=${ev.status}`)
  })

  if (softErrors >= softMax) {
    warn('RPC_UNSTABLE: soft error threshold exceeded')
    process.exit(2)
  }
  if (hardErrors > 0) {
    fail(`RPC hard errors detected: ${hardErrors}`)
  }
}

main().catch((err) => fail(err.message))
