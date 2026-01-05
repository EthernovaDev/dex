import { useEffect, useState } from 'react'
import { getLocalTokens, getTokenMetadata, getPairMetadata, getLocalPairs } from '../utils/localMetadata'
import { fetchTokenMetadata, fetchPairMetadata, fetchTokenList, fetchPairList } from '../utils/metadataApi'
import { fetchRegistryTokenMetadata, fetchRegistryPairMetadata } from '../utils/metadataRegistry'
import { normAddr } from '../utils'

export function useTokenMetadata(address) {
  const [meta, setMeta] = useState(null)

  useEffect(() => {
    if (!address || typeof window === 'undefined') {
      setMeta(null)
      return
    }
    let stale = false
    const addr = normAddr(address)
    const local = getTokenMetadata(addr)
    setMeta(local)
    fetchRegistryTokenMetadata(addr).then((registryMeta) => {
      if (stale) return
      if (registryMeta) {
        setMeta(registryMeta)
        return
      }
      fetchTokenMetadata(addr).then((remote) => {
        if (stale) return
        if (remote) {
          setMeta(remote)
        } else if (!local) {
          setMeta(null)
        }
      })
    })
    return () => {
      stale = true
    }
  }, [address])

  return meta
}

export function useLocalTokenList() {
  const [tokens, setTokens] = useState([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    let stale = false
    const load = async () => {
      const local = getLocalTokens()
      setTokens(local)
      const remote = await fetchTokenList()
      if (stale || !remote) return
      const merged = { ...local.reduce((acc, t) => ({ ...acc, [t.id]: t }), {}), ...remote }
      const mergedList = Object.keys(merged).map((id) => {
        const meta = merged[id] || {}
        return {
          id,
          symbol: meta.symbol || '',
          name: meta.name || '',
          decimals: meta.decimals,
          description: meta.description,
          logo: meta.logo || meta.image_uri || '',
          website: meta.website,
          twitter: meta.twitter,
          telegram: meta.telegram,
          discord: meta.discord,
          createdAt: meta.created_at || meta.createdAt,
        }
      })
      setTokens(mergedList)
    }
    load()
    window.addEventListener('storage', load)
    return () => {
      stale = true
      window.removeEventListener('storage', load)
    }
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
    let stale = false
    const addr = normAddr(pairAddress)
    const local = getPairMetadata(addr)
    setMeta(local)
    fetchRegistryPairMetadata(addr).then((registryMeta) => {
      if (stale) return
      if (registryMeta) {
        setMeta(registryMeta)
        return
      }
      fetchPairMetadata(addr).then((remote) => {
        if (stale) return
        if (remote) {
          setMeta(remote)
        } else if (!local) {
          setMeta(null)
        }
      })
    })
    return () => {
      stale = true
    }
  }, [pairAddress])
  return meta
}

export function useLocalPairList() {
  const [pairs, setPairs] = useState([])
  useEffect(() => {
    if (typeof window === 'undefined') return
    let stale = false
    const load = async () => {
      const local = getLocalPairs()
      setPairs(local)
      const remote = await fetchPairList()
      if (stale || !remote) return
      const merged = { ...local.reduce((acc, p) => ({ ...acc, [p.id]: p }), {}), ...remote }
      const mergedList = Object.keys(merged).map((id) => {
        const meta = merged[id] || {}
        return {
          id,
          token0: meta.token0,
          token1: meta.token1,
          symbol0: meta.symbol0,
          symbol1: meta.symbol1,
          createdAt: meta.created_at || meta.createdAt,
        }
      })
      setPairs(mergedList)
    }
    load()
    window.addEventListener('storage', load)
    return () => {
      stale = true
      window.removeEventListener('storage', load)
    }
  }, [])
  return pairs
}
