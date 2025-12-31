import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useActiveWeb3React } from '../../hooks'
import { useEthernovaFallbackProvider } from '../../hooks/useEthernovaFallbackProvider'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { isAddress } from '../../utils'

const WNOVA_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)'
]

export function useBalances(): {
  novaBalance: BigNumber
  wnovaBalance: BigNumber
  refreshBalances: () => Promise<void>
  loading: boolean
  status: 'idle' | 'loading' | 'ready' | 'wrong_network' | 'unavailable'
  error: string | null
} {
  const { account, library, chainId } = useActiveWeb3React()
  const fallbackProvider = useEthernovaFallbackProvider()
  const { config } = useEthernovaConfig()
  const [novaBalance, setNovaBalance] = useState<BigNumber>(BigNumber.from(0))
  const [wnovaBalance, setWnovaBalance] = useState<BigNumber>(BigNumber.from(0))
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'wrong_network' | 'unavailable'>('idle')
  const [error, setError] = useState<string | null>(null)

  const wnovaAddress = useMemo(() => isAddress(config.tokens.WNOVA.address), [config.tokens.WNOVA.address])
  const wnovaContract = useMemo(() => {
    if (!library || !wnovaAddress) return null
    return new Contract(wnovaAddress, WNOVA_ABI, library)
  }, [library, wnovaAddress])

  const fallbackWnovaContract = useMemo(() => {
    if (!fallbackProvider || !wnovaAddress) return null
    return new Contract(wnovaAddress, WNOVA_ABI, fallbackProvider)
  }, [fallbackProvider, wnovaAddress])

  const expectedChainId = config.chainId || 77777
  const wrongNetwork = Boolean(account && chainId && chainId !== expectedChainId)

  const refreshBalances = useCallback(async () => {
    if (!library || !account) {
      setNovaBalance(BigNumber.from(0))
      setWnovaBalance(BigNumber.from(0))
      setStatus('idle')
      setError(null)
      return
    }
    if (wrongNetwork) {
      setStatus('wrong_network')
      setError(null)
      return
    }
    setLoading(true)
    setStatus('loading')
    setError(null)
    try {
      const [nativeBal, wrappedBal] = await Promise.all([
        library.getBalance(account),
        wnovaContract ? wnovaContract.balanceOf(account) : Promise.resolve(BigNumber.from(0))
      ])
      setNovaBalance(nativeBal)
      setWnovaBalance(wrappedBal)
      setStatus('ready')
    } catch (err) {
      if (fallbackProvider) {
        try {
          const [nativeBal, wrappedBal] = await Promise.all([
            fallbackProvider.getBalance(account),
            fallbackWnovaContract ? fallbackWnovaContract.balanceOf(account) : Promise.resolve(BigNumber.from(0))
          ])
          setNovaBalance(nativeBal)
          setWnovaBalance(wrappedBal)
          setStatus('ready')
          setError(null)
          setLoading(false)
          return
        } catch (fallbackError) {
          const message = fallbackError instanceof Error ? fallbackError.message : 'Balance unavailable (RPC)'
          setError(message)
          setStatus('unavailable')
        }
      } else {
        const message = err instanceof Error ? err.message : 'Balance unavailable (RPC)'
        setError(message)
        setStatus('unavailable')
      }
    } finally {
      setLoading(false)
    }
  }, [account, library, wnovaContract, wrongNetwork, fallbackProvider, fallbackWnovaContract])

  useEffect(() => {
    refreshBalances().catch(() => undefined)
  }, [refreshBalances])

  return { novaBalance, wnovaBalance, refreshBalances, loading, status, error }
}
