import { BigNumber } from '@ethersproject/bignumber'
import { Currency, CurrencyAmount, ETHER, JSBI, Token, TokenAmount } from '@im33357/uniswap-v2-sdk'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ERC20_INTERFACE from '../../constants/abis/erc20'
import { useAllTokens } from '../../hooks/Tokens'
import { useActiveWeb3React } from '../../hooks'
import { isAddress } from '../../utils'
import { useMultipleContractSingleData } from '../multicall/hooks'
import { ETHERNOVA_CHAIN_ID } from '../../utils/ethernova'
import { rpcCallWithFallback, callReadWithFallback } from '../../utils/ethernovaRpc'

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))
const TOKEN_BALANCE_CACHE_MS = 4000
const tokenBalanceCache = new Map<string, { value: TokenAmount; ts: number }>()

type BalanceState = {
  balance?: CurrencyAmount
  status: 'idle' | 'loading' | 'ok' | 'wrong_network' | 'unavailable'
  error: string | null
  refresh: () => void
}

export function useNativeBalance(
  account?: string
): {
  balance?: CurrencyAmount
  loading: boolean
  error: string | null
  status: 'idle' | 'ok' | 'wrong_network' | 'unavailable'
  refresh: () => Promise<void>
} {
  const { library, chainId } = useActiveWeb3React()
  const [balance, setBalance] = useState<CurrencyAmount | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<'idle' | 'ok' | 'wrong_network' | 'unavailable'>('idle')

  const refresh = useCallback(async () => {
    if (!library || !account) {
      setStatus('idle')
      return
    }
    if (chainId && chainId !== ETHERNOVA_CHAIN_ID) {
      setStatus('wrong_network')
      setBalance(undefined)
      setError(null)
      return
    }
    setLoading(true)
    try {
      const attempts = 4
      let delay = 500
      for (let i = 0; i < attempts; i++) {
        try {
          const value = await library.getBalance(account)
          setBalance(CurrencyAmount.ether(JSBI.BigInt(value.toString())))
          setError(null)
          setStatus('ok')
          break
        } catch (innerErr) {
          if (i === attempts - 1) {
            throw innerErr
          }
          await sleep(delay)
          delay *= 2
        }
      }
    } catch {
      try {
        const result = await rpcCallWithFallback('eth_getBalance', [account, 'latest'])
        const value = BigNumber.from(result as string)
        setBalance(CurrencyAmount.ether(JSBI.BigInt(value.toString())))
        setError(null)
        setStatus('ok')
      } catch {
        setError('Balance unavailable (RPC)')
        setStatus('unavailable')
      }
    } finally {
      setLoading(false)
    }
  }, [account, chainId, library])

  useEffect(() => {
    refresh().catch(() => undefined)
  }, [refresh])

  return { balance, loading, error, status, refresh }
}

