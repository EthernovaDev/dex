import { FallbackProvider, StaticJsonRpcProvider, JsonRpcProvider } from '@ethersproject/providers'
import { emitDebug } from './debugEvents'

type RpcCallOptions = {
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  urls?: string[]
  debugTag?: string
  provider?: JsonRpcProvider
  expectedChainId?: number
}

const DEFAULT_RPC_URLS = [process.env.REACT_APP_NETWORK_URL ?? 'https://rpc.ethnova.net']
const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_CONCURRENCY = Number(process.env.REACT_APP_RPC_CONCURRENCY ?? 6)
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

type RpcStats = {
  lastUrl?: string
  lastMethod?: string
  lastError?: string
  lastErrorType?: string
  retryCount?: number
  lastSuccessAt?: string
  consecutiveFailures?: number
  status?: 'ok' | 'degraded' | 'down'
  updatedAt?: string
}

let rpcStats: RpcStats = {}
let lastSuccessAtMs: number | null = null
let consecutiveFailures = 0

function updateRpcStats(update: RpcStats) {
  rpcStats = { ...rpcStats, ...update, updatedAt: new Date().toISOString() }
  try {
    emitDebug({ rpcStats })
  } catch {
    // ignore debug failures
  }
}

function uniq(list: string[]): string[] {
  return Array.from(new Set(list.map(value => value.trim()).filter(Boolean)))
}

export function getEthernovaRpcUrls(): string[] {
  const env = process.env.REACT_APP_ETHERNOVA_RPC_URLS
  const envUrls = env ? env.split(',') : []
  const runtime = typeof window !== 'undefined' ? (window as any).__NOVADEX_CONFIG__ : null
  const runtimeUrl = runtime?.rpcUrl ? [runtime.rpcUrl] : []
  const merged = uniq([...runtimeUrl, ...envUrls, ...DEFAULT_RPC_URLS])
  return merged.length ? merged : DEFAULT_RPC_URLS
}

function isHtmlResponse(text: string, contentType: string | null): boolean {
  if (contentType && contentType.includes('text/html')) return true
  return /<html/i.test(text) || /<!doctype/i.test(text) || text.trim().startsWith('<')
}

function classifyError(error: unknown): string {
  if (!error) return 'unknown'
  const message = error instanceof Error ? error.message : String(error)
  if (/timeout|abort|AbortError/i.test(message)) return 'timeout'
  if (/html/i.test(message)) return 'html'
  if (/403|429|5\d\d/i.test(message)) return 'http'
  if (/execution reverted|revert/i.test(message)) return 'revert'
  return 'rpc'
}

function markSuccess(url?: string, method?: string) {
  lastSuccessAtMs = Date.now()
  consecutiveFailures = 0
  updateRpcStats({
    lastUrl: url,
    lastMethod: method,
    lastError: undefined,
    lastErrorType: undefined,
    lastSuccessAt: new Date(lastSuccessAtMs).toISOString(),
    consecutiveFailures,
    status: 'ok'
  })
}

function markFailure(url: string | undefined, method: string | undefined, error: unknown, retryCount?: number) {
  consecutiveFailures += 1
  const now = Date.now()
  const status = lastSuccessAtMs && now - lastSuccessAtMs < 30000 ? 'degraded' : 'down'
  updateRpcStats({
    lastUrl: url,
    lastMethod: method,
    lastError: error instanceof Error ? error.message : String(error),
    lastErrorType: classifyError(error),
    retryCount,
    lastSuccessAt: lastSuccessAtMs ? new Date(lastSuccessAtMs).toISOString() : undefined,
    consecutiveFailures,
    status
  })
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

function createLimiter(concurrency: number) {
  let active = 0
  const queue: Array<() => void> = []
  const next = () => {
    const resolve = queue.shift()
    if (resolve) resolve()
  }
  return async function limit<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= concurrency) {
      await new Promise<void>(resolve => queue.push(resolve))
    }
    active += 1
    try {
      return await fn()
    } finally {
      active -= 1
      next()
    }
  }
}

