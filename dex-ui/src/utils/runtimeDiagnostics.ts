import { emitDebug } from './debugEvents'

const BUILD_STAMP = process.env.REACT_APP_BUILD_STAMP ?? 'unknown'
const AUTO_RELOAD_KEY = 'novadex-auto-reload'
const MAX_STACK = 900

export type RuntimeCrash = {
  message: string
  stack?: string
  time: string
  url: string
  source: string
  build: string
}

declare global {
  interface Window {
    __NOVADEX_RUNTIME_CRASH__?: RuntimeCrash
    __NOVADEX_RUNTIME_LISTENER__?: boolean
  }
}

function shouldAutoReload(message: string): boolean {
  return /ChunkLoadError|Loading chunk/i.test(message)
}

function tryAutoReload(): void {
  if (typeof window === 'undefined') return
  try {
    const stamp = sessionStorage.getItem(AUTO_RELOAD_KEY)
    if (stamp === BUILD_STAMP) return
    sessionStorage.setItem(AUTO_RELOAD_KEY, BUILD_STAMP)
    const url = new URL(window.location.href)
    url.searchParams.set('v', BUILD_STAMP)
    window.location.replace(url.toString())
  } catch {
    // ignore auto-reload failures
  }
}

function captureCrash(crash: RuntimeCrash): void {
  if (typeof window === 'undefined') return
  window.__NOVADEX_RUNTIME_CRASH__ = crash
  emitDebug({ lastRuntimeCrash: crash })
  console.error('[runtime-crash]', crash)
  if (shouldAutoReload(crash.message)) {
    tryAutoReload()
  }
}

function normalizeError(error: unknown): { message: string; stack?: string } {
  if (error instanceof Error) {
    return { message: error.message || 'Unknown error', stack: error.stack }
  }
  if (typeof error === 'string') {
    return { message: error }
  }
  try {
    return { message: JSON.stringify(error) }
  } catch {
    return { message: 'Unknown error' }
  }
}

function trimStack(stack?: string): string | undefined {
  if (!stack) return undefined
  return stack.length > MAX_STACK ? `${stack.slice(0, MAX_STACK)}…` : stack
}

export function reportRuntimeCrash(source: string, error: unknown): void {
  const normalized = normalizeError(error)
  captureCrash({
    message: normalized.message,
    stack: trimStack(normalized.stack),
    time: new Date().toISOString(),
    url: typeof window !== 'undefined' ? window.location.href : 'unknown',
    source,
    build: BUILD_STAMP
  })
}

export function registerRuntimeDiagnostics(): void {
  if (typeof window === 'undefined') return
  if (window.__NOVADEX_RUNTIME_LISTENER__) return
  window.__NOVADEX_RUNTIME_LISTENER__ = true

  window.addEventListener('error', event => {
    const error = event.error || event.message || 'Unknown error'
    reportRuntimeCrash('window.error', error)
  })

  window.addEventListener('unhandledrejection', event => {
    reportRuntimeCrash('unhandledrejection', event.reason)
  })
}
