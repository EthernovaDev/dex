import { namehash } from 'ethers/lib/utils'
import { useMemo } from 'react'
import { useSingleCallResult } from '../state/multicall/hooks'
import isZero from '../utils/isZero'
import { useENSRegistrarContract, useENSResolverContract } from './useContract'
import { useActiveWeb3React } from './index'

/**
 * Does a lookup for an ENS name to find its contenthash.
 */
export default function useENSContentHash(ensName?: string | null): { loading: boolean; contenthash: string | null } {
  const { chainId } = useActiveWeb3React()
  const isMainnet = chainId === 1
  const effectiveName = isMainnet ? ensName : undefined
  const ensNodeArgument = useMemo(() => {
    if (!effectiveName) return [undefined]
    try {
      return effectiveName ? [namehash(effectiveName)] : [undefined]
    } catch (error) {
      return [undefined]
    }
  }, [effectiveName])
  const registrarContract = useENSRegistrarContract(false)
  const resolverAddressResult = useSingleCallResult(registrarContract, 'resolver', ensNodeArgument)
  const resolverAddress = resolverAddressResult.result?.[0]
  const resolverContract = useENSResolverContract(
    resolverAddress && isZero(resolverAddress) ? undefined : resolverAddress,
    false
  )
  const contenthash = useSingleCallResult(resolverContract, 'contenthash', ensNodeArgument)

  return {
    contenthash: isMainnet ? contenthash.result?.[0] ?? null : null,
    loading: isMainnet ? resolverAddressResult.loading || contenthash.loading : false
  }
}
