import { BigNumber } from '@ethersproject/bignumber'
import { Token } from '@im33357/uniswap-v2-sdk'
import { safeSortTokens } from './safeSortTokens'

export type NormalizedReserves = {
  token0: Token
  token1: Token
  reserve0: BigNumber
  reserve1: BigNumber
  reserveForA: BigNumber
  reserveForB: BigNumber
}

function normalizeTokenAddress(address?: string): string | null {
  if (!address) return null
  return address.toLowerCase()
}

export function normalizePairReserves(
  tokenA: Token,
  tokenB: Token,
  reserve0: BigNumber,
  reserve1: BigNumber,
  token0Addr?: string,
  token1Addr?: string
): NormalizedReserves | null {
  try {
    if (tokenA.equals(tokenB)) return null
    if (tokenA.chainId !== tokenB.chainId) return null

    const addrA = tokenA.address.toLowerCase()
    const addrB = tokenB.address.toLowerCase()
    const token0Normalized = normalizeTokenAddress(token0Addr)
    const token1Normalized = normalizeTokenAddress(token1Addr)

    let token0: Token
    let token1: Token

    if (token0Normalized && token1Normalized) {
      if (token0Normalized === addrA && token1Normalized === addrB) {
        token0 = tokenA
        token1 = tokenB
      } else if (token0Normalized === addrB && token1Normalized === addrA) {
        token0 = tokenB
        token1 = tokenA
      } else {
        return null
      }
    } else {
      const sorted = safeSortTokens(tokenA, tokenB)
      if (!sorted) return null
      token0 = sorted[0]
      token1 = sorted[1]
    }

    const reserveForA = tokenA.equals(token0) ? reserve0 : reserve1
    const reserveForB = tokenB.equals(token0) ? reserve0 : reserve1

    return {
      token0,
      token1,
      reserve0,
      reserve1,
      reserveForA,
      reserveForB
    }
  } catch {
    return null
  }
}
