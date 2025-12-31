import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { formatUnits } from '@ethersproject/units'
import { useEffect, useMemo, useState } from 'react'
import { rpcCallWithFallback } from '../utils/rpcSafe'
import { useEthernovaConfig } from './useEthernovaConfig'

type SpotHistoryState = {
  status: 'idle' | 'loading' | 'ok' | 'empty' | 'error'
  prices: number[]
  error?: string
  lastBlock?: number
  fromCache?: boolean
}

const SYNC_INTERFACE = new Interface(['event Sync(uint112 reserve0, uint112 reserve1)'])
const SYNC_TOPIC = SYNC_INTERFACE.getEventTopic('Sync')

type CacheEntry = {
  prices: number[]
  lastBlock: number
  updatedAt: number
}

function getCacheKey(pairAddress: string): string {
  return `novadex:spot:${pairAddress.toLowerCase()}`
}

function parseHexBlock(value: string): number {
  return BigNumber.from(value).toNumber()
}

export function useSpotPriceHistory(
  pairAddress?: string,
  token0Decimals = 18,
  token1Decimals = 18
): SpotHistoryState {
  const { config } = useEthernovaConfig()
  const [state, setState] = useState<SpotHistoryState>({ status: 'idle', prices: [] })

  const startBlock = config.startBlock ?? 0

  const cacheKey = useMemo(() => (pairAddress ? getCacheKey(pairAddress) : null), [pairAddress])

  useEffect(() => {
    if (!pairAddress || !cacheKey) {
      setState({ status: 'idle', prices: [] })
      return
    }

    let cancelled = false

    const loadFromCache = () => {
      try {
        const raw = localStorage.getItem(cacheKey)
        if (!raw) return null
        const parsed = JSON.parse(raw) as CacheEntry
        if (!parsed?.prices?.length || !parsed?.lastBlock) return null
        return parsed
      } catch {
        return null
      }
    }

    const saveCache = (entry: CacheEntry) => {
      try {
        localStorage.setItem(cacheKey, JSON.stringify(entry))
      } catch {
        // ignore cache errors
      }
    }

    const run = async () => {
      const cached = loadFromCache()
      if (cached && !cancelled) {
        setState({
          status: cached.prices.length ? 'ok' : 'empty',
          prices: cached.prices,
          lastBlock: cached.lastBlock,
          fromCache: true
        })
      } else {
        setState(prev => ({ ...prev, status: 'loading', error: undefined }))
      }

      try {
        const latestHex = (await rpcCallWithFallback('eth_blockNumber', [], { timeoutMs: 8000, retries: 3 })) as string
        const latestBlock = parseHexBlock(latestHex)
        const windowSize = 20000
        const fromBlock = cached?.lastBlock ? cached.lastBlock + 1 : Math.max(startBlock, latestBlock - windowSize)
        const filter = {
          address: pairAddress,
          fromBlock: `0x${fromBlock.toString(16)}`,
          toBlock: 'latest',
          topics: [SYNC_TOPIC]
        }
        const logs = (await rpcCallWithFallback('eth_getLogs', [filter], {
          timeoutMs: 12000,
          retries: 3,
          backoffMs: 500,
          debugTag: 'syncLogs'
        })) as Array<any>

        const points: Array<{ block: number; price: number }> = []
        for (const log of logs ?? []) {
          try {
            const parsed = SYNC_INTERFACE.parseLog(log)
            const reserve0 = BigNumber.from(parsed.args.reserve0)
            const reserve1 = BigNumber.from(parsed.args.reserve1)
            if (reserve0.isZero() || reserve1.isZero()) continue
            const value0 = parseFloat(formatUnits(reserve0, token0Decimals))
            const value1 = parseFloat(formatUnits(reserve1, token1Decimals))
            if (!value0 || !value1) continue
            const price = value1 / value0
            const block = parseHexBlock(log.blockNumber)
            if (Number.isFinite(price)) points.push({ block, price })
          } catch {
            // ignore bad log
          }
        }

        const merged = cached?.prices?.length
          ? [...cached.prices, ...points.map(p => p.price)].slice(-60)
          : points.map(p => p.price).slice(-60)

        const lastBlock = logs?.length ? parseHexBlock(logs[logs.length - 1].blockNumber) : cached?.lastBlock ?? latestBlock

        if (cancelled) return
        const nextState: SpotHistoryState = {
          status: merged.length ? 'ok' : 'empty',
          prices: merged,
          lastBlock,
          fromCache: false
        }
        setState(nextState)
        saveCache({ prices: merged, lastBlock, updatedAt: Date.now() })
      } catch (error) {
        if (cancelled) return
        setState(prev => ({
          ...prev,
          status: prev.prices.length ? 'ok' : 'error',
          error: error instanceof Error ? error.message : 'RPC error'
        }))
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [pairAddress, cacheKey, startBlock, token0Decimals, token1Decimals])

  return state
}