export function useTokenBalanceDirect(account?: string, token?: Token): BalanceState {
  const { library, chainId } = useActiveWeb3React()
  const [balance, setBalance] = useState<TokenAmount | undefined>(undefined)
  const [status, setStatus] = useState<BalanceState['status']>('idle')
  const [error, setError] = useState<string | null>(null)
  const [nonce, setNonce] = useState(0)
  const requestIdRef = useRef(0)

  const refresh = useCallback(() => {
    setNonce(value => value + 1)
  }, [])

  useEffect(() => {
    if (!account || !token) {
      setStatus('idle')
      setBalance(undefined)
      setError(null)
      return
    }
    if (chainId && chainId !== ETHERNOVA_CHAIN_ID) {
      setStatus('wrong_network')
      setBalance(undefined)
      setError(null)
      return
    }
    const cacheKey = `${chainId ?? ETHERNOVA_CHAIN_ID}:${token.address.toLowerCase()}:${account.toLowerCase()}`
    const cached = tokenBalanceCache.get(cacheKey)
    if (cached && Date.now() - cached.ts < TOKEN_BALANCE_CACHE_MS) {
      setBalance(cached.value)
      setStatus('ok')
      setError(null)
      return
    }

    let cancelled = false
    requestIdRef.current += 1
    const requestId = requestIdRef.current
    setStatus('loading')
    setError(null)

    const run = async () => {
      try {
        const data = ERC20_INTERFACE.encodeFunctionData('balanceOf', [account])
        const result = await callReadWithFallback(
          { to: token.address, data },
          { provider: library as any, expectedChainId: ETHERNOVA_CHAIN_ID, debugTag: 'token.balanceOf.direct' }
        )
        const value = JSBI.BigInt(BigNumber.from(result as string).toString())
        const amount = new TokenAmount(token, value)
        if (cancelled || requestId !== requestIdRef.current) return
        tokenBalanceCache.set(cacheKey, { value: amount, ts: Date.now() })
        setBalance(amount)
        setStatus('ok')
        setError(null)
      } catch (err) {
        if (cancelled) return
        setStatus('unavailable')
        setError(err instanceof Error ? err.message : 'RPC error')
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [account, token, chainId, library, nonce])

  return { balance, status, error, refresh }
}

export function useCurrencyBalanceState(account?: string, currency?: Currency): BalanceState {
  const native = useNativeBalance(account)
  const token = currency instanceof Token ? currency : undefined
  const tokenState = useTokenBalanceDirect(account, token)
  if (!currency) {
    return { balance: undefined, status: 'idle', error: null, refresh: () => undefined }
  }
  if (currency === ETHER) {
    return {
      balance: native.balance,
      status: native.status === 'idle' && native.loading ? 'loading' : native.status,
      error: native.error,
      refresh: native.refresh
    }
  }
  return tokenState
}

/**
 * Returns a map of the given addresses to their eventually consistent ETH balances.
 */
export function useETHBalances(
  uncheckedAddresses?: (string | undefined)[]
): { [address: string]: CurrencyAmount | undefined } {
  const { library } = useActiveWeb3React()
  const [balances, setBalances] = useState<{ [address: string]: CurrencyAmount }>({})

  const addresses: string[] = useMemo(
    () =>
      uncheckedAddresses
        ? uncheckedAddresses
            .map(isAddress)
            .filter((a): a is string => a !== false)
            .sort()
        : [],
    [uncheckedAddresses]
  )

  useEffect(() => {
    if (!library || addresses.length === 0) return
    let stale = false
    Promise.all(addresses.map(address => library.getBalance(address)))
      .then(values => {
        if (stale) return
        setBalances(prev => {
          const next = { ...prev }
          values.forEach((value, i) => {
            if (value) {
              next[addresses[i]] = CurrencyAmount.ether(JSBI.BigInt(value.toString()))
            }
          })
          return next
        })
      })
      .catch(() => undefined)
    return () => {
      stale = true
    }
  }, [addresses, library])

  return balances
}

/**
 * Returns a map of token addresses to their eventually consistent token balances for a single account.
 */
export function useTokenBalancesWithLoadingIndicator(
  address?: string,
  tokens?: (Token | undefined)[]
): [{ [tokenAddress: string]: TokenAmount | undefined }, boolean] {
  const { chainId, library } = useActiveWeb3React()
  const validatedTokens: Token[] = useMemo(
    () => tokens?.filter((t?: Token): t is Token => isAddress(t?.address) !== false) ?? [],
    [tokens]
  )

  const validatedTokenAddresses = useMemo(() => validatedTokens.map(vt => vt.address), [validatedTokens])

  const balances = useMultipleContractSingleData(validatedTokenAddresses, ERC20_INTERFACE, 'balanceOf', [address])
  const [fallbackBalances, setFallbackBalances] = useState<{ [tokenAddress: string]: TokenAmount }>({})

  useEffect(() => {
    if (!address || !chainId || chainId !== ETHERNOVA_CHAIN_ID) return
    if (!validatedTokens.length) return
    let stale = false
    const candidates = validatedTokens.filter((token, index) => {
      const callState = balances[index]
      return callState?.error || (!callState?.loading && !callState?.result)
    })
    if (!candidates.length) return

    const fetchFallback = async () => {
      for (const token of candidates) {
        try {
          const data = ERC20_INTERFACE.encodeFunctionData('balanceOf', [address])
          const result = await callReadWithFallback(
            { to: token.address, data },
            { provider: library as any, expectedChainId: 77777, debugTag: 'token.balanceOf' }
          )
          const amount = JSBI.BigInt(BigNumber.from(result as string).toString())
          if (!stale) {
            setFallbackBalances(prev => ({
              ...prev,
              [token.address]: new TokenAmount(token, amount)
            }))
          }
        } catch {
          // ignore fallback errors
        }
      }
    }

    fetchFallback().catch(() => undefined)
    return () => {
      stale = true
    }
  }, [address, balances, chainId, validatedTokens])

  const anyLoading: boolean = useMemo(() => balances.some(callState => callState.loading), [balances])

  return [
    useMemo(
      () =>
        address && validatedTokens.length > 0
          ? validatedTokens.reduce<{ [tokenAddress: string]: TokenAmount | undefined }>((memo, token, i) => {
              const value = balances?.[i]?.result?.[0]
              const amount = value ? JSBI.BigInt(value.toString()) : undefined
              if (amount) {
                memo[token.address] = new TokenAmount(token, amount)
              } else if (fallbackBalances[token.address]) {
                memo[token.address] = fallbackBalances[token.address]
              }
              return memo
            }, {})
          : {},
      [address, validatedTokens, balances, fallbackBalances]
    ),
    anyLoading
  ]
}

export function useTokenBalances(
  address?: string,
  tokens?: (Token | undefined)[]
): { [tokenAddress: string]: TokenAmount | undefined } {
  return useTokenBalancesWithLoadingIndicator(address, tokens)[0]
}

// get the balance for a single token/account combo
export function useTokenBalance(account?: string, token?: Token): TokenAmount | undefined {
  const tokenBalances = useTokenBalances(account, [token])
  if (!token) return undefined
  return tokenBalances[token.address]
}

export function useCurrencyBalances(
  account?: string,
  currencies?: (Currency | undefined)[]
): (CurrencyAmount | undefined)[] {
  const { balance: nativeBalance } = useNativeBalance(account)
  const tokens = useMemo(() => currencies?.filter((currency): currency is Token => currency instanceof Token) ?? [], [
    currencies
  ])

  const tokenBalances = useTokenBalances(account, tokens)

  return useMemo(
    () =>
      currencies?.map(currency => {
        if (!account || !currency) return undefined
        if (currency instanceof Token) return tokenBalances[currency.address]
        if (currency === ETHER) return nativeBalance
        return undefined
      }) ?? [],
    [account, currencies, nativeBalance, tokenBalances]
  )
}

export function useCurrencyBalance(account?: string, currency?: Currency): CurrencyAmount | undefined {
  return useCurrencyBalances(account, [currency])[0]
}

// mimics useAllBalances
export function useAllTokenBalances(): { [tokenAddress: string]: TokenAmount | undefined } {
  const { account } = useActiveWeb3React()
  const allTokens = useAllTokens()
  const allTokensArray = useMemo(() => Object.values(allTokens ?? {}), [allTokens])
  const balances = useTokenBalances(account ?? undefined, allTokensArray)
  return balances ?? {}
}
