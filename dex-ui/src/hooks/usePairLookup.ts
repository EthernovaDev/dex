import { BigNumber } from '@ethersproject/bignumber'
import { Currency } from '@im33357/uniswap-v2-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useEthernovaConfig } from './useEthernovaConfig'
import { isAddress } from '../utils'
import { wrappedCurrency } from '../utils/wrappedCurrency'
import { getPairAddress, normalizeReservesForTokens, readPairState } from '../utils/pairReads'
import { useActiveWeb3React } from './index'

export type PairLookupStatus = 'idle' | 'loading' | 'exists' | 'not_exists' | 'error'

export type PairLookupResult = {
  status: PairLookupStatus
  pairAddress?: string
  reserves?: { reserve0: BigNumber; reserve1: BigNumber }
  reserveA?: BigNumber
  reserveB?: BigNumber
  token0?: string
  token1?: string
  totalSupply?: BigNumber
  error?: string
  retry: () => void
}

export function usePairLookup(currencyA?: Currency, currencyB?: Currency): PairLookupResult {
  const { library, chainId } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const targetChainId = config.chainId || 77777
  const factoryAddress = isAddress(config.contracts.factory)

  const tokenA = useMemo(() => wrappedCurrency(currencyA, targetChainId), [currencyA, targetChainId])
  const tokenB = useMemo(() => wrappedCurrency(currencyB, targetChainId), [currencyB, targetChainId])

  const [state, setState] = useState<Omit<PairLookupResult, 'retry'>>({ status: 'idle' })
  const [nonce, setNonce] = useState(0)

  const retry = useCallback(() => {
    setNonce(n => n + 1)
  }, [])

  useEffect(() => {
    if (!factoryAddress || !tokenA || !tokenB) {
      setState({ status: 'idle' })
      return
    }
    if (tokenA.chainId !== targetChainId || tokenB.chainId !== targetChainId) {
      setState({ status: 'error', error: 'Token chain mismatch' })
      return
    }
    if (tokenA.equals(tokenB)) {
      setState({ status: 'error', error: 'Invalid pair' })
      return
    }

    let cancelled = false
    setState({ status: 'loading' })
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setState({ status: 'error', error: 'RPC timeout' })
      }
    }, 10000)

    const run = async () => {
      try {
        if (cancelled) return
        const provider = chainId === targetChainId ? (library ?? undefined) : undefined
        const pairAddress = await getPairAddress(factoryAddress, tokenA, tokenB, {
          timeoutMs: 8000,
          retries: 3,
          backoffMs: 400,
          provider: provider as any,
          expectedChainId: targetChainId
        })
        if (!pairAddress) {
          clearTimeout(timeout)
          setState({ status: 'not_exists' })
          return
        }

        let reserves: { reserve0: BigNumber; reserve1: BigNumber } | undefined
        let reserveA: BigNumber | undefined
        let reserveB: BigNumber | undefined
        let token0Addr: string | undefined
        let token1Addr: string | undefined
        let totalSupply: BigNumber | undefined
        try {
          const pairState = await readPairState(pairAddress, {
            timeoutMs: 8000,
            retries: 3,
            backoffMs: 400,
            provider: provider as any,
            expectedChainId: targetChainId
          })
          token0Addr = pairState.token0
          token1Addr = pairState.token1
          reserves = { reserve0: pairState.reserve0, reserve1: pairState.reserve1 }
          totalSupply = pairState.totalSupply
          const normalized = normalizeReservesForTokens(tokenA, tokenB, pairState)
          if (normalized) {
            reserveA = normalized.reserveForA
            reserveB = normalized.reserveForB
          }
        } catch (error) {
          if (!cancelled) {
            const message = error instanceof Error ? error.message : 'RPC error'
            clearTimeout(timeout)
            setState({ status: 'exists', pairAddress, error: message })
            return
          }
        }

        if (!cancelled) {
          clearTimeout(timeout)
          setState({
            status: 'exists',
            pairAddress,
            reserves,
            reserveA,
            reserveB,
            token0: token0Addr,
            token1: token1Addr,
            totalSupply
          })
        }
      } catch (error) {
        if (!cancelled) {
          clearTimeout(timeout)
          const message = error instanceof Error ? error.message : 'RPC error'
          setState({ status: 'error', error: message })
        }
      }
    }

    run()

    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [factoryAddress, tokenA, tokenB, targetChainId, nonce])

  return { ...state, retry }
}
