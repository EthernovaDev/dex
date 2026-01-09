import { Token, TokenAmount } from '@im33357/uniswap-v2-sdk'
import { useEffect, useMemo, useState } from 'react'

import { useTokenContract } from '../hooks/useContract'
import { useActiveWeb3React } from '../hooks'
import ERC20_ABI from '../constants/abis/erc20.json'
import { Contract } from '@ethersproject/contracts'
import { useSingleCallResult } from '../state/multicall/hooks'

export function useTokenAllowance(token?: Token, owner?: string, spender?: string): TokenAmount | undefined {
  const { chainId, library } = useActiveWeb3React()
  const contract = useTokenContract(token?.address, false)
  const [directAllowance, setDirectAllowance] = useState<TokenAmount | undefined>()
  const [directError, setDirectError] = useState(false)

  const inputs = useMemo(() => [owner, spender], [owner, spender])
  const allowance = useSingleCallResult(contract, 'allowance', inputs).result

  useEffect(() => {
    if (!token || !owner || !spender || !library || chainId !== 121525) return
    let stale = false
    setDirectError(false)
    const read = async () => {
      try {
        const tokenContract = new Contract(token.address, ERC20_ABI, library)
        const result = await tokenContract.allowance(owner, spender)
        if (!stale) {
          setDirectAllowance(new TokenAmount(token, result.toString()))
        }
      } catch {
        if (!stale) {
          setDirectError(true)
          setDirectAllowance(undefined)
        }
      }
    }
    read()
    return () => {
      stale = true
    }
  }, [token, owner, spender, library, chainId])

  const multicallAllowance = useMemo(() => (token && allowance ? new TokenAmount(token, allowance.toString()) : undefined), [
    token,
    allowance
  ])

  if (chainId === 121525) {
    if (directAllowance) return directAllowance
    if (directError && token && owner && spender) return new TokenAmount(token, '0')
    return multicallAllowance
  }

  return multicallAllowance
}
