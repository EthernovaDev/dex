import { utils } from 'ethers'
import BigNumber from 'bignumber.js'
import { useEffect, useState } from 'react'

const SYNC_INTERFACE = new utils.Interface(['event Sync(uint112 reserve0, uint112 reserve1)'])
const SYNC_TOPIC =
  SYNC_INTERFACE.events['Sync(uint112,uint112)']?.topic || SYNC_INTERFACE.events.Sync?.topic || utils.id('Sync(uint112,uint112)')

const DEFAULT_WINDOW = 20000
const CACHE_LIMIT = 120

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function isHtml(text) {
  return /<html/i.test(text) || /<!doctype/i.test(text) || text.trim().startsWith('<')
}

async function rpcCall(rpcUrl, method, params, timeoutMs = 10000) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
      signal: controller.signal
    })
    const text = await res.text()
    if (!res.ok || isHtml(text)) {
      throw new Error(`RPC ${res.status}`)
    }
    const json = JSON.parse(text)
    if (json.error) throw new Error(json.error.message || 'RPC error')
    return json.result
  } finally {
    clearTimeout(timeout)
  }
}

async function rpcCallWithRetry(rpcUrl, method, params, attempts = 3) {
  let delay = 400
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await rpcCall(rpcUrl, method, params)
    } catch (err) {
      lastErr = err
      await sleep(delay)
      delay = Math.min(delay * 2, 4000)
    }
  }
  throw lastErr || new Error('RPC unavailable')
}

function cacheKey(pairAddress) {
  return `novadex-info-spot:${pairAddress.toLowerCase()}`
}

export function useSpotPriceHistory(rpcUrl, factoryAddress, wnovaAddress, tonyAddress, startBlock = 0) {
  const [state, setState] = useState({ status: 'idle', prices: [], error: null, lastPrice: null })

  useEffect(() => {
    if (!rpcUrl || !factoryAddress || !wnovaAddress || !tonyAddress) return
    let cancelled = false
    let intervalId

    const loadCache = pair => {
      try {
        const raw = localStorage.getItem(cacheKey(pair))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.prices?.length) return null
        return parsed
      } catch {
        return null
      }
    }

    const saveCache = (pair, entry) => {
      try {
        localStorage.setItem(cacheKey(pair), JSON.stringify(entry))
      } catch {
        // ignore
      }
    }

    const fetchOnce = async () => {
      setState(prev => ({ ...prev, status: 'loading', error: null }))
      try {
        const pad = addr => addr.replace('0x', '').padStart(64, '0')
        const pairRaw = await rpcCallWithRetry(
          rpcUrl,
          'eth_call',
          [{ to: factoryAddress, data: `0xe6a43905${pad(wnovaAddress)}${pad(tonyAddress)}` }, 'latest']
        )
        const pairAddress = `0x${pairRaw.slice(-40)}`
        if (!pairAddress || /^0x0+$/.test(pairAddress)) {
          throw new Error('Pair not found')
        }

        const cached = loadCache(pairAddress)
        if (cached && !cancelled) {
          setState({ status: 'ok', prices: cached.prices, lastPrice: cached.prices[cached.prices.length - 1] })
        }
        if (cached?.updatedAt && Date.now() - cached.updatedAt < 120000 && cached.prices?.length) {
          return
        }

        const latestHex = await rpcCallWithRetry(rpcUrl, 'eth_blockNumber', [], 3)
        const latestBlock = Number.parseInt(latestHex, 16)
        const fromBlock = cached?.lastBlock ? cached.lastBlock + 1 : Math.max(startBlock, latestBlock - DEFAULT_WINDOW)

        const token0Raw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: '0x0dfe1681' },
          'latest'
        ])
        const token1Raw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: '0xd21220a7' },
          'latest'
        ])
        const token0 = `0x${token0Raw.slice(-40)}`.toLowerCase()
        const token1 = `0x${token1Raw.slice(-40)}`.toLowerCase()
        const wnovaLower = wnovaAddress.toLowerCase()
        const tonyLower = tonyAddress.toLowerCase()
        const isToken0Wnova = token0 === wnovaLower
        const isToken1Wnova = token1 === wnovaLower
        const isToken0Tony = token0 === tonyLower
        const isToken1Tony = token1 === tonyLower
        const isTargetPair =
          (isToken0Wnova && isToken1Tony) || (isToken1Wnova && isToken0Tony)

        const logs = await rpcCallWithRetry(rpcUrl, 'eth_getLogs', [
          {
            address: pairAddress,
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: 'latest',
            topics: [SYNC_TOPIC]
          }
        ])

        const nextPrices = cached?.prices ? [...cached.prices] : []
        for (const log of logs ?? []) {
          try {
            const parsed = SYNC_INTERFACE.parseLog(log)
            const reserve0 = new BigNumber(parsed.args.reserve0.toString())
            const reserve1 = new BigNumber(parsed.args.reserve1.toString())
            if (!isTargetPair || reserve0.isZero() || reserve1.isZero()) continue
            const price = isToken0Wnova ? reserve1.div(reserve0).toNumber() : reserve0.div(reserve1).toNumber()
            if (Number.isFinite(price)) nextPrices.push(price)
          } catch {
            // ignore bad log
          }
        }
        const trimmed = nextPrices.slice(-CACHE_LIMIT)
        if (!cancelled) {
          setState({
            status: trimmed.length ? 'ok' : 'empty',
            prices: trimmed,
            lastPrice: trimmed[trimmed.length - 1] || null,
            error: null
          })
        }
        saveCache(pairAddress, {
          prices: trimmed,
          lastBlock: latestBlock,
          updatedAt: Date.now()
        })
      } catch (err) {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            status: prev.prices.length ? 'ok' : 'error',
            error: err?.message || 'RPC error'
          }))
        }
      }
    }

    fetchOnce()
    intervalId = setInterval(fetchOnce, 30000)

    return () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
    }
  }, [rpcUrl, factoryAddress, wnovaAddress, tonyAddress, startBlock])

  return state
}
