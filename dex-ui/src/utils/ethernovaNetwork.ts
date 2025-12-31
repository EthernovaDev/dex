import { ETHERNOVA_PARAMS, ETHERNOVA_CHAIN_ID, ETHERNOVA_CHAIN_ID_HEX, ensureEthernovaConnected } from './ethernova'

export { ETHERNOVA_PARAMS, ETHERNOVA_CHAIN_ID, ETHERNOVA_CHAIN_ID_HEX }

export async function switchToEthernova(provider?: any): Promise<void> {
  if (!provider) {
    await ensureEthernovaConnected()
    return
  }
  if (!provider?.request) {
    throw new Error('No injected wallet found')
  }
  const currentChainId = await provider.request({ method: 'eth_chainId' })
  if (currentChainId === ETHERNOVA_CHAIN_ID_HEX) return
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ETHERNOVA_CHAIN_ID_HEX }]
    })
  } catch (error) {
    if ((error as any)?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [ETHERNOVA_PARAMS]
      })
      await provider.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: ETHERNOVA_CHAIN_ID_HEX }]
      })
      return
    }
    throw error
  }
}
