import { Currency, CurrencyAmount, ETHER, JSBI, Token, TokenAmount } from '@im33357/uniswap-v2-sdk'

const ZERO = JSBI.BigInt(0)

export function quoteExact(amountRaw: JSBI, reserveIn: JSBI, reserveOut: JSBI): JSBI {
  if (JSBI.equal(reserveIn, ZERO) || JSBI.equal(reserveOut, ZERO)) return ZERO
  return JSBI.divide(JSBI.multiply(amountRaw, reserveOut), reserveIn)
}

function toCurrencyAmount(currency: Currency | undefined, raw: JSBI): CurrencyAmount | undefined {
  if (!currency) return undefined
  if (currency === ETHER) return CurrencyAmount.ether(raw)
  if (currency instanceof Token) return new TokenAmount(currency, raw)
  return undefined
}

export function toInputString(amount?: CurrencyAmount, maxDecimals = 18): string {
  if (!amount) return ''
  const exact = amount.toExact()
  if (!exact || exact === '0') return '0'
  if (/[eE]/.test(exact)) {
    return amount.toSignificant(18)
  }
  const parts = exact.split('.')
  if (parts.length === 1) return exact
  const integer = parts[0]
  const decimals = parts[1].replace(/0+$/, '').slice(0, maxDecimals)
  return decimals.length ? `${integer}.${decimals}` : integer
}

export function computeMaxPairAmounts(params: {
  currencyA?: Currency
  currencyB?: Currency
  balanceA?: CurrencyAmount
  balanceB?: CurrencyAmount
  reserveA?: JSBI
  reserveB?: JSBI
  whichMax: 'A' | 'B'
}): { amountA?: CurrencyAmount; amountB?: CurrencyAmount } {
  const { currencyA, currencyB, balanceA, balanceB, reserveA, reserveB, whichMax } = params
  if (!currencyA || !currencyB || !balanceA || !balanceB) {
    return { amountA: balanceA, amountB: balanceB }
  }

  if (!reserveA || !reserveB || JSBI.equal(reserveA, ZERO) || JSBI.equal(reserveB, ZERO)) {
    return {
      amountA: whichMax === 'A' ? balanceA : undefined,
      amountB: whichMax === 'B' ? balanceB : undefined
    }
  }

  const balanceARaw = balanceA.quotient
  const balanceBRaw = balanceB.quotient

  if (whichMax === 'A') {
    let amountARaw = balanceARaw
    let amountBRaw = quoteExact(amountARaw, reserveA, reserveB)
    if (JSBI.greaterThan(amountBRaw, balanceBRaw)) {
      amountBRaw = balanceBRaw
      amountARaw = quoteExact(amountBRaw, reserveB, reserveA)
    }
    return {
      amountA: toCurrencyAmount(currencyA, amountARaw),
      amountB: toCurrencyAmount(currencyB, amountBRaw)
    }
  }

  let amountBRaw = balanceBRaw
  let amountARaw = quoteExact(amountBRaw, reserveB, reserveA)
  if (JSBI.greaterThan(amountARaw, balanceARaw)) {
    amountARaw = balanceARaw
    amountBRaw = quoteExact(amountARaw, reserveA, reserveB)
  }
  return {
    amountA: toCurrencyAmount(currencyA, amountARaw),
    amountB: toCurrencyAmount(currencyB, amountBRaw)
  }
}
