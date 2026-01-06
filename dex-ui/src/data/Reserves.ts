import { TokenAmount, Pair, Currency } from '@im33357/uniswap-v2-sdk'
import { useEffect, useMemo, useState } from 'react'
import { abi as IUniswapV2PairABI } from '@uniswap/v2-core/build/IUniswapV2Pair.json'
import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { AddressZero } from '@ethersproject/constants'
import { useActiveWeb3React } from '../hooks'
import { useEthernovaConfig } from '../hooks/useEthernovaConfig'
import { useBlockNumber } from '../state/application/hooks'

import { useMultipleContractSingleData } from '../state/multicall/hooks'
import { wrappedCurrency } from '../utils/wrappedCurrency'
import { rpcCallWithFallback } from '../utils/ethernovaRpc'
import { isAddress } from '../utils'
import { normalizePairReserves } from '../utils/pairReserves'
import { safeSortTokens } from '../utils/safeSortTokens'

const PAIR_INTERFACE = new Interface(IUniswapV2PairABI)
const TOKEN0_DATA = PAIR_INTERFACE.encodeFunctionData('token0', [])
const TOKEN1_DATA = PAIR_INTERFACE.encodeFunctionData('token1', [])
const RESERVES_DATA = PAIR_INTERFACE.encodeFunctionData('getReserves', [])
const FACTORY_INTERFACE = new Interface(['function getPair(address,address) view returns (address)'])

export enum PairState {
  LOADING,
  NOT_EXISTS,
  EXISTS,
  INVALID
}

