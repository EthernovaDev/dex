import { Token } from '@im33357/uniswap-v2-sdk'
import { CHAIN_ID, WNOVA_ADDRESS } from './addresses'
import { WRAPPED_NATIVE_NAME, WRAPPED_NATIVE_SYMBOL } from './ethernova'

export const WRAPPED_NATIVE: { [chainId: number]: Token } = {
  [CHAIN_ID]: new Token(CHAIN_ID, WNOVA_ADDRESS, 18, WRAPPED_NATIVE_SYMBOL, WRAPPED_NATIVE_NAME)
}
