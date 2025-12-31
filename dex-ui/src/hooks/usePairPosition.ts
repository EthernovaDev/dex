import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useActiveWeb3React } from './index'
import { callReadWithFallback } from '../utils/ethernovaRpc'
import { usePairContract } from './useContract'
import { useSingleCallResult } from '../state/multicall/hooks'
import { emitDebug } from '../utils/debugEvents'

const PAIR_INTERFACE = new Interface([
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)',
  'function token0() view returns (address)',
  'function token1() view returns (address)'
])

export type PairPositionStatus = 'idle' | 'loading' | 'ok' | 'rpc_unstable'

export type PairPosition = {
  status: PairPositionStatus
  lpBalance?: BigNumber
  totalSupply?: BigNumber
  reserves?: { reserve0: BigNumber; reserve1: BigNumber }
  token0?: string
  token1?: string
  source: 'none' | 'multicall' | 'direct'
  error?: string
  retry: () => void
}

type DirectState = {
  status: PairPositionStatus
  lpBalance?: BigNumber
  totalSupply?: BigNumber
  reserves?: { reserve0: BigNumber; reserve1: BigNumber }
  token0?: string
  token1?: string
  error?: string
}

function hasResult(value: unknown): boolean {
  return value !== undefined && value !== null
}

export function usePairPosition(pairAddress?: string, account?: string): PairPosition {
  const { chainId, library } = useActiveWeb3React()
  const pairContract = usePairContract(pairAddress, false)
  const [nonce, setNonce] = useState(0)
  const [directState, setDirectState] = useState<DirectState>({ status: 'idle' })
  const [multicallStalled, setMulticallStalled] = useState(false)

  const balanceCall = useSingleCallResult(pairContract, 'balanceOf', account ? [account] : undefined)
  const totalSupplyCall = useSingleCallResult(pairContract, 'totalSupply', [])
  const reservesCall = useSingleCallResult(pairContract, 'getReserves', [])
  const token0Call = useSingleCallResult(pairContract, 'token0', [])
  const token1Call = useSingleCallResult(pairContract, 'token1', [])

  const retry = useCallback(() => {
    setMulticallStalled(false)
    setDirectState({ status: 'loading' })
    setNonce(value => value + 1)
  }, [])

  useEffect(() => {
    setDirectState({ status: 'idle' })
    setMulticallStalled(false)
  }, [pairAddress, account, chainId])

  const shouldFallback = useMemo(() => {
    if (!pairAddress || chainId !== 77777) return false
    const balanceMissing = account
      ? balanceCall.error || (!balanceCall.loading && !hasResult(balanceCall.result?.[0]))
      : false
    const totalMissing = totalSupplyCall.error || (!totalSupplyCall.loading && !hasResult(totalSupplyCall.result?.[0]))
    const reservesMissing = reservesCall.error || (!reservesCall.loading && !hasResult(reservesCall.result?.[0]))
    const token0Missing = token0Call.error || (!token0Call.loading && !hasResult(token0Call.result?.[0]))
    const token1Missing = token1Call.error || (!token1Call.loading && !hasResult(token1Call.result?.[0]))
    return balanceMissing || totalMissing || reservesMissing || token0Missing || token1Missing || multicallStalled
  }, [
    pairAddress,
    chainId,
    account,
    balanceCall.error,
    balanceCall.loading,
    balanceCall.result,
    totalSupplyCall.error,
    totalSupplyCall.loading,
    totalSupplyCall.result,
    reservesCall.error,
    reservesCall.loading,
    reservesCall.result,
    token0Call.error,
    token0Call.loading,
    token0Call.result,
    token1Call.error,
    token1Call.loading,
    token1Call.result,
    multicallStalled
  ])

  useEffect(() => {
    if (!pairAddress || chainId !== 77777) return
    if (
      !balanceCall.loading &&
      !totalSupplyCall.loading &&
      !reservesCall.loading &&
      !token0Call.loading &&
      !token1Call.loading
    ) {
      return
    }
    let cancelled = false
    const timeout = setTimeout(() => {
      if (!cancelled) setMulticallStalled(true)
    }, 8000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [
    pairAddress,
    chainId,
    balanceCall.loading,
    totalSupplyCall.loading,
    reservesCall.loading,
    token0Call.loading,
    token1Call.loading
  ])

  useEffect(() => {
    if (!pairAddress || chainId !== 77777) return
    if (!shouldFallback) return
    let cancelled = false
    setDirectState(prev => ({ ...prev, status: 'loading', error: undefined }))

    const run = async () => {
      try {
        const calls: Array<Promise<unknown>> = []
        const callBalance = async () => {
          if (!account) return undefined
          const data = PAIR_INTERFACE.encodeFunctionData('balanceOf', [account])
          return callReadWithFallback(
            { to: pairAddress, data },
            { provider: library as any, expectedChainId: 77777, debugTag: 'pair.balanceOf' }
          )
        }
        const callTotalSupply = async () => {
          const data = PAIR_INTERFACE.encodeFunctionData('totalSupply', [])
          return callReadWithFallback(
            { to: pairAddress, data },
            { provider: library as any, expectedChainId: 77777, debugTag: 'pair.totalSupply' }
          )
        }
        const callReserves = async () => {
          const data = PAIR_INTERFACE.encodeFunctionData('getReserves', [])
          return callReadWithFallback(
            { to: pairAddress, data },
            { provider: library as any, expectedChainId: 77777, debugTag: 'pair.getReserves' }
          )
        }
        const callToken0 = async () => {
          const data = PAIR_INTERFACE.encodeFunctionData('token0', [])
          return callReadWithFallback(
            { to: pairAddress, data },
            { provider: library as any, expectedChainId: 77777, debugTag: 'pair.token0' }
          )
        }
        const callToken1 = async () => {
          const data = PAIR_INTERFACE.encodeFunctionData('token1', [])
          return callReadWithFallback(
            { to: pairAddress, data },
            { provider: library as any, expectedChainId: 77777, debugTag: 'pair.token1' }
          )
        }

        calls.push(callTotalSupply(), callReserves(), callToken0(), callToken1())
        if (account) calls.push(callBalance())

        const results = await Promise.all(calls)
        if (cancelled) return

        let idx = 0
        const totalSupplyRaw = results[idx++] as string
        const reservesRaw = results[idx++] as string
        const token0Raw = results[idx++] as string
        const token1Raw = results[idx++] as string
        const balanceRaw = account ? (results[idx++] as string) : undefined

        const [reserve0, reserve1] = PAIR_INTERFACE.decodeFunctionResult('getReserves', reservesRaw) as [
          BigNumber,
          BigNumber
        ]
        const [token0] = PAIR_INTERFACE.decodeFunctionResult('token0', token0Raw) as [string]
        const [token1] = PAIR_INTERFACE.decodeFunctionResult('token1', token1Raw) as [string]
        const [totalSupply] = PAIR_INTERFACE.decodeFunctionResult('totalSupply', totalSupplyRaw) as [BigNumber]
        const balance = account
          ? (PAIR_INTERFACE.decodeFunctionResult('balanceOf', balanceRaw as string) as [BigNumber])[0]
          : undefined

        setDirectState({
          status: 'ok',
          lpBalance: balance,
          totalSupply,
          reserves: { reserve0, reserve1 },
          token0,
          token1
        })
      } catch (error) {
        if (cancelled) return
        const message = error instanceof Error ? error.message : 'RPC error'
        setDirectState(prev => ({ ...prev, status: 'rpc_unstable', error: message }))
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [pairAddress, account, chainId, shouldFallback, nonce])

  const multicallBalance = balanceCall.result?.[0] as BigNumber | undefined
  const multicallTotalSupply = totalSupplyCall.result?.[0] as BigNumber | undefined
  const multicallReserves = reservesCall.result as [BigNumber, BigNumber] | undefined
  const multicallToken0 = token0Call.result?.[0] as string | undefined
  const multicallToken1 = token1Call.result?.[0] as string | undefined

  const lpBalance = hasResult(multicallBalance) ? multicallBalance : directState.lpBalance
  const totalSupply = hasResult(multicallTotalSupply) ? multicallTotalSupply : directState.totalSupply
  const reserves =
    multicallReserves && multicallReserves[0] && multicallReserves[1]
      ? { reserve0: multicallReserves[0], reserve1: multicallReserves[1] }
      : directState.reserves
  const token0 = multicallToken0 ?? directState.token0
  const token1 = multicallToken1 ?? directState.token1

  const needsBalance = Boolean(account)
  const hasBalance = !needsBalance || hasResult(lpBalance)
  const hasCompleteData = hasBalance && hasResult(totalSupply) && hasResult(reserves) && hasResult(token0) && hasResult(token1)

  useEffect(() => {
    if (!pairAddress || chainId !== 77777) return
    if (hasCompleteData) return
    let cancelled = false
    const timeout = setTimeout(() => {
      if (cancelled) return
      if (!hasCompleteData) {
        setDirectState(prev => ({
          ...prev,
          status: 'rpc_unstable',
          error: prev.error ?? 'RPC timeout'
        }))
      }
    }, 10000)
    return () => {
      cancelled = true
      clearTimeout(timeout)
    }
  }, [pairAddress, chainId, hasCompleteData])

  const status: PairPositionStatus = useMemo(() => {
    if (!pairAddress || chainId !== 77777) return 'idle'
    if (hasCompleteData) return 'ok'
    if (directState.status === 'rpc_unstable') return 'rpc_unstable'
    if (balanceCall.loading || totalSupplyCall.loading || reservesCall.loading) return 'loading'
    if (token0Call.loading || token1Call.loading) return 'loading'
    return 'loading'
  }, [
    pairAddress,
    chainId,
    hasCompleteData,
    balanceCall.loading,
    totalSupplyCall.loading,
    reservesCall.loading,
    token0Call.loading,
    token1Call.loading,
    directState.status
  ])

  const source: PairPosition['source'] = useMemo(() => {
    if (multicallBalance || multicallTotalSupply || multicallReserves || multicallToken0 || multicallToken1)
      return 'multicall'
    if (directState.status === 'ok') return 'direct'
    return 'none'
  }, [multicallBalance, multicallTotalSupply, multicallReserves, multicallToken0, multicallToken1, directState.status])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!window.location.search.includes('debug=1')) return
    emitDebug({
      lastPositionState: {
        name: status,
        time: new Date().toISOString(),
        meta: {
          pairAddress: pairAddress ?? null,
          lpBalanceRaw: lpBalance?.toString() ?? null,
          totalSupplyRaw: totalSupply?.toString() ?? null,
          reserve0: reserves?.reserve0?.toString() ?? null,
          reserve1: reserves?.reserve1?.toString() ?? null,
          token0: token0 ?? null,
          token1: token1 ?? null,
          source
        }
      }
    })
  }, [status, pairAddress, lpBalance, totalSupply, reserves, token0, token1, source])

  return {
    status,
    lpBalance,
    totalSupply,
    reserves,
    token0,
    token1,
    source,
    error: directState.error,
    retry
  }
}
