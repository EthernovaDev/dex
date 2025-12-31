import { namehash } from 'ethers/lib/utils'
import { useMemo } from 'react'
import { useSingleCallResult } from '../state/multicall/hooks'
import { isAddress } from '../utils'
import isZero from '../utils/isZero'
import { useENSRegistrarContract, useENSResolverContract } from './useContract'
import { useActiveWeb3React } from './index'
import useDebounce from './useDebounce'

/**
 * Does a reverse lookup for an address to find its ENS name.
 * Note this is not the same as looking up an ENS name to find an address.
 */
export default function useENSName(address?: string): { ENSName: string | null; loading: boolean } {
  const { chainId } = useActiveWeb3React()
  const isMainnet = chainId === 1
  const effectiveAddress = isMainnet ? address : undefined
  const debouncedAddress = useDebounce(effectiveAddress, 200)
  const ensNodeArgument = useMemo(() => {
    if (!debouncedAddress || !isAddress(debouncedAddress)) return [undefined]
    try {
      return debouncedAddress ? [namehash(`${debouncedAddress.toLowerCase().substr(2)}.addr.reverse`)] : [undefined]
    } catch (error) {
      return [undefined]
    }
  }, [debouncedAddress])
  const registrarContract = useENSRegistrarContract(false)
  const resolverAddress = useSingleCallResult(registrarContract, 'resolver', ensNodeArgument)
  const resolverAddressResult = resolverAddress.result?.[0]
  const resolverContract = useENSResolverContract(
    resolverAddressResult && !isZero(resolverAddressResult) ? resolverAddressResult : undefined,
    false
  )
  const name = useSingleCallResult(resolverContract, 'name', ensNodeArgument)

  const changed = debouncedAddress !== effectiveAddress
  return {
    ENSName: isMainnet ? (changed ? null : name.result?.[0] ?? null) : null,
    loading: isMainnet ? changed || resolverAddress.loading || name.loading : false
  }
}
