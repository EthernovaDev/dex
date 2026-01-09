export const ETHERNOVA_CHAIN_ID = 121525
export const ETHERNOVA_CHAIN_ID_HEX = '0x1dab5'

const DEFAULT_RPC_URL = process.env.REACT_APP_NETWORK_URL ?? 'https://rpc.ethnova.net'
const EXPLORER_URL = process.env.REACT_APP_EXPLORER_URL
const EXPLORER_URLS = EXPLORER_URL ? [EXPLORER_URL.replace(/\/+$/, '')] : undefined

export const ETHERNOVA_PARAMS = {
  chainId: ETHERNOVA_CHAIN_ID_HEX,
  chainName: 'Ethernova',
  rpcUrls: [DEFAULT_RPC_URL],
  nativeCurrency: { name: 'NOVA', symbol: 'NOVA', decimals: 18 },
  ...(EXPLORER_URLS ? { blockExplorerUrls: EXPLORER_URLS } : {})
}

export async function ensureEthernovaConnected(): Promise<boolean> {
  const ethereum = (window as any)?.ethereum
  if (!ethereum?.request) {
    throw new Error('No injected wallet found')
  }

  const currentChainId = await ethereum.request({ method: 'eth_chainId' })
  if (currentChainId === ETHERNOVA_CHAIN_ID_HEX) return true

  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ETHERNOVA_CHAIN_ID_HEX }]
    })
    return true
  } catch (error) {
    if ((error as any)?.code === 4902) {
      await ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [ETHERNOVA_PARAMS]
      })
      await ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ETHERNOVA_CHAIN_ID_HEX }]
      })
      return true
    }
    throw error
  }
}
