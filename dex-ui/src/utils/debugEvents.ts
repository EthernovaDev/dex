export type DebugEventDetail = {
  lastConnector?: string
  lastActivationAt?: string
  lastError?: {
    name: string
    message: string
    time: string
  } | null
  lastRuntimeCrash?: {
    message: string
    stack?: string
    time: string
    url: string
    source: string
    build: string
  } | null
  lastAction?: {
    name: string
    time: string
    meta?: Record<string, unknown>
  } | null
  lastPositionState?: {
    name: string
    time: string
    meta?: Record<string, unknown>
  } | null
  lastLiquidityContext?: {
    chainId?: number | null
    chainIdRaw?: string | null
    account?: string | null
    currencyA?: { symbol?: string; address?: string | null }
    currencyB?: { symbol?: string; address?: string | null }
    pairAddress?: string | null
    token0?: string | null
    token1?: string | null
    reserve0?: string | null
    reserve1?: string | null
    reserveForA?: string | null
    reserveForB?: string | null
    lpBalanceRaw?: string | null
    lpReadPath?: 'multicall' | 'direct' | 'none' | string
    lastRpcError?: string | null
    provider?: string | null
    rpcUrl?: string | null
  } | null
  rpcStats?: {
    lastUrl?: string
    lastMethod?: string
    lastError?: string
    lastErrorType?: string
    retryCount?: number
    lastSuccessAt?: string
    consecutiveFailures?: number
    status?: 'ok' | 'degraded' | 'down'
    updatedAt?: string
  } | null
}

declare global {
  interface Window {
    __NOVADEX_DEBUG__?: DebugEventDetail
  }
}

export function emitDebug(detail: DebugEventDetail): void {
  if (typeof window === 'undefined') return
  const previous = window.__NOVADEX_DEBUG__ || {}
  const next = { ...previous, ...detail }
  window.__NOVADEX_DEBUG__ = next
  window.dispatchEvent(new CustomEvent('novadex:debug', { detail: next }))
}
