import {
  createEthernovaFallbackProvider,
  getEthernovaRpcUrls,
  getHealthyRpcUrls,
  callReadWithFallback,
  rpcCall,
  rpcCallWithFallback as rpcCallWithFallbackSafe
} from './rpcSafe'

export { createEthernovaFallbackProvider, getEthernovaRpcUrls, getHealthyRpcUrls, callReadWithFallback, rpcCall }

export async function rpcCallWithFallback(method: string, params: unknown[] = [], attempts = 5): Promise<unknown> {
  return rpcCallWithFallbackSafe(method, params, { retries: attempts })
}
