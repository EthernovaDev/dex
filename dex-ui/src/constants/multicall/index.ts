import MULTICALL_ABI from './abi.json'
import { CHAIN_ID, MULTICALL_ADDRESS } from '../addresses'

const MULTICALL_NETWORKS: { [chainId: number]: string } = {
  [CHAIN_ID]: MULTICALL_ADDRESS
}

export { MULTICALL_ABI, MULTICALL_NETWORKS }
