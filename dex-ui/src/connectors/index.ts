import { Web3Provider } from '@ethersproject/providers'
import { InjectedConnector } from '@web3-react/injected-connector'
import { WalletConnectConnector } from '@web3-react/walletconnect-connector'
import { NetworkConnector } from './NetworkConnector'

const DEFAULT_RPC_PRIMARY = 'https://rpc.ethnova.net'
const NETWORK_URL = process.env.REACT_APP_NETWORK_URL ?? DEFAULT_RPC_PRIMARY

const parseChainId = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const trimmed = value.trim()
  const parsed = trimmed.startsWith('0x') ? parseInt(trimmed, 16) : parseInt(trimmed, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const NETWORK_CHAIN_ID: number = parseChainId(process.env.REACT_APP_CHAIN_ID, 121525)
export const NETWORK_DEFAULT_CHAIN_ID: number = 121525
export const INJECTED_SUPPORTED_CHAIN_IDS = [NETWORK_CHAIN_ID]
export const WALLETCONNECT_SUPPORTED_CHAIN_IDS = [NETWORK_CHAIN_ID]
export const WALLETCONNECT_RPC_URLS: { [chainId: number]: string } = {
  [NETWORK_CHAIN_ID]: NETWORK_URL
}

if (typeof NETWORK_URL === 'undefined') {
  throw new Error(`REACT_APP_NETWORK_URL must be a defined environment variable`)
}

export const network = new NetworkConnector({
  urls: { [NETWORK_DEFAULT_CHAIN_ID]: NETWORK_URL },
  defaultChainId: NETWORK_DEFAULT_CHAIN_ID
})

let networkLibrary: Web3Provider | undefined
export function getNetworkLibrary(): Web3Provider {
  return (networkLibrary = networkLibrary ?? new Web3Provider(network.provider as any))
}

// allow injected to connect on any chain; UI handles wrong-network gating
export const injected = new InjectedConnector({})

// Ethernova-only (optionally supports mainnet for connection UX)
export const walletconnect = new WalletConnectConnector({
  rpc: WALLETCONNECT_RPC_URLS,
  bridge: 'https://bridge.walletconnect.org',
  qrcode: true,
  pollingInterval: 20000
})
