import { BigNumber } from '@ethersproject/bignumber'
import { Interface } from '@ethersproject/abi'
import { Token, TokenAmount } from '@im33357/uniswap-v2-sdk'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTokenContract } from '../hooks/useContract'
import { useSingleCallResult } from '../state/multicall/hooks'
import { useActiveWeb3React } from '../hooks'
import { rpcCallWithFallback } from '../utils/ethernovaRpc'
import ERC20_ABI from '../constants/abis/erc20.json'

// returns undefined if input token is undefined, or fails to get token contract,
// or contract total supply cannot be fetched
export function useTotalSupply(token?: Token): TokenAmount | undefined {
  const { chainId } = useActiveWeb3React()
  const contract = useTokenContract(token?.address, false)
  const totalSupplyCall = useSingleCallResult(contract, 'totalSupply')
  const [fallbackSupply, setFallbackSupply] = useState<BigNumber | undefined>()

  const fetchFallback = useCallback(async () => {
    if (!token || !token.address || chainId !== 77777) return
    try {
      const data = new Interface(ERC20_ABI).encodeFunctionData('totalSupply', [])
      const result = await rpcCallWithFallback('eth_call', [{ to: token.address, data }, 'latest'])
      setFallbackSupply(BigNumber.from(result as string))
    } catch {
      // ignore fallback errors
    }
  }, [token, chainId])

  useEffect(() => {
    if (!token) return
    const totalSupply = totalSupplyCall?.result?.[0] as BigNumber | undefined
    if (totalSupply) return
    if (totalSupplyCall?.loading) return
    fetchFallback().catch(() => undefined)
  }, [token, totalSupplyCall, fetchFallback])

  const totalSupply = (totalSupplyCall?.result?.[0] as BigNumber | undefined) ?? fallbackSupply

  return useMemo(() => (token && totalSupply ? new TokenAmount(token, totalSupply.toString()) : undefined), [
    token,
    totalSupply
  ])
}
