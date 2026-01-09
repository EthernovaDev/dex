import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { AddressZero } from '@ethersproject/constants'
import { useEffect, useRef, useState } from 'react'
import { useActiveWeb3React } from './index'
import { useEthernovaConfig } from './useEthernovaConfig'
import { useMulticallContract } from './useContract'
import { rpcCallWithFallback } from '../utils/ethernovaRpc'
import { isAddress } from '../utils'
import { useAllTokens } from './Tokens'

const FACTORY_INTERFACE = new Interface([
  'function allPairsLength() view returns (uint256)',
  'function allPairs(uint256) view returns (address)',
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
])
const PAIR_CREATED_TOPIC = FACTORY_INTERFACE.getEventTopic('PairCreated')

const PAIR_INTERFACE = new Interface([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)'
])

const ERC20_INTERFACE = new Interface([
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)'
])

type PairCacheEntry = {
  pairs: string[]
  lastBlock: number
  updatedAt: number
}

export type PairTokenMeta = {
  address: string
  symbol: string
  decimals: number
}

export type PairInfo = {
  address: string
  token0: PairTokenMeta
  token1: PairTokenMeta
  reserve0: BigNumber
  reserve1: BigNumber
}

type PairState = {
  pairs: PairInfo[]
  total: number
  loading: boolean
  error?: string
}

function normalizeSymbol(symbol?: string): string {
  if (!symbol) return 'UNKNOWN'
  return symbol.trim() || 'UNKNOWN'
}

