import {
  CHAIN_ID,
  EXPLORER_URL,
  FACTORY_ADDRESS,
  LIQUIDITY_ROUTER_ADDRESS,
  MULTICALL_ADDRESS,
  ROUTER_ADDRESS,
  SWAP_ROUTER_ADDRESS,
  TONY_ADDRESS,
  WNOVA_ADDRESS
} from './addresses'

const DEFAULT_RPC_URL = 'https://rpc.ethnova.net'
const DEFAULT_EXPLORER_URL = 'https://explorer.ethnova.net'

export const ETHERNOVA = {
  chainId: CHAIN_ID,
  name: 'Ethernova',
  rpcUrl: process.env.REACT_APP_NETWORK_URL || DEFAULT_RPC_URL,
  explorerUrl: (EXPLORER_URL || DEFAULT_EXPLORER_URL).replace(/\/+$/, ''),
  nativeSymbol: 'NOVA',
  nativeName: 'Nova',
  wrappedSymbol: 'WNOVA',
  wrappedName: 'Wrapped NOVA',
  addresses: {
    factory: FACTORY_ADDRESS,
    router: ROUTER_ADDRESS,
    swapRouter: SWAP_ROUTER_ADDRESS,
    liquidityRouter: LIQUIDITY_ROUTER_ADDRESS,
    multicall2: MULTICALL_ADDRESS,
    wnova: WNOVA_ADDRESS,
    tony: TONY_ADDRESS
  }
}

export const NATIVE_SYMBOL = ETHERNOVA.nativeSymbol
export const NATIVE_NAME = ETHERNOVA.nativeName
export const WRAPPED_NATIVE_SYMBOL = ETHERNOVA.wrappedSymbol
export const WRAPPED_NATIVE_NAME = ETHERNOVA.wrappedName
export const CHAIN_ID_HEX = `0x${ETHERNOVA.chainId.toString(16)}`

export const ETHERNOVA_CHAIN_PARAMS = {
  chainId: CHAIN_ID_HEX,
  chainName: ETHERNOVA.name,
  rpcUrls: [ETHERNOVA.rpcUrl],
  nativeCurrency: {
    name: ETHERNOVA.nativeName,
    symbol: ETHERNOVA.nativeSymbol,
    decimals: 18
  },
  blockExplorerUrls: [ETHERNOVA.explorerUrl]
}
