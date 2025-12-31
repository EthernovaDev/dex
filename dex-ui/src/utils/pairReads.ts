import { Interface } from '@ethersproject/abi'
import { BigNumber } from '@ethersproject/bignumber'
import { AddressZero } from '@ethersproject/constants'
import { Token } from '@im33357/uniswap-v2-sdk'
import { JsonRpcProvider } from '@ethersproject/providers'
import { callReadWithFallback } from './rpcSafe'
import { normalizePairReserves } from './pairReserves'

type RpcOptions = {
  timeoutMs?: number
  retries?: number
  backoffMs?: number
  provider?: JsonRpcProvider
  expectedChainId?: number
}

const FACTORY_INTERFACE = new Interface(['function getPair(address,address) view returns (address)'])
const PAIR_INTERFACE = new Interface([
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32)',
  'function totalSupply() view returns (uint256)'
])

export type PairOnchainState = {
  pairAddress: string
  token0: string
  token1: string
  reserve0: BigNumber
  reserve1: BigNumber
  totalSupply?: BigNumber
}

export async function getPairAddress(
  factoryAddress: string,
  tokenA: Token,
  tokenB: Token,
  options: RpcOptions = {}
): Promise<string | null> {
  const data = FACTORY_INTERFACE.encodeFunctionData('getPair', [tokenA.address, tokenB.address])
  const result = (await callReadWithFallback(
    { to: factoryAddress, data },
    {
      timeoutMs: options.timeoutMs,
      retries: options.retries,
      backoffMs: options.backoffMs,
      debugTag: 'getPair',
      provider: options.provider,
      expectedChainId: options.expectedChainId
    }
  )) as string
  const [pairAddress] = FACTORY_INTERFACE.decodeFunctionResult('getPair', result) as [string]
  if (!pairAddress || pairAddress === AddressZero) return null
  return pairAddress
}

export async function readPairState(pairAddress: string, options: RpcOptions = {}): Promise<PairOnchainState> {
  const token0Data = PAIR_INTERFACE.encodeFunctionData('token0', [])
  const token1Data = PAIR_INTERFACE.encodeFunctionData('token1', [])
  const reservesData = PAIR_INTERFACE.encodeFunctionData('getReserves', [])
  const totalSupplyData = PAIR_INTERFACE.encodeFunctionData('totalSupply', [])

  const [token0Raw, token1Raw, reservesRaw, totalSupplyRaw] = await Promise.all([
    callReadWithFallback(
      { to: pairAddress, data: token0Data },
      { ...options, debugTag: 'token0', provider: options.provider, expectedChainId: options.expectedChainId }
    ),
    callReadWithFallback(
      { to: pairAddress, data: token1Data },
      { ...options, debugTag: 'token1', provider: options.provider, expectedChainId: options.expectedChainId }
    ),
    callReadWithFallback(
      { to: pairAddress, data: reservesData },
      { ...options, debugTag: 'getReserves', provider: options.provider, expectedChainId: options.expectedChainId }
    ),
    callReadWithFallback(
      { to: pairAddress, data: totalSupplyData },
      { ...options, debugTag: 'totalSupply', provider: options.provider, expectedChainId: options.expectedChainId }
    )
  ])

  const [token0] = PAIR_INTERFACE.decodeFunctionResult('token0', token0Raw as string) as [string]
  const [token1] = PAIR_INTERFACE.decodeFunctionResult('token1', token1Raw as string) as [string]
  const [reserve0, reserve1] = PAIR_INTERFACE.decodeFunctionResult('getReserves', reservesRaw as string) as [
    BigNumber,
    BigNumber
  ]
  const [totalSupply] = PAIR_INTERFACE.decodeFunctionResult('totalSupply', totalSupplyRaw as string) as [BigNumber]

  return { pairAddress, token0, token1, reserve0, reserve1, totalSupply }
}

export function normalizeReservesForTokens(
  tokenA: Token,
  tokenB: Token,
  state: PairOnchainState
): { reserveForA: BigNumber; reserveForB: BigNumber } | null {
  const normalized = normalizePairReserves(tokenA, tokenB, state.reserve0, state.reserve1, state.token0, state.token1)
  if (!normalized) return null
  return { reserveForA: normalized.reserveForA, reserveForB: normalized.reserveForB }
}
