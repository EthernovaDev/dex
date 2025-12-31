import { Token } from '@im33357/uniswap-v2-sdk'

export function safeSortTokens(tokenA?: Token | null, tokenB?: Token | null): [Token, Token] | null {
  if (!tokenA || !tokenB) return null
  if (tokenA.chainId !== tokenB.chainId) return null
  if (tokenA.address.toLowerCase() === tokenB.address.toLowerCase()) return null
  try {
    return tokenA.sortsBefore(tokenB) ? [tokenA, tokenB] : [tokenB, tokenA]
  } catch {
    return null
  }
}
