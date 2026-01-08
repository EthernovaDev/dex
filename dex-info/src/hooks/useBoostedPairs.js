import { useEffect, useRef, useState } from 'react'
import { ethers } from 'ethers'
import { BOOST_REGISTRY_ADDRESS } from '../constants/urls'

const BOOST_ABI = [
  'function boostCount() view returns (uint256)',
  'function boostAt(uint256) view returns (address pair, address booster, uint256 expiresAt)',
  'function boostInfo(address pair) view returns (address booster, uint256 expiresAt)',
  'function feeAmount() view returns (uint256)',
  'function treasury() view returns (address)',
  'function maxDuration() view returns (uint256)',
]

const BOOST_EVENT_ABI = ['event Boosted(address indexed pair, address indexed booster, uint256 amount, uint256 expiresAt)']
const idFn = (ethers.utils && ethers.utils.id) || ethers.id
const InterfaceCtor = (ethers.utils && ethers.utils.Interface) || ethers.Interface
const BOOST_EVENT_TOPIC = idFn('Boosted(address,address,uint256,uint256)')
const BOOST_LOOKBACK_BLOCKS = 20000

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const toNumberSafe = (value) => {
  try {
    if (value === null || value === undefined) return 0
    if (typeof value === 'number') return Number.isFinite(value) ? Math.floor(value) : 0
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, value.startsWith('0x') ? 16 : 10)
      return Number.isFinite(parsed) ? parsed : 0
    }
    if (typeof value?.toString === 'function') {
      const text = value.toString()
      const parsed = Number.parseInt(text, text.startsWith('0x') ? 16 : 10)
      return Number.isFinite(parsed) ? parsed : 0
    }
    const parsed = Number.parseInt(String(value), 10)
    return Number.isFinite(parsed) ? parsed : 0
  } catch {
    return 0
  }
}

export function useBoostedPairs(rpcUrl, refreshMs = 60000) {
  const [state, setState] = useState({ status: 'idle', boosted: [], config: null, error: null })
  const requestRef = useRef(0)
  const lastGoodRef = useRef([])
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = () => setRefreshToken((value) => value + 1)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const cached = window.localStorage.getItem('novadex.boostedPairs')
      if (cached) {
        const parsed = JSON.parse(cached)
        if (Array.isArray(parsed?.boosted) && parsed.boosted.length) {
          lastGoodRef.current = parsed.boosted
          setState((prev) => ({ ...prev, boosted: parsed.boosted, status: 'ok' }))
        }
      }
    } catch {
      // ignore cache errors
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handler = () => refresh()
    window.addEventListener('boosted-pairs-refresh', handler)
    return () => window.removeEventListener('boosted-pairs-refresh', handler)
  }, [])

  useEffect(() => {
    if (!rpcUrl || !BOOST_REGISTRY_ADDRESS) return
    let cancelled = false
    const requestId = ++requestRef.current

    const fetchBoosts = async () => {
      setState((prev) => ({ ...prev, status: prev.boosted.length ? 'ok' : 'loading', error: null }))
      try {
        const JsonRpcProvider = ethers.providers?.JsonRpcProvider || ethers.JsonRpcProvider
        const provider = new JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(BOOST_REGISTRY_ADDRESS, BOOST_ABI, provider)

        let feeAmountRaw
        let treasury
        let maxDurationRaw
        try {
          ;[feeAmountRaw, treasury, maxDurationRaw] = await Promise.all([
            contract.feeAmount(),
            contract.treasury(),
            contract.maxDuration(),
          ])
        } catch (err) {
          console.warn('[boostConfig] RPC busy', err)
        }

        let count = 0
        try {
          const countRaw = await contract.boostCount()
          count = toNumberSafe(countRaw)
        } catch (err) {
          console.warn('[boostedPairs] boostCount failed, falling back to logs', err)
        }
        const now = Math.floor(Date.now() / 1000)
        let boosted = []
        let logFallbackFailed = false
        let boostAtFailures = 0
        if (count > 0) {
          for (let i = 0; i < count; i += 1) {
            try {
              // eslint-disable-next-line no-await-in-loop
              const [pair, booster, expiresAtRaw] = await contract.boostAt(i)
              const expiresAt = toNumberSafe(expiresAtRaw)
              if (pair && expiresAt > now) {
                boosted.push({ pair, booster, expiresAt })
              }
            } catch (err) {
              boostAtFailures += 1
            }
            if (i % 10 === 0) {
              // avoid hammering RPC
              // eslint-disable-next-line no-await-in-loop
              await sleep(50)
            }
          }
        }

        if (!boosted.length || boostAtFailures === count) {
          try {
            const iface = new InterfaceCtor(BOOST_EVENT_ABI)
            const latest = await provider.getBlockNumber()
            const fromBlock = Math.max(0, latest - BOOST_LOOKBACK_BLOCKS)
            const logs = await provider.getLogs({
              address: BOOST_REGISTRY_ADDRESS,
              fromBlock,
              toBlock: latest,
              topics: [BOOST_EVENT_TOPIC],
            })
            const byPair = new Map()
            for (const log of logs) {
              let pair
              let booster
              let expiresAt
              try {
                const parsed = iface.parseLog(log)
                pair = parsed?.args?.pair || parsed?.args?.[0]
                booster = parsed?.args?.booster || parsed?.args?.[1]
                const expiresAtRaw = parsed?.args?.expiresAt || parsed?.args?.[3]
                expiresAt = toNumberSafe(expiresAtRaw)
              } catch (err) {
                try {
                  pair = log?.topics?.[1] ? `0x${log.topics[1].slice(26)}` : null
                  booster = log?.topics?.[2] ? `0x${log.topics[2].slice(26)}` : null
                  const data = log?.data?.replace(/^0x/, '') || ''
                  const expiresHex = data.length >= 128 ? data.slice(64, 128) : ''
                  expiresAt = toNumberSafe(expiresHex ? `0x${expiresHex}` : 0)
                } catch (inner) {
                  continue
                }
              }
              if (!pair || !expiresAt || expiresAt <= now) continue
              const key = String(pair).toLowerCase()
              const existing = byPair.get(key)
              if (!existing || expiresAt > existing.expiresAt) {
                byPair.set(key, { pair, booster, expiresAt })
              }
            }
            boosted = Array.from(byPair.values())
          } catch (err) {
            logFallbackFailed = true
            console.warn('[boostedPairs] log fallback failed', err)
          }
        }

        if (!boosted.length && logFallbackFailed) {
          throw new Error('Boosted log fetch failed')
        }

        if (!cancelled && requestRef.current === requestId) {
          if (boosted.length) {
            lastGoodRef.current = boosted
            try {
              if (typeof window !== 'undefined') {
                window.localStorage.setItem('novadex.boostedPairs', JSON.stringify({ boosted, ts: Date.now() }))
              }
            } catch {
              // ignore cache errors
            }
          }
          setState({
            status: 'ok',
            boosted: boosted.length ? boosted : lastGoodRef.current,
            config: {
              feeAmount: feeAmountRaw?.toString?.() || String(feeAmountRaw || '0'),
              treasury,
              maxDuration: toNumberSafe(maxDurationRaw),
            },
            error: null,
          })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          console.warn('[boostedPairs] RPC busy', err)
          setState((prev) => ({
            ...prev,
            boosted: prev.boosted.length ? prev.boosted : lastGoodRef.current,
            status: prev.boosted.length || lastGoodRef.current.length ? 'ok' : 'error',
            error: 'RPC busy',
          }))
        }
      }
    }

    fetchBoosts()
    const timer = setInterval(fetchBoosts, refreshMs)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [rpcUrl, refreshMs, refreshToken])

  return { ...state, refresh }
}

