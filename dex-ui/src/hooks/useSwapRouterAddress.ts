import { useMemo } from 'react'
import { ROUTER_ADDRESS, SWAP_ROUTER_ADDRESS } from '../constants'
import { isAddress } from '../utils'
import { useEthernovaConfig } from './useEthernovaConfig'

export function useSwapRouterAddress(): string {
  const { config } = useEthernovaConfig()

  return useMemo(() => {
    const candidate =
      config?.contracts?.swapRouter ||
      SWAP_ROUTER_ADDRESS ||
      config?.contracts?.router ||
      ROUTER_ADDRESS ||
      ''
    return isAddress(candidate) ? candidate : ''
  }, [config])
}
