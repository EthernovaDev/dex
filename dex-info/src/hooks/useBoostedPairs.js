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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export function useBoostedPairs(rpcUrl, refreshMs = 60000) {
  const [state, setState] = useState({ status: 'idle', boosted: [], config: null, error: null })
  const requestRef = useRef(0)
  const [refreshToken, setRefreshToken] = useState(0)

  const refresh = () => setRefreshToken((value) => value + 1)

  useEffect(() => {
    if (!rpcUrl || !BOOST_REGISTRY_ADDRESS) return
    let cancelled = false
    const requestId = ++requestRef.current

    const fetchBoosts = async () => {
      setState((prev) => ({ ...prev, status: prev.boosted.length ? 'ok' : 'loading', error: null }))
      try {
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(BOOST_REGISTRY_ADDRESS, BOOST_ABI, provider)

        const [countRaw, feeAmountRaw, treasury, maxDurationRaw] = await Promise.all([
          contract.boostCount(),
          contract.feeAmount(),
          contract.treasury(),
          contract.maxDuration(),
        ])

        const count = countRaw.toNumber()
        const now = Math.floor(Date.now() / 1000)
        const boosted = []

        for (let i = 0; i < count; i += 1) {
          // eslint-disable-next-line no-await-in-loop
          const [pair, booster, expiresAtRaw] = await contract.boostAt(i)
          const expiresAt = ethers.BigNumber.from(expiresAtRaw).toNumber()
          if (expiresAt > now) {
            boosted.push({ pair, booster, expiresAt })
          }
          if (i % 10 === 0) {
            // avoid hammering RPC
            // eslint-disable-next-line no-await-in-loop
            await sleep(50)
          }
        }

        if (!cancelled && requestRef.current === requestId) {
          setState({
            status: 'ok',
            boosted,
            config: {
              feeAmount: feeAmountRaw.toString(),
              treasury,
              maxDuration: ethers.BigNumber.from(maxDurationRaw).toNumber(),
            },
            error: null,
          })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          setState((prev) => ({ ...prev, status: prev.boosted.length ? 'ok' : 'error', error: err?.message || 'RPC error' }))
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
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
        const contract = new ethers.Contract(BOOST_REGISTRY_ADDRESS, BOOST_ABI, provider)
        const [booster, expiresAtRaw] = await contract.boostInfo(pairAddress)
        const expiresAt = ethers.BigNumber.from(expiresAtRaw).toNumber()
        if (!cancelled && requestRef.current === requestId) {
          setState({ status: 'ok', info: { booster, expiresAt }, error: null })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          setState((prev) => ({ ...prev, status: prev.info ? 'ok' : 'error', error: err?.message || 'RPC error' }))
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
        const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
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
              feeAmount: feeAmountRaw.toString(),
              treasury,
              maxDuration: ethers.BigNumber.from(maxDurationRaw).toNumber(),
            },
            error: null,
          })
        }
      } catch (err) {
        if (!cancelled && requestRef.current === requestId) {
          setState((prev) => ({ ...prev, status: prev.config ? 'ok' : 'error', error: err?.message || 'RPC error' }))
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