export function usePairBoostInfo(pairAddress, rpcUrl) {
  const [state, setState] = useState({ status: 'idle', info: null, error: null })
  const requestRef = useRef(0)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = () => setRefreshToken((value) => value + 1)

  useEffect(() => {
    if (!rpcUrl || !BOOST_REGISTRY_ADDRESS || !pairAddress) return
    let cancelled = false
    const requestId = ++requestRef.current

    const fetchInfo = async () => {
      setState((prev) => ({ ...prev, status: prev.info ? 'ok' : 'loading', error: null }))
      try {
        const JsonRpcProvider = ethers.providers?.JsonRpcProvider || ethers.JsonRpcProvider
        const provider = new JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(BOOST_REGISTRY_ADDRESS, BOOST_ABI, provider)
        const [booster, expiresAtRaw] = await contract.boostInfo(pairAddress)
        const expiresAt = toNumberSafe(expiresAtRaw)
        if (!cancelled && requestRef.current === requestId) {
          setState({ status: 'ok', info: { booster, expiresAt }, error: null })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          console.warn('[pairBoostInfo] RPC busy', err)
          setState((prev) => ({ ...prev, status: prev.info ? 'ok' : 'error', error: 'RPC busy' }))
        }
      }
    }

    fetchInfo()
    return () => {
      cancelled = true
    }
  }, [pairAddress, rpcUrl, refreshToken])

  return { ...state, refresh }
}

export function useBoostRegistryConfig(rpcUrl) {
  const [state, setState] = useState({ status: 'idle', config: null, error: null })
  const requestRef = useRef(0)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = () => setRefreshToken((value) => value + 1)

  useEffect(() => {
    if (!rpcUrl || !BOOST_REGISTRY_ADDRESS) return
    let cancelled = false
    const requestId = ++requestRef.current

    const fetchConfig = async () => {
      setState((prev) => ({ ...prev, status: prev.config ? 'ok' : 'loading', error: null }))
      try {
        const JsonRpcProvider = ethers.providers?.JsonRpcProvider || ethers.JsonRpcProvider
        const provider = new JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(BOOST_REGISTRY_ADDRESS, BOOST_ABI, provider)
        const [feeAmountRaw, treasury, maxDurationRaw] = await Promise.all([
          contract.feeAmount(),
          contract.treasury(),
          contract.maxDuration(),
        ])
        if (!cancelled && requestRef.current === requestId) {
          setState({
            status: 'ok',
            config: {
              feeAmount: feeAmountRaw?.toString?.() || String(feeAmountRaw || '0'),
              treasury,
              maxDuration: toNumberSafe(maxDurationRaw),
            },
            error: null,
          })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          console.warn('[boostConfig] RPC busy', err)
          setState((prev) => ({ ...prev, status: prev.config ? 'ok' : 'error', error: 'RPC busy' }))
        }
      }
    }

    fetchConfig()
    return () => {
      cancelled = true
    }
  }, [rpcUrl, refreshToken])

  return { ...state, refresh }
}
