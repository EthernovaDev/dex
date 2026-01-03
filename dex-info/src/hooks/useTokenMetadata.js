import { useEffect, useState } from 'react'
import { getLocalTokens, getTokenMetadata, getPairMetadata, getLocalPairs } from '../utils/localMetadata'
import { normAddr } from '../utils'

export function useTokenMetadata(address) {
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    if (!address || typeof window === 'undefined') {
      setMeta(null)
      return
    }
    const addr = normAddr(address)
    setMeta(getTokenMetadata(addr))
  }, [address])

  return meta
}

export function useLocalTokenList() {
  const [tokens, setTokens] = useState([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const load = () => setTokens(getLocalTokens())
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])
  return tokens
}

export function usePairMetadata(pairAddress) {
  const [meta, setMeta] = useState(null)
  useEffect(() => {
    if (!pairAddress || typeof window === 'undefined') {
      setMeta(null)
      return
    }
    const addr = normAddr(pairAddress)
    setMeta(getPairMetadata(addr))
  }, [pairAddress])
  return meta
}

export function useLocalPairList() {
  const [pairs, setPairs] = useState([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const load = () => setPairs(getLocalPairs())
    load()
    window.addEventListener('storage', load)
    return () => window.removeEventListener('storage', load)
  }, [])
  return pairs
}
