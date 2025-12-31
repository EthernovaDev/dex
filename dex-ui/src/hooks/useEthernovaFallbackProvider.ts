import { useEffect, useMemo, useState } from 'react'
import { FallbackProvider } from '@ethersproject/providers'
import { createEthernovaFallbackProvider, getEthernovaRpcUrls, getHealthyRpcUrls } from '../utils/ethernovaRpc'

export function useEthernovaFallbackProvider(): FallbackProvider | null {
  const [urls, setUrls] = useState<string[]>(getEthernovaRpcUrls())

  useEffect(() => {
    let stale = false
    getHealthyRpcUrls()
      .then(healthy => {
        if (!stale && healthy.length) {
          setUrls(healthy)
        }
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [])

  return useMemo(() => {
    if (!urls.length) return null
    return createEthernovaFallbackProvider(urls)
  }, [urls])
}
