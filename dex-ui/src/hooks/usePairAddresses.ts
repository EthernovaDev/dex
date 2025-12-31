import { Interface } from '@ethersproject/abi'
import { AddressZero } from '@ethersproject/constants'
import { Token } from '@im33357/uniswap-v2-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEthernovaConfig } from './useEthernovaConfig'
import { isAddress } from '../utils'
import { rpcCallWithFallback } from '../utils/ethernovaRpc'

const FACTORY_INTERFACE = new Interface(['function getPair(address,address) view returns (address)'])

type PairAddressState = {
  addresses: Record<string, string>
  loading: boolean
  error?: string
  retry: () => void
}

function pairKey(tokenA: Token, tokenB: Token): string {
  const [a, b] =
    tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
      ? [tokenA.address.toLowerCase(), tokenB.address.toLowerCase()]
      : [tokenB.address.toLowerCase(), tokenA.address.toLowerCase()]
  return `${a}:${b}`
}

export function usePairAddresses(tokenPairs: [Token, Token][]): PairAddressState {
  const { config } = useEthernovaConfig()
  const factoryAddress = isAddress(config.contracts.factory)
  const [addresses, setAddresses] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => setNonce(value => value + 1), [])

  const keys = useMemo(() => tokenPairs.map(([a, b]) => pairKey(a, b)), [tokenPairs])

  useEffect(() => {
    if (!factoryAddress || tokenPairs.length === 0) {
      setLoading(false)
      setError(undefined)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(undefined)

    const run = async () => {
      const updates: Record<string, string> = {}
      for (let i = 0; i < tokenPairs.length; i++) {
        const [tokenA, tokenB] = tokenPairs[i]
        const key = keys[i]
        if (addresses[key]) continue
        try {
          const data = FACTORY_INTERFACE.encodeFunctionData('getPair', [tokenA.address, tokenB.address])
          const result = (await rpcCallWithFallback('eth_call', [{ to: factoryAddress, data }, 'latest'])) as string
          const [pairAddress] = FACTORY_INTERFACE.decodeFunctionResult('getPair', result) as [string]
          if (pairAddress && pairAddress !== AddressZero) {
            updates[key] = pairAddress
          }
        } catch (err) {
          if (!cancelled) {
            const message = err instanceof Error ? err.message : 'RPC error'
            setError(message)
          }
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setAddresses(prev => ({ ...prev, ...updates }))
      }
      if (!cancelled) {
        setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [factoryAddress, tokenPairs, keys, addresses, nonce])

  return { addresses, loading, error, retry }
}
