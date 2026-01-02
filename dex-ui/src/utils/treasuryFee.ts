import { Currency, CurrencyAmount, ETHER, JSBI, Token, TokenAmount } from '@im33357/uniswap-v2-sdk'
import { TREASURY_FEE_BPS } from '../constants'
import { WNOVA_ADDRESS } from '../constants/addresses'

const BPS = JSBI.BigInt(10000)
const FEE_BPS = JSBI.BigInt(TREASURY_FEE_BPS)

const normalize = (value?: string) => (value ?? '').toLowerCase()

const toAmount = (amount: CurrencyAmount, raw: JSBI): CurrencyAmount =>
  amount instanceof TokenAmount ? new TokenAmount(amount.token, raw) : CurrencyAmount.ether(raw)

const ceilDiv = (numerator: JSBI, denominator: JSBI): JSBI => {
  const div = JSBI.divide(numerator, denominator)
  return JSBI.equal(JSBI.multiply(div, denominator), numerator) ? div : JSBI.add(div, JSBI.BigInt(1))
}

export function isWnovaCurrency(currency?: Currency): boolean {
  if (!currency) return false
  if (currency === ETHER) return true
  if (currency instanceof Token) {
    return normalize(currency.address) === normalize(WNOVA_ADDRESS)
  }
  return false
}

export function treasuryFeeFromGross(amount: CurrencyAmount): CurrencyAmount {
  if (JSBI.equal(amount.raw, JSBI.BigInt(0))) return toAmount(amount, JSBI.BigInt(0))
  const fee = JSBI.divide(JSBI.multiply(amount.raw, FEE_BPS), BPS)
  return toAmount(amount, fee)
}

export function applyTreasuryFee(amount: CurrencyAmount): CurrencyAmount {
  if (JSBI.equal(amount.raw, JSBI.BigInt(0))) return toAmount(amount, JSBI.BigInt(0))
  const fee = JSBI.divide(JSBI.multiply(amount.raw, FEE_BPS), BPS)
  const net = JSBI.subtract(amount.raw, fee)
  return toAmount(amount, net)
}

export function grossUpForTreasury(amount: CurrencyAmount): CurrencyAmount {
  if (JSBI.equal(amount.raw, JSBI.BigInt(0))) return toAmount(amount, JSBI.BigInt(0))
  const numerator = JSBI.multiply(amount.raw, BPS)
  const denominator = JSBI.subtract(BPS, FEE_BPS)
  const gross = ceilDiv(numerator, denominator)
  return toAmount(amount, gross)
}
