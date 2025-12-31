import { utils } from 'ethers'
import BigNumber from 'bignumber.js'
import { useCallback, useEffect, useRef, useState } from 'react'

const SWAP_INTERFACE = new utils.Interface([
  'event Swap(address indexed sender,uint amount0In,uint amount1In,uint amount0Out,uint amount1Out,address indexed to)',
])
const SWAP_TOPIC =
  SWAP_INTERFACE.events['Swap(address,uint256,uint256,uint256,uint256,address)']?.topic ||
  SWAP_INTERFACE.events.Swap?.topic ||
  utils.id('Swap(address,uint256,uint256,uint256,uint256,address)')


const DEFAULT_LOOKBACK = 20000
const DEFAULT_INTERVAL = 300
const CACHE_LIMIT = 200
const MAX_TRADES = 60

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
      signal: controller.signal,
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
  return `novadex-onchain-swaps:${pairAddress.toLowerCase()}`
}

function parseAmount(value, decimals = 18) {
  return new BigNumber(value.toString()).dividedBy(new BigNumber(10).pow(decimals))
}

export function useOnchainSwapHistory({
  rpcUrl,
  factoryAddress,
  wnovaAddress,
  tonyAddress,
  pairAddress: explicitPair,
  startBlock = 0,
  intervalSec = DEFAULT_INTERVAL,
  lookbackBlocks = DEFAULT_LOOKBACK,
}) {
  const [state, setState] = useState({
    status: 'idle',
    candles: [],
    trades: [],
    lastPrice: null,
    error: null,
    lastBlock: null,
    readPath: 'onchain',
  })
  const nonceRef = useRef(0)

  const refresh = useCallback(() => {
    nonceRef.current += 1
    setState((prev) => ({ ...prev, status: prev.candles.length ? 'ok' : 'loading', error: null }))
  }, [])

  useEffect(() => {
    if (!rpcUrl || !factoryAddress || !wnovaAddress || !tonyAddress) return
    let cancelled = false
    const requestId = nonceRef.current

    const loadCache = (pair) => {
      try {
        const raw = localStorage.getItem(cacheKey(pair))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.candles?.length) return null
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
      setState((prev) => ({ ...prev, status: prev.candles.length ? 'ok' : 'loading', error: null }))
      try {
        const pad = (addr) => addr.replace('0x', '').padStart(64, '0')
        let pairAddress = explicitPair
        if (!pairAddress) {
          const pairRaw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
            { to: factoryAddress, data: `0xe6a43905${pad(wnovaAddress)}${pad(tonyAddress)}` },
            'latest',
          ])
          pairAddress = `0x${pairRaw.slice(-40)}`
        }
        if (!pairAddress || /^0x0+$/.test(pairAddress)) {
          throw new Error('Pair not found')
        }

        const cached = loadCache(pairAddress)
        if (cached && !cancelled) {
          setState({
            status: 'ok',
            candles: cached.candles,
            trades: cached.trades || [],
            lastPrice: cached.candles[cached.candles.length - 1]?.close || null,
            error: null,
            lastBlock: cached.lastBlock || null,
            readPath: 'cache',
          })
        }

        const latestHex = await rpcCallWithRetry(rpcUrl, 'eth_blockNumber', [])
        const latestBlock = Number.parseInt(latestHex, 16)
        const fromBlock = cached?.lastBlock ? cached.lastBlock + 1 : Math.max(startBlock, latestBlock - lookbackBlocks)

        const token0Raw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: '0x0dfe1681' },
          'latest',
        ])
        await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: '0xd21220a7' },
          'latest',
        ])
        const token0 = `0x${token0Raw.slice(-40)}`.toLowerCase()
        const wnovaLower = wnovaAddress.toLowerCase()
        const baseIsToken0 = token0 === wnovaLower

        const logs = await rpcCallWithRetry(rpcUrl, 'eth_getLogs', [
          {
            address: pairAddress,
            fromBlock: `0x${fromBlock.toString(16)}`,
            toBlock: 'latest',
            topics: [SWAP_TOPIC],
          },
        ])

        const blockCache = new Map()
        const getTimestamp = async (blockNumberHex) => {
          if (blockCache.has(blockNumberHex)) return blockCache.get(blockNumberHex)
          const block = await rpcCallWithRetry(rpcUrl, 'eth_getBlockByNumber', [blockNumberHex, false])
          const ts = Number.parseInt(block.timestamp, 16)
          blockCache.set(blockNumberHex, ts)
          return ts
        }

        const candlesMap = new Map()
        const trades = []
        for (const log of logs || []) {
          try {
            const parsed = SWAP_INTERFACE.parseLog(log)
            const amount0In = new BigNumber(parsed.args.amount0In.toString())
            const amount1In = new BigNumber(parsed.args.amount1In.toString())
            const amount0Out = new BigNumber(parsed.args.amount0Out.toString())
            const amount1Out = new BigNumber(parsed.args.amount1Out.toString())

            let baseAmount = new BigNumber(0)
            let quoteAmount = new BigNumber(0)
            let side = 'buy'
            if (baseIsToken0) {
              if (amount0In.gt(0) && amount1Out.gt(0)) {
                baseAmount = amount0In
                quoteAmount = amount1Out
                side = 'sell'
              } else if (amount1In.gt(0) && amount0Out.gt(0)) {
                baseAmount = amount0Out
                quoteAmount = amount1In
                side = 'buy'
              }
            } else {
              if (amount1In.gt(0) && amount0Out.gt(0)) {
                baseAmount = amount1In
                quoteAmount = amount0Out
                side = 'sell'
              } else if (amount0In.gt(0) && amount1Out.gt(0)) {
                baseAmount = amount1Out
                quoteAmount = amount0In
                side = 'buy'
              }
            }
            if (baseAmount.isZero() || quoteAmount.isZero()) continue

            const base = parseAmount(baseAmount, 18)
            const quote = parseAmount(quoteAmount, 18)
            if (!base.gt(0)) continue
            const price = quote.div(base)
            if (!price.isFinite()) continue

            const timestamp = await getTimestamp(log.blockNumber)
            const bucket = Math.floor(timestamp / intervalSec) * intervalSec

            const candle = candlesMap.get(bucket) || {
              timestamp: bucket,
              open: price.toNumber(),
              close: price.toNumber(),
              high: price.toNumber(),
              low: price.toNumber(),
              volume: new BigNumber(0),
            }
            candle.close = price.toNumber()
            candle.high = Math.max(candle.high, price.toNumber())
            candle.low = Math.min(candle.low, price.toNumber())
            candle.volume = candle.volume.plus(base)
            candlesMap.set(bucket, candle)

            const sideLabel = side === 'sell' ? 'SELL WNOVA (BUY TONY)' : 'BUY WNOVA (SELL TONY)'
            trades.push({
              timestamp,
              price: price.toNumber(),
              side,
              sideLabel,
              baseAmount: base.toNumber(),
              quoteAmount: quote.toNumber(),
              txHash: log.transactionHash,
            })
          } catch {
            // ignore bad log
          }
        }

        const candles = Array.from(candlesMap.values())
          .sort((a, b) => a.timestamp - b.timestamp)
          .slice(-CACHE_LIMIT)
        const recentTrades = trades.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_TRADES)

        if (!cancelled && requestId === nonceRef.current) {
          setState({
            status: candles.length ? 'ok' : 'empty',
            candles,
            trades: recentTrades,
            lastPrice: candles[candles.length - 1]?.close || null,
            error: null,
            lastBlock: latestBlock,
            readPath: 'onchain',
          })
        }
        saveCache(pairAddress, {
          candles,
          trades: recentTrades,
          lastBlock: latestBlock,
          updatedAt: Date.now(),
        })
      } catch (err) {
        if (!cancelled && requestId === nonceRef.current) {
          setState((prev) => ({
            ...prev,
            status: prev.candles.length ? 'ok' : 'error',
            error: err?.message || 'RPC error',
          }))
        }
      }
    }

    fetchOnce()
    const intervalId = setInterval(fetchOnce, 30000)

    return () => {
      cancelled = true
      clearInterval(intervalId)
    }
  }, [rpcUrl, factoryAddress, wnovaAddress, tonyAddress, explicitPair, startBlock, intervalSec, lookbackBlocks])

  return { ...state, refresh }
}