export function usePairs(currencies: [Currency | undefined, Currency | undefined][]): [PairState, Pair | null][] {
  const { chainId } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const blockNumber = useBlockNumber()
  const activeChainId = chainId ?? config.chainId ?? 77777
  const factoryAddress = isAddress(config.contracts.factory)

  const tokens = useMemo(
    () =>
      currencies.map(([currencyA, currencyB]) => [
        wrappedCurrency(currencyA, activeChainId),
        wrappedCurrency(currencyB, activeChainId)
      ]),
    [activeChainId, currencies]
  )

  const pairAddresses = useMemo(
    () =>
      tokens.map(([tokenA, tokenB]) => {
        if (!tokenA || !tokenB || tokenA.equals(tokenB) || tokenA.chainId !== tokenB.chainId) return undefined
        try {
          return Pair.getAddress(tokenA, tokenB)
        } catch {
          return undefined
        }
      }),
    [tokens]
  )

  const results = useMultipleContractSingleData(pairAddresses, PAIR_INTERFACE, 'getReserves')

  const pairKeys = useMemo(
    () =>
      tokens.map(([tokenA, tokenB]) => {
        if (!tokenA || !tokenB) return null
        if (tokenA.chainId !== tokenB.chainId) return null
        const sorted = safeSortTokens(tokenA, tokenB)
        if (!sorted) return null
        return `${sorted[0].address}:${sorted[1].address}`.toLowerCase()
      }),
    [tokens]
  )

  const [fallbackResults, setFallbackResults] = useState<
    Record<
      string,
      {
        state: PairState
        reserves?: [BigNumber, BigNumber]
        token0?: string
        token1?: string
        updatedAt?: number
      }
    >
  >({})

  useEffect(() => {
    if (!factoryAddress) return
    const preferFallback = activeChainId === 77777
    let cancelled = false
    const run = async () => {
      const updates: Record<
        string,
        { state: PairState; reserves?: [BigNumber, BigNumber]; token0?: string; token1?: string }
      > = {}
      for (let i = 0; i < tokens.length; i++) {
        const tokenA = tokens[i][0]
        const tokenB = tokens[i][1]
        const key = pairKeys[i]
        if (!tokenA || !tokenB || !key || tokenA.equals(tokenB)) continue
        const existing = fallbackResults[key]
        const now = Date.now()
        const refreshMs = existing?.state === PairState.NOT_EXISTS ? 30000 : 10000
        const shouldRefresh = !existing?.updatedAt || now - existing.updatedAt > refreshMs
        if (existing && [PairState.EXISTS, PairState.NOT_EXISTS].includes(existing.state) && !shouldRefresh) continue
        if (!preferFallback) continue
        if (!existing) {
          updates[key] = { state: PairState.LOADING }
        }
        try {
          const data = FACTORY_INTERFACE.encodeFunctionData('getPair', [tokenA.address, tokenB.address])
          const result = (await rpcCallWithFallback('eth_call', [
            { to: factoryAddress, data },
            'latest'
          ])) as string
          const [pairAddress] = FACTORY_INTERFACE.decodeFunctionResult('getPair', result) as [string]
          if (!pairAddress || pairAddress === AddressZero) {
            updates[key] = { state: PairState.NOT_EXISTS, updatedAt: now }
            continue
          }
          const token0Raw = (await rpcCallWithFallback('eth_call', [
            { to: pairAddress, data: TOKEN0_DATA },
            'latest'
          ])) as string
          const token1Raw = (await rpcCallWithFallback('eth_call', [
            { to: pairAddress, data: TOKEN1_DATA },
            'latest'
          ])) as string
          const [token0Addr] = PAIR_INTERFACE.decodeFunctionResult('token0', token0Raw) as [string]
          const [token1Addr] = PAIR_INTERFACE.decodeFunctionResult('token1', token1Raw) as [string]
          const reservesResult = (await rpcCallWithFallback('eth_call', [
            { to: pairAddress, data: RESERVES_DATA },
            'latest'
          ])) as string
          const decoded = PAIR_INTERFACE.decodeFunctionResult('getReserves', reservesResult) as [BigNumber, BigNumber]
          updates[key] = {
            state: PairState.EXISTS,
            reserves: [decoded[0], decoded[1]],
            token0: token0Addr,
            token1: token1Addr,
            updatedAt: now
          }
        } catch {
          if (!existing) {
            updates[key] = { state: PairState.LOADING }
          }
        }
      }
      if (!cancelled && Object.keys(updates).length) {
        setFallbackResults(prev => ({ ...prev, ...updates }))
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [factoryAddress, pairKeys, tokens, fallbackResults, activeChainId, blockNumber])

  const preferFallback = activeChainId === 77777

  return useMemo(() => {
    return results.map((result, i) => {
      const { result: reserves, loading } = result
      const tokenA = tokens[i][0]
      const tokenB = tokens[i][1]
      const key = pairKeys[i]
      const fallback = key ? fallbackResults[key] : undefined

      if (!tokenA || !tokenB || tokenA.equals(tokenB)) return [PairState.INVALID, null]

      if (preferFallback) {
        if (!fallback || fallback.state === PairState.LOADING) return [PairState.LOADING, null]
        if (fallback.state === PairState.NOT_EXISTS) return [PairState.NOT_EXISTS, null]
        if (fallback.state === PairState.INVALID) return [PairState.INVALID, null]
        if (fallback.state === PairState.EXISTS && fallback.reserves) {
          const [reserve0, reserve1] = fallback.reserves
          const normalized = normalizePairReserves(tokenA, tokenB, reserve0, reserve1, fallback.token0, fallback.token1)
          if (!normalized) {
            return [PairState.LOADING, null]
          }
          try {
            return [
              PairState.EXISTS,
              new Pair(
                new TokenAmount(normalized.token0, normalized.reserve0.toString()),
                new TokenAmount(normalized.token1, normalized.reserve1.toString())
              )
            ]
          } catch {
            return [PairState.LOADING, null]
          }
        }
        return [PairState.LOADING, null]
      }

      if (loading && (!fallback || fallback.state === PairState.LOADING)) return [PairState.LOADING, null]
      if (!reserves) {
        if (fallback?.state === PairState.NOT_EXISTS) return [PairState.NOT_EXISTS, null]
        if (fallback?.state === PairState.INVALID) return [PairState.INVALID, null]
        if (fallback?.state === PairState.EXISTS && fallback.reserves) {
          const [reserve0, reserve1] = fallback.reserves
          const normalized = normalizePairReserves(tokenA, tokenB, reserve0, reserve1, fallback.token0, fallback.token1)
          if (!normalized) {
            return [PairState.LOADING, null]
          }
          try {
            return [
              PairState.EXISTS,
              new Pair(
                new TokenAmount(normalized.token0, normalized.reserve0.toString()),
                new TokenAmount(normalized.token1, normalized.reserve1.toString())
              )
            ]
          } catch {
            return [PairState.LOADING, null]
          }
        }
        return [PairState.LOADING, null]
      }
      const { reserve0, reserve1 } = reserves
      const sorted = safeSortTokens(tokenA, tokenB)
      if (!sorted) return [PairState.LOADING, null]
      const [token0, token1] = sorted
      try {
        return [
          PairState.EXISTS,
          new Pair(new TokenAmount(token0, reserve0.toString()), new TokenAmount(token1, reserve1.toString()))
        ]
      } catch {
        return [PairState.LOADING, null]
      }
    })
  }, [results, tokens, fallbackResults, pairKeys, preferFallback])
}

export function usePair(tokenA?: Currency, tokenB?: Currency): [PairState, Pair | null] {
  return usePairs([[tokenA, tokenB]])[0]
}
