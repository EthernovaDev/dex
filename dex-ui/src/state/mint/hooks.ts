import { Currency, CurrencyAmount, ETHER, JSBI, Pair, Percent, Price, Token, TokenAmount } from '@im33357/uniswap-v2-sdk'
import { useCallback, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { PairState, usePair } from '../../data/Reserves'
import { useTotalSupply } from '../../data/TotalSupply'

import { useActiveWeb3React } from '../../hooks'
import { usePairLookup } from '../../hooks/usePairLookup'
import { wrappedCurrency, wrappedCurrencyAmount } from '../../utils/wrappedCurrency'
import { normalizePairReserves } from '../../utils/pairReserves'
import { AppDispatch, AppState } from '../index'
import { tryParseAmount } from '../swap/hooks'
import { useCurrencyBalances } from '../wallet/hooks'
import { Field, typeInput } from './actions'

const ZERO = JSBI.BigInt(0)

export function useMintState(): AppState['mint'] {
  return useSelector<AppState, AppState['mint']>(state => state.mint)
}

export function useDerivedMintInfo(
  currencyA: Currency | undefined,
  currencyB: Currency | undefined
): {
  dependentField: Field
  currencies: { [field in Field]?: Currency }
  pair?: Pair | null
  pairState: PairState
  currencyBalances: { [field in Field]?: CurrencyAmount }
  parsedAmounts: { [field in Field]?: CurrencyAmount }
  price?: Price
  noLiquidity?: boolean
  liquidityMinted?: TokenAmount
  poolTokenPercentage?: Percent
  error?: string
} {
  const { account, chainId } = useActiveWeb3React()

  const { independentField, typedValue, otherTypedValue } = useMintState()

  const dependentField = independentField === Field.CURRENCY_A ? Field.CURRENCY_B : Field.CURRENCY_A

  // tokens
  const currencies: { [field in Field]?: Currency } = useMemo(
    () => ({
      [Field.CURRENCY_A]: currencyA ?? undefined,
      [Field.CURRENCY_B]: currencyB ?? undefined
    }),
    [currencyA, currencyB]
  )

  // pair
  const [pairState, pair] = usePair(currencies[Field.CURRENCY_A], currencies[Field.CURRENCY_B])
  const pairLookup = usePairLookup(currencyA ?? undefined, currencyB ?? undefined)
  const wrappedA = wrappedCurrency(currencyA, chainId)
  const wrappedB = wrappedCurrency(currencyB, chainId)
  const pairValid =
    Boolean(pair && wrappedA && wrappedB && pair.involvesToken(wrappedA) && pair.involvesToken(wrappedB)) || false
  const fallbackPair = useMemo(() => {
    if (pairValid || !wrappedA || !wrappedB) return null
    if (pairLookup.status !== 'exists' || !pairLookup.reserves) return null
    const normalized = normalizePairReserves(
      wrappedA,
      wrappedB,
      pairLookup.reserves.reserve0,
      pairLookup.reserves.reserve1,
      pairLookup.token0,
      pairLookup.token1
    )
    if (!normalized) return null
    try {
      return new Pair(
        new TokenAmount(normalized.token0, normalized.reserve0.toString()),
        new TokenAmount(normalized.token1, normalized.reserve1.toString())
      )
    } catch {
      return null
    }
  }, [
    pairValid,
    wrappedA,
    wrappedB,
    pairLookup.status,
    pairLookup.reserves,
    pairLookup.token0,
    pairLookup.token1
  ])

  const effectivePair = pairValid ? pair : fallbackPair
  const effectivePairState = pairValid
    ? pairState
    : pairLookup.status === 'exists'
    ? PairState.EXISTS
    : pairLookup.status === 'not_exists'
    ? PairState.NOT_EXISTS
    : pairState

  const liquidityToken = useMemo(() => {
    if (pair?.liquidityToken) return pair.liquidityToken
    if (pairLookup.pairAddress && chainId) {
      return new Token(chainId, pairLookup.pairAddress, 18, 'LP', 'NovaDEX LP')
    }
    return undefined
  }, [pair, pairLookup.pairAddress, chainId])

  const totalSupply = useTotalSupply(liquidityToken)

  const reservesEmpty =
    pairLookup.reserves &&
    JSBI.equal(JSBI.BigInt(pairLookup.reserves.reserve0.toString()), ZERO) &&
    JSBI.equal(JSBI.BigInt(pairLookup.reserves.reserve1.toString()), ZERO)

  const noLiquidity: boolean =
    effectivePairState === PairState.NOT_EXISTS || Boolean(totalSupply && JSBI.equal(totalSupply.raw, ZERO)) || Boolean(reservesEmpty)

  // balances
  const balances = useCurrencyBalances(account ?? undefined, [
    currencies[Field.CURRENCY_A],
    currencies[Field.CURRENCY_B]
  ])
  const currencyBalances: { [field in Field]?: CurrencyAmount } = {
    [Field.CURRENCY_A]: balances[0],
    [Field.CURRENCY_B]: balances[1]
  }

  // amounts
  const independentAmount: CurrencyAmount | undefined = tryParseAmount(typedValue, currencies[independentField])
  const dependentAmount: CurrencyAmount | undefined = useMemo(() => {
    const manualMode = noLiquidity || !effectivePair
    if (manualMode) {
      if (otherTypedValue && currencies[dependentField]) {
        return tryParseAmount(otherTypedValue, currencies[dependentField])
      }
      return undefined
    }
    if (independentAmount) {
      // we wrap the currencies just to get the price in terms of the other token
      const wrappedIndependentAmount = wrappedCurrencyAmount(independentAmount, chainId)
      const [tokenA, tokenB] = [wrappedA, wrappedB]
      if (tokenA && tokenB && wrappedIndependentAmount && effectivePair) {
        const dependentCurrency = dependentField === Field.CURRENCY_B ? currencyB : currencyA
        const dependentTokenAmount =
          dependentField === Field.CURRENCY_B
            ? effectivePair.priceOf(tokenA).quote(wrappedIndependentAmount)
            : effectivePair.priceOf(tokenB).quote(wrappedIndependentAmount)
        return dependentCurrency === ETHER ? CurrencyAmount.ether(dependentTokenAmount.raw) : dependentTokenAmount
      }
    }
    return undefined
  }, [
    noLiquidity,
    otherTypedValue,
    currencies,
    dependentField,
    independentAmount,
    currencyA,
    currencyB,
    chainId,
    wrappedA,
    wrappedB,
    effectivePair
  ])
  const parsedAmounts: { [field in Field]: CurrencyAmount | undefined } = {
    [Field.CURRENCY_A]: independentField === Field.CURRENCY_A ? independentAmount : dependentAmount,
    [Field.CURRENCY_B]: independentField === Field.CURRENCY_A ? dependentAmount : independentAmount
  }

  const price = useMemo(() => {
    if (noLiquidity) {
      const { [Field.CURRENCY_A]: currencyAAmount, [Field.CURRENCY_B]: currencyBAmount } = parsedAmounts
      if (currencyAAmount && currencyBAmount) {
        return new Price(currencyAAmount.currency, currencyBAmount.currency, currencyAAmount.raw, currencyBAmount.raw)
      }
      return undefined
    } else {
      return effectivePair && wrappedA ? effectivePair.priceOf(wrappedA) : undefined
    }
  }, [noLiquidity, parsedAmounts, effectivePair, wrappedA])

  // liquidity minted
  const liquidityMinted = useMemo(() => {
    const { [Field.CURRENCY_A]: currencyAAmount, [Field.CURRENCY_B]: currencyBAmount } = parsedAmounts
    const [tokenAmountA, tokenAmountB] = [
      wrappedCurrencyAmount(currencyAAmount, chainId),
      wrappedCurrencyAmount(currencyBAmount, chainId)
    ]
    if (effectivePair && totalSupply && tokenAmountA && tokenAmountB) {
      return effectivePair.getLiquidityMinted(totalSupply, tokenAmountA, tokenAmountB)
    } else {
      return undefined
    }
  }, [parsedAmounts, chainId, effectivePair, totalSupply])

  const poolTokenPercentage = useMemo(() => {
    if (liquidityMinted && totalSupply) {
      return new Percent(liquidityMinted.raw, totalSupply.add(liquidityMinted).raw)
    } else {
      return undefined
    }
  }, [liquidityMinted, totalSupply])

  let error: string | undefined
  if (!account) {
    error = 'Connect Wallet'
  }

  if (pairState === PairState.INVALID) {
    error = error ?? 'Invalid pair'
  }

  if (!parsedAmounts[Field.CURRENCY_A] || !parsedAmounts[Field.CURRENCY_B]) {
    error = error ?? 'Enter an amount'
  }

  const { [Field.CURRENCY_A]: currencyAAmount, [Field.CURRENCY_B]: currencyBAmount } = parsedAmounts

  if (currencyAAmount && currencyBalances?.[Field.CURRENCY_A]?.lessThan(currencyAAmount)) {
    error = 'Insufficient ' + currencies[Field.CURRENCY_A]?.symbol + ' balance'
  }

  if (currencyBAmount && currencyBalances?.[Field.CURRENCY_B]?.lessThan(currencyBAmount)) {
    error = 'Insufficient ' + currencies[Field.CURRENCY_B]?.symbol + ' balance'
  }

  return {
    dependentField,
    currencies,
    pair: effectivePair,
    pairState: effectivePairState,
    currencyBalances,
    parsedAmounts,
    price,
    noLiquidity,
    liquidityMinted,
    poolTokenPercentage,
    error
  }
}

export function useMintActionHandlers(
  noLiquidity: boolean | undefined
): {
  onFieldAInput: (typedValue: string) => void
  onFieldBInput: (typedValue: string) => void
} {
  const dispatch = useDispatch<AppDispatch>()

  const onFieldAInput = useCallback(
    (typedValue: string) => {
      dispatch(typeInput({ field: Field.CURRENCY_A, typedValue, noLiquidity: noLiquidity === true }))
    },
    [dispatch, noLiquidity]
  )
  const onFieldBInput = useCallback(
    (typedValue: string) => {
      dispatch(typeInput({ field: Field.CURRENCY_B, typedValue, noLiquidity: noLiquidity === true }))
    },
    [dispatch, noLiquidity]
  )

  return {
    onFieldAInput,
    onFieldBInput
  }
}