export function useFactoryPairs(page: number, pageSize: number): PairState & { retry: () => void } {
  const { chainId } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const factoryAddress = isAddress(config.contracts.factory)
  const multicall = useMulticallContract()
  const allTokens = useAllTokens()
  const [state, setState] = useState<PairState>({ pairs: [], total: 0, loading: false })
  const [nonce, setNonce] = useState(0)

  const pairCache = useRef<Map<string, PairInfo>>(new Map())
  const tokenCache = useRef<Map<string, PairTokenMeta>>(new Map())
  const logPairsCache = useRef<string[] | null>(null)

  const retry = () => {
    pairCache.current.clear()
    tokenCache.current.clear()
    logPairsCache.current = null
    if (factoryAddress) {
      try {
        localStorage.removeItem(`novadex:pairs:${factoryAddress.toLowerCase()}`)
      } catch {
        // ignore storage errors
      }
    }
    setNonce(value => value + 1)
  }

  const offset = page * pageSize

  useEffect(() => {
    if (!factoryAddress) return
    let cancelled = false
    setState(prev => ({ ...prev, loading: true, error: undefined }))

    const fetchTokenMeta = async (address: string): Promise<PairTokenMeta> => {
      const cached = tokenCache.current.get(address.toLowerCase())
      if (cached) return cached
      const knownToken = allTokens[address] ?? allTokens[address.toLowerCase()]
      if (knownToken) {
        const meta = {
          address,
          symbol: knownToken.symbol ?? 'UNKNOWN',
          decimals: knownToken.decimals ?? 18
        }
        tokenCache.current.set(address.toLowerCase(), meta)
        return meta
      }
      try {
        const symbolData = ERC20_INTERFACE.encodeFunctionData('symbol', [])
        const decimalsData = ERC20_INTERFACE.encodeFunctionData('decimals', [])
        const [symbolRaw, decimalsRaw] = await Promise.all([
          rpcCallWithFallback('eth_call', [{ to: address, data: symbolData }, 'latest']),
          rpcCallWithFallback('eth_call', [{ to: address, data: decimalsData }, 'latest'])
        ])
        const [symbol] = ERC20_INTERFACE.decodeFunctionResult('symbol', symbolRaw as string) as [string]
        const [decimals] = ERC20_INTERFACE.decodeFunctionResult('decimals', decimalsRaw as string) as [number]
        const meta = { address, symbol: normalizeSymbol(symbol), decimals: Number(decimals) }
        tokenCache.current.set(address.toLowerCase(), meta)
        return meta
      } catch {
        const fallback = { address, symbol: address.slice(0, 6), decimals: 18 }
        tokenCache.current.set(address.toLowerCase(), fallback)
        return fallback
      }
    }

    const fetchPairDetails = async (pairAddress: string): Promise<PairInfo | null> => {
      const cached = pairCache.current.get(pairAddress.toLowerCase())
      if (cached) return cached
      try {
        const token0Data = PAIR_INTERFACE.encodeFunctionData('token0', [])
        const token1Data = PAIR_INTERFACE.encodeFunctionData('token1', [])
        const reservesData = PAIR_INTERFACE.encodeFunctionData('getReserves', [])

        let token0Raw: string | undefined
        let token1Raw: string | undefined
        let reservesRaw: string | undefined

        if (multicall && chainId === 121525 && (multicall as any).tryAggregate) {
          try {
            const calls = [
              [pairAddress, token0Data],
              [pairAddress, token1Data],
              [pairAddress, reservesData]
            ]
            const results = await (multicall as any).tryAggregate(false, calls)
            token0Raw = results?.[0]?.success ? results[0].returnData : undefined
            token1Raw = results?.[1]?.success ? results[1].returnData : undefined
            reservesRaw = results?.[2]?.success ? results[2].returnData : undefined
          } catch {
            // fall back to direct calls below
          }
        }

        if (!token0Raw) {
          token0Raw = (await rpcCallWithFallback('eth_call', [{ to: pairAddress, data: token0Data }, 'latest'])) as string
        }
        if (!token1Raw) {
          token1Raw = (await rpcCallWithFallback('eth_call', [{ to: pairAddress, data: token1Data }, 'latest'])) as string
        }
        if (!reservesRaw) {
          reservesRaw = (await rpcCallWithFallback('eth_call', [{ to: pairAddress, data: reservesData }, 'latest'])) as string
        }

        const [token0Addr] = PAIR_INTERFACE.decodeFunctionResult('token0', token0Raw) as [string]
        const [token1Addr] = PAIR_INTERFACE.decodeFunctionResult('token1', token1Raw) as [string]
        const [reserve0, reserve1] = PAIR_INTERFACE.decodeFunctionResult('getReserves', reservesRaw) as [
          BigNumber,
          BigNumber
        ]

        const [token0, token1] = await Promise.all([fetchTokenMeta(token0Addr), fetchTokenMeta(token1Addr)])
        const info = { address: pairAddress, token0, token1, reserve0, reserve1 }
        pairCache.current.set(pairAddress.toLowerCase(), info)
        return info
      } catch {
        return null
      }
    }

    const loadCache = (): PairCacheEntry | null => {
      if (!factoryAddress) return null
      try {
        const raw = localStorage.getItem(`novadex:pairs:${factoryAddress.toLowerCase()}`)
        if (!raw) return null
        const parsed = JSON.parse(raw) as PairCacheEntry
        if (!parsed?.pairs?.length || typeof parsed.lastBlock !== 'number') return null
        return parsed
      } catch {
        return null
      }
    }

    const saveCache = (entry: PairCacheEntry) => {
      if (!factoryAddress) return
      try {
        localStorage.setItem(`novadex:pairs:${factoryAddress.toLowerCase()}`, JSON.stringify(entry))
      } catch {
        // ignore storage errors
      }
    }

    const fetchPairsFromLogs = async (): Promise<string[]> => {
      if (logPairsCache.current) return logPairsCache.current
      const cached = loadCache()
      const fromBlock = config.startBlock ?? 0
      const latestHex = (await rpcCallWithFallback('eth_blockNumber', [], 3)) as string
      const latestBlock = BigNumber.from(latestHex).toNumber()
      let startBlock = cached?.lastBlock ? cached.lastBlock + 1 : fromBlock
      if (startBlock < fromBlock) startBlock = fromBlock
      const endBlock = latestBlock

      const pairs = new Set<string>(cached?.pairs ?? [])
      const step = 5000
      for (let block = startBlock; block <= endBlock; block += step) {
        const toBlock = Math.min(block + step - 1, endBlock)
        const logs = (await rpcCallWithFallback('eth_getLogs', [
          {
            address: factoryAddress,
            fromBlock: `0x${block.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            topics: [PAIR_CREATED_TOPIC]
          }
        ])) as Array<any>
        for (const log of logs ?? []) {
          try {
            const parsed = FACTORY_INTERFACE.parseLog(log)
            const pairAddress = parsed?.args?.pair as string | undefined
            if (pairAddress) pairs.add(pairAddress.toLowerCase())
          } catch {
            // ignore parse errors
          }
        }
      }
      const unique = Array.from(pairs)
      logPairsCache.current = unique
      saveCache({ pairs: unique, lastBlock: endBlock, updatedAt: Date.now() })
      return unique
    }

    const run = async () => {
      try {
        let total = 0
        let pairAddresses: string[] = []
        let useLogs = false
        try {
          const lengthData = FACTORY_INTERFACE.encodeFunctionData('allPairsLength', [])
          const lengthRaw = (await rpcCallWithFallback('eth_call', [
            { to: factoryAddress, data: lengthData },
            'latest'
          ])) as string
          const [totalPairs] = FACTORY_INTERFACE.decodeFunctionResult('allPairsLength', lengthRaw) as [BigNumber]
          total = totalPairs.toNumber()
          if (total === 0) {
            useLogs = true
          } else {
            const limit = Math.min(pageSize, Math.max(total - offset, 0))
            for (let i = 0; i < limit; i++) {
              const index = offset + i
              const data = FACTORY_INTERFACE.encodeFunctionData('allPairs', [index])
              const result = (await rpcCallWithFallback('eth_call', [{ to: factoryAddress, data }, 'latest'])) as string
              const [pairAddr] = FACTORY_INTERFACE.decodeFunctionResult('allPairs', result) as [string]
              if (pairAddr && pairAddr !== AddressZero) {
                pairAddresses.push(pairAddr)
              }
            }
          }
        } catch {
          useLogs = true
        }

        if (useLogs) {
          const pairs = await fetchPairsFromLogs()
          total = pairs.length
          pairAddresses = pairs.slice(offset, offset + pageSize)
        }

        const pairs: PairInfo[] = []
        for (const pairAddress of pairAddresses) {
          const info = await fetchPairDetails(pairAddress)
          if (info) pairs.push(info)
        }

        if (!cancelled) {
          setState({ pairs, total, loading: false })
        }
      } catch (error) {
        if (!cancelled) {
          const message = error instanceof Error ? error.message : 'RPC error'
          setState(prev => ({ ...prev, loading: false, error: message }))
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [factoryAddress, page, pageSize, offset, multicall, chainId, nonce, allTokens, config.startBlock])

  return { ...state, retry }
}
