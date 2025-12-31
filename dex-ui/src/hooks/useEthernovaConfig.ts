import { useEffect, useMemo, useState } from 'react'
import {
  CHAIN_ID,
  EXPLORER_URL,
  FACTORY_ADDRESS,
  MULTICALL_ADDRESS,
  ROUTER_ADDRESS,
  TONY_ADDRESS,
  WNOVA_ADDRESS
} from '../constants/addresses'

export type EthernovaTokenConfig = {
  address: string
  decimals: number
  symbol: string
  name: string
}

export type EthernovaConfig = {
  chainId: number
  rpcUrl: string
  explorerUrl: string
  nativeSymbol: string
  startBlock?: number
  tokens: {
    WNOVA: EthernovaTokenConfig
    TONY: EthernovaTokenConfig
  }
  contracts: {
    factory: string
    router: string
    multicall2: string
    pair: string
  }
}

const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '')
const CONFIG_URL = `${PUBLIC_URL}/ethernova.config.json`

const FALLBACK_CONFIG: EthernovaConfig = {
  chainId: CHAIN_ID || 77777,
  rpcUrl: process.env.REACT_APP_NETWORK_URL ?? 'https://rpc.ethnova.net',
  explorerUrl: EXPLORER_URL ?? 'https://explorer.ethnova.net',
  nativeSymbol: 'NOVA',
  startBlock: undefined,
  tokens: {
    WNOVA: {
      address: WNOVA_ADDRESS ?? '',
      decimals: 18,
      symbol: 'WNOVA',
      name: 'Wrapped NOVA'
    },
    TONY: {
      address: TONY_ADDRESS ?? '',
      decimals: 18,
      symbol: 'TONY',
      name: 'STARK - IRON MAN'
    }
  },
  contracts: {
    factory: FACTORY_ADDRESS ?? '',
    router: ROUTER_ADDRESS ?? '',
    multicall2: MULTICALL_ADDRESS ?? '',
    pair: ''
  }
}

let cachedConfig: EthernovaConfig | null = null
let inflight: Promise<EthernovaConfig> | null = null

function normalizeConfig(raw: any): EthernovaConfig {
  const cfg = raw ?? {}
  return {
    chainId: Number(cfg.chainId ?? FALLBACK_CONFIG.chainId),
    rpcUrl: cfg.rpcUrl ?? FALLBACK_CONFIG.rpcUrl,
    explorerUrl: cfg.explorerUrl ?? FALLBACK_CONFIG.explorerUrl,
    nativeSymbol: cfg.nativeSymbol ?? FALLBACK_CONFIG.nativeSymbol,
    startBlock: typeof cfg.startBlock === 'number' ? cfg.startBlock : FALLBACK_CONFIG.startBlock,
    tokens: {
      WNOVA: {
        address: cfg.tokens?.WNOVA?.address ?? FALLBACK_CONFIG.tokens.WNOVA.address,
        decimals: Number(cfg.tokens?.WNOVA?.decimals ?? 18),
        symbol: cfg.tokens?.WNOVA?.symbol ?? 'WNOVA',
        name: cfg.tokens?.WNOVA?.name ?? 'Wrapped NOVA'
      },
      TONY: {
        address: cfg.tokens?.TONY?.address ?? FALLBACK_CONFIG.tokens.TONY.address,
        decimals: Number(cfg.tokens?.TONY?.decimals ?? 18),
        symbol: cfg.tokens?.TONY?.symbol ?? 'TONY',
        name: cfg.tokens?.TONY?.name ?? 'STARK - IRON MAN'
      }
    },
    contracts: {
      factory: cfg.contracts?.factory ?? FALLBACK_CONFIG.contracts.factory,
      router: cfg.contracts?.router ?? FALLBACK_CONFIG.contracts.router,
      multicall2: cfg.contracts?.multicall2 ?? FALLBACK_CONFIG.contracts.multicall2,
      pair: cfg.contracts?.pair ?? FALLBACK_CONFIG.contracts.pair
    }
  }
}

export function useEthernovaConfig(): {
  config: EthernovaConfig
  loading: boolean
  error: string | null
} {
  const [config, setConfig] = useState<EthernovaConfig | null>(cachedConfig)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (cachedConfig || inflight) return
    inflight = fetch(CONFIG_URL, { cache: 'no-store' })
      .then(async res => {
        if (!res.ok) {
          throw new Error(`Failed to load config (${res.status})`)
        }
        return res.json()
      })
      .then(raw => normalizeConfig(raw))
      .then(cfg => {
        cachedConfig = cfg
        setConfig(cfg)
        if (typeof window !== 'undefined') {
          ;(window as any).__NOVADEX_CONFIG__ = cfg
        }
        return cfg
      })
      .catch(err => {
        setError(err instanceof Error ? err.message : 'Failed to load config')
        return FALLBACK_CONFIG
      })
  }, [])

  const resolvedConfig = useMemo(() => normalizeConfig(config ?? FALLBACK_CONFIG), [config])

  return {
    config: resolvedConfig,
    loading: !config && !error,
    error
  }
}
