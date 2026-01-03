import { useEffect, useRef, useState } from 'react'
import { utils } from 'ethers'

const PAIR_INTERFACE = new utils.Interface([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112,uint112,uint32)',
])

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

export function useOnchainPair(pairAddress, rpcUrl) {
  const [state, setState] = useState({ status: 'idle', data: null, error: null })
  const requestRef = useRef(0)

  useEffect(() => {
    if (!pairAddress || !rpcUrl) return
    let cancelled = false
    const requestId = ++requestRef.current

    const fetchPair = async () => {
      setState((prev) => ({ ...prev, status: prev.data ? 'ok' : 'loading', error: null }))
      try {
        const token0Raw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: PAIR_INTERFACE.functions['token0()'].encode([]) },
          'latest',
        ])
        const token1Raw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: PAIR_INTERFACE.functions['token1()'].encode([]) },
          'latest',
        ])
        const reservesRaw = await rpcCallWithRetry(rpcUrl, 'eth_call', [
          { to: pairAddress, data: PAIR_INTERFACE.functions['getReserves()'].encode([]) },
          'latest',
        ])

        const token0 = utils.getAddress(utils.defaultAbiCoder.decode(['address'], token0Raw)[0])
        const token1 = utils.getAddress(utils.defaultAbiCoder.decode(['address'], token1Raw)[0])
        const [reserve0, reserve1] = utils.defaultAbiCoder.decode(['uint112', 'uint112', 'uint32'], reservesRaw)

        if (!cancelled && requestRef.current === requestId) {
          setState({
            status: 'ok',
            data: {
              token0,
              token1,
              reserve0: reserve0.toString(),
              reserve1: reserve1.toString(),
            },
            error: null,
          })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          setState((prev) => ({ ...prev, status: prev.data ? 'ok' : 'error', error: err?.message || 'RPC error' }))
        }
      }
    }

    fetchPair()
    return () => {
      cancelled = true
    }
  }, [pairAddress, rpcUrl])

  return state
}