const limitRpc = createLimiter(DEFAULT_CONCURRENCY)

export async function rpcCall(
  url: string,
  method: string,
  params: unknown[] = [],
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<unknown> {
  const payload = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  }
  return limitRpc(async () => {
    const response = await fetchWithTimeout(
      url,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload)
      },
      timeoutMs
    )
    const text = await response.text()
    if (!response.ok || isHtmlResponse(text, response.headers.get('content-type'))) {
      throw new Error(
        `RPC ${url} HTTP ${response.status}${
          isHtmlResponse(text, response.headers.get('content-type')) ? ' (html)' : ''
        }`
      )
    }
    let json: any
    try {
      json = JSON.parse(text)
    } catch {
      throw new Error(`RPC ${url} invalid JSON`)
    }
    if (json?.error) {
      throw new Error(json.error?.message || 'RPC error')
    }
    markSuccess(url, method)
    return json.result
  })
}

export async function rpcCallWithFallback(method: string, params: unknown[] = [], options: RpcCallOptions = {}): Promise<unknown> {
  const urls = options.urls && options.urls.length ? options.urls : getEthernovaRpcUrls()
  const retries = options.retries ?? 5
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let delay = options.backoffMs ?? 500
  let lastError: Error | null = null
  let retryCount = 0

  for (let attempt = 0; attempt < retries; attempt++) {
    for (const url of urls) {
      try {
        updateRpcStats({ lastUrl: url, lastMethod: method })
        const result = await rpcCall(url, method, params, timeoutMs)
        return result
      } catch (error) {
        lastError = error as Error
        retryCount += 1
        markFailure(url, method, error, retryCount)
      }
    }
    await sleep(delay)
    delay = Math.min(delay * 2, 8000)
  }
  throw lastError || new Error(options.debugTag ? `${options.debugTag}: RPC unavailable` : 'RPC unavailable')
}

export async function getHealthyRpcUrls(): Promise<string[]> {
  const urls = getEthernovaRpcUrls()
  const checks = await Promise.all(
    urls.map(async url => {
      try {
        await rpcCall(url, 'eth_chainId', [])
        return url
      } catch {
        return null
      }
    })
  )
  const healthy = checks.filter((url): url is string => Boolean(url))
  return healthy.length ? healthy : urls
}

export function createEthernovaFallbackProvider(urls: string[]): FallbackProvider {
  const providers = urls.map(url => new StaticJsonRpcProvider(url, 77777))
  const configs = providers.map((provider, index) => ({
    provider,
    priority: index + 1,
    weight: 1,
    stallTimeout: 1500
  }))
  return new FallbackProvider(configs, 1)
}

export async function callReadWithFallback(
  call: { to: string; data: string },
  options: RpcCallOptions = {}
): Promise<string> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const provider = options.provider
  const expectedChainId = options.expectedChainId

  if (provider) {
    try {
      if (expectedChainId) {
        const network = await provider.getNetwork()
        if (network.chainId !== expectedChainId) {
          throw new Error(`Provider chainId ${network.chainId} != ${expectedChainId}`)
        }
      }
      const result = await limitRpc(() =>
        Promise.race([
          provider.call({ to: call.to, data: call.data }),
          new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('Provider call timeout')), timeoutMs)
          )
        ])
      )
      const providerUrl = (provider as any)?.connection?.url
      markSuccess(providerUrl, 'eth_call')
      return result
    } catch (error) {
      const providerUrl = (provider as any)?.connection?.url
      markFailure(providerUrl, 'eth_call', error)
      // fall back to fetch-based RPC
    }
  }

  const result = (await rpcCallWithFallback('eth_call', [{ to: call.to, data: call.data }, 'latest'], options)) as string
  return result
}
