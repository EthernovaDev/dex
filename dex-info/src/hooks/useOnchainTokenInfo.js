import { utils } from 'ethers'
import { useEffect, useRef, useState } from 'react'

const ERC20_INTERFACE = new utils.Interface([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
])

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function isHtml(text) {
  return /<html/i.test(text) || /<!doctype/i.test(text) || text.trim().startsWith('<')
}

function decodeStringResult(data) {
  if (!data || data === '0x') return null
  try {
    return utils.defaultAbiCoder.decode(['string'], data)[0]
  } catch {
    try {
      const decoded = utils.defaultAbiCoder.decode(['bytes32'], data)[0]
      return utils.parseBytes32String(decoded)
    } catch {
      return null
    }
  }
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
  let delay = 300
  let lastErr
  for (let i = 0; i < attempts; i += 1) {
    try {
      return await rpcCall(rpcUrl, method, params)
    } catch (err) {
      lastErr = err
      await sleep(delay)
      delay = Math.min(delay * 2, 3000)
    }
  }
  throw lastErr || new Error('RPC unavailable')
}

function cacheKey(address) {
  return `novadex-token-info:${address.toLowerCase()}`
}

export function useOnchainTokenInfo(address, rpcUrl) {
  const [state, setState] = useState({ status: 'idle', info: null, error: null })
  const requestIdRef = useRef(0)

  useEffect(() => {
    if (!address || !rpcUrl) return
    let cancelled = false
    const requestId = ++requestIdRef.current

    const loadCache = () => {
      try {
        const raw = localStorage.getItem(cacheKey(address))
        if (!raw) return null
        const parsed = JSON.parse(raw)
        if (!parsed?.symbol && !parsed?.name) return null
        return parsed
      } catch {
        return null
      }
    }

    const saveCache = (payload) => {
      try {
        localStorage.setItem(cacheKey(address), JSON.stringify(payload))
      } catch {
        // ignore
      }
    }

    const fetchInfo = async () => {
      setState((prev) => ({ ...prev, status: prev.info ? 'ok' : 'loading', error: null }))
      try {
        const cached = loadCache()
        if (cached && !cancelled) {
          setState({ status: 'ok', info: cached, error: null })
        }

        const nameData = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: address, data: ERC20_INTERFACE.functions['name()'].encode([]) },
          'latest',
        ])
        const symbolData = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: address, data: ERC20_INTERFACE.functions['symbol()'].encode([]) },
          'latest',
        ])
        const decimalsData = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: address, data: ERC20_INTERFACE.functions['decimals()'].encode([]) },
          'latest',
        ])

        const nextInfo = {
          name: decodeStringResult(nameData) || null,
          symbol: decodeStringResult(symbolData) || null,
          decimals: Number(utils.defaultAbiCoder.decode(['uint8'], decimalsData)[0]) || 18,
          updatedAt: Date.now(),
        }

        if (!cancelled && requestIdRef.current === requestId) {
          setState({ status: 'ok', info: nextInfo, error: null })
        }
        saveCache(nextInfo)

        if (typeof window !== 'undefined') {
          window.__NOVADEX_INFO_LAST_QUERY__ = {
            type: 'onchain-token',
            address,
            ok: true,
            at: new Date().toISOString(),
          }
        }
      } catch (err) {
        if (!cancelled && requestIdRef.current === requestId) {
          const message = err?.message || 'RPC error'
          setState((prev) => ({ ...prev, status: prev.info ? 'ok' : 'error', error: message }))
          if (typeof window !== 'undefined') {
            window.__NOVADEX_INFO_LAST_QUERY__ = {
              type: 'onchain-token',
              address,
              ok: false,
              error: message,
              at: new Date().toISOString(),
            }
          }
        }
      }
    }

    fetchInfo()

    return () => {
      cancelled = true
    }
  }, [address, rpcUrl])

  return state
}
