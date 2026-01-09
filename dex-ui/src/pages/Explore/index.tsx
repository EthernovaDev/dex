import React, { useCallback, useMemo, useState, useEffect } from 'react'
import { Text } from 'rebass'
import { Interface } from '@ethersproject/abi'
import { formatUnits } from '@ethersproject/units'
import { JSBI, Token } from '@im33357/uniswap-v2-sdk'
import { SwapPoolTabs } from '../../components/NavigationTabs'
import AppBody from '../AppBody'
import { AutoColumn } from '../../components/Column'
import { ButtonLight, ButtonPrimary } from '../../components/Button'
import { LightCard, GreyCard } from '../../components/Card'
import Row, { RowBetween } from '../../components/Row'
import { useActiveWeb3React } from '../../hooks'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { useFactoryPairs } from '../../hooks/useFactoryPairs'
import { usePairLookup } from '../../hooks/usePairLookup'
import { usePairPosition } from '../../hooks/usePairPosition'
import { useSpotPriceHistory } from '../../hooks/useSpotPriceHistory'
import { useTokenBalancesWithLoadingIndicator } from '../../state/wallet/hooks'
import { isAddress } from '../../utils'
import { rpcCallWithFallback } from '../../utils/ethernovaRpc'
import { currencyId } from '../../utils/currencyId'
import { StyledInternalLink, TYPE } from '../../theme'

const FACTORY_INTERFACE = new Interface(['function getPair(address,address) view returns (address)'])

type Tab = 'positions' | 'pools'

function formatAmount(amount?: string, decimals = 18): string {
  if (!amount) return '—'
  try {
    const value = parseFloat(formatUnits(amount, decimals))
    if (!Number.isFinite(value)) return '—'
    return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
  } catch {
    return '—'
  }
}

function MiniChart({ values }: { values: number[] }) {
  if (!values.length) return null
  const width = 260
  const height = 80
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} style={{ width: '100%' }}>
      <polyline
        fill="none"
        stroke="rgba(139,92,246,0.9)"
        strokeWidth="2"
        points={points}
      />
    </svg>
  )
}

export default function Explore() {
  const { account } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const [tab, setTab] = useState<Tab>('positions')
  const [page, setPage] = useState(0)
  const pageSize = 20
  const { pairs, total, loading, error, retry } = useFactoryPairs(page, pageSize)

  const tonyAddress = isAddress(config.tokens.TONY.address)
  const wnovaAddress = isAddress(config.tokens.WNOVA.address)
  const tonyToken = useMemo(
    () =>
      tonyAddress
        ? new Token(
            config.chainId || 121525,
            tonyAddress,
            config.tokens.TONY.decimals || 18,
            config.tokens.TONY.symbol || 'TONY',
            config.tokens.TONY.name || 'STARK - IRON MAN'
          )
        : undefined,
    [config, tonyAddress]
  )
  const wnovaToken = useMemo(
    () =>
      wnovaAddress
        ? new Token(
            config.chainId || 121525,
            wnovaAddress,
            config.tokens.WNOVA.decimals || 18,
            config.tokens.WNOVA.symbol || 'WNOVA',
            config.tokens.WNOVA.name || 'Wrapped NOVA'
          )
        : undefined,
    [config, wnovaAddress]
  )

  const pairLookup = usePairLookup(tonyToken, wnovaToken)
  const position = usePairPosition(pairLookup.pairAddress, account ?? undefined)
  const createPoolHref =
    tonyToken && wnovaToken ? `/add/${tonyToken.address}/${wnovaToken.address}` : '/add/ETH'

  const [swapPrices, setSwapPrices] = useState<number[]>([])
  const [swapStatus, setSwapStatus] = useState<'idle' | 'loading' | 'ok' | 'empty' | 'error'>('idle')
  useEffect(() => {
    const pairAddress = pairLookup.pairAddress
    if (!pairAddress) return
    let cancelled = false
    const run = async () => {
      setSwapStatus('loading')
      try {
        const graphUrl = `${window.location.origin}/subgraphs/name/novadex/novadex`
        const query = {
          query: `query Swaps($pair: String!) { swaps(first: 20, orderBy: timestamp, orderDirection: desc, where: { pair: $pair }) { amount0In amount0Out amount1In amount1Out } }`,
          variables: { pair: pairAddress.toLowerCase() }
        }
        const res = await fetch(graphUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(query)
        })
        if (!res.ok) {
          throw new Error(`Graph error ${res.status}`)
        }
        const data = await res.json()
        const swaps = data?.data?.swaps ?? []
        const prices = swaps
          .map((swap: any) => {
            const amount0 = parseFloat(swap.amount0In || '0') + parseFloat(swap.amount0Out || '0')
            const amount1 = parseFloat(swap.amount1In || '0') + parseFloat(swap.amount1Out || '0')
            if (!amount0 || !amount1) return null
            return amount1 / amount0
          })
          .filter((value: number | null): value is number => Boolean(value) && Number.isFinite(value))
          .reverse()
        if (cancelled) return
        if (!prices.length) {
          setSwapStatus('empty')
          setSwapPrices([])
          return
        }
        setSwapPrices(prices)
        setSwapStatus('ok')
      } catch {
        if (cancelled) return
        setSwapStatus('error')
        setSwapPrices([])
      }
    }
    run()
    return () => {
      cancelled = true
    }
  }, [pairLookup.pairAddress])

  const token0Decimals = useMemo(() => {
    if (!pairLookup.token0) return 18
    if (wnovaToken && pairLookup.token0.toLowerCase() === wnovaToken.address.toLowerCase()) {
      return wnovaToken.decimals
    }
    if (tonyToken && pairLookup.token0.toLowerCase() === tonyToken.address.toLowerCase()) {
      return tonyToken.decimals
    }
    return 18
  }, [pairLookup.token0, wnovaToken, tonyToken])

  const token1Decimals = useMemo(() => {
    if (!pairLookup.token1) return 18
    if (wnovaToken && pairLookup.token1.toLowerCase() === wnovaToken.address.toLowerCase()) {
      return wnovaToken.decimals
    }
    if (tonyToken && pairLookup.token1.toLowerCase() === tonyToken.address.toLowerCase()) {
      return tonyToken.decimals
    }
    return 18
  }, [pairLookup.token1, wnovaToken, tonyToken])

  const spotHistory = useSpotPriceHistory(pairLookup.pairAddress, token0Decimals, token1Decimals)

  const [lookupInput, setLookupInput] = useState('')
  const [lookupPairAddress, setLookupPairAddress] = useState<string | null>(null)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const lookupPosition = usePairPosition(lookupPairAddress ?? undefined, account ?? undefined)

  const lpTokens = useMemo(() => {
    if (!pairs.length) return []
    return pairs.map(pair => new Token(config.chainId || 121525, pair.address, 18, 'LP', 'NovaDEX LP'))
  }, [pairs, config.chainId])

  const [lpBalances, lpBalancesLoading] = useTokenBalancesWithLoadingIndicator(account ?? undefined, lpTokens)

  const positionsInPage = useMemo(() => {
    if (!account) return []
    return pairs.filter(pair => {
      const balance = lpBalances[pair.address]
      return Boolean(balance && JSBI.greaterThan(balance.raw, JSBI.BigInt(0)))
    })
  }, [pairs, lpBalances, account])

  const handleLookup = useCallback(async () => {
    setLookupError(null)
    setLookupPairAddress(null)
    const raw = lookupInput.trim()
    if (!raw) return
    const parts = raw.split(/[\s,]+/).filter(Boolean)
    if (parts.length === 1) {
      const addr = isAddress(parts[0])
      if (!addr) {
        setLookupError('Invalid address')
        return
      }
      setLookupPairAddress(addr)
      return
    }
    if (parts.length === 2) {
      const tokenA = isAddress(parts[0])
      const tokenB = isAddress(parts[1])
      if (!tokenA || !tokenB) {
        setLookupError('Invalid token addresses')
        return
      }
      try {
        const data = FACTORY_INTERFACE.encodeFunctionData('getPair', [tokenA, tokenB])
        const result = (await rpcCallWithFallback('eth_call', [
          { to: config.contracts.factory, data },
          'latest'
        ])) as string
        const [pairAddress] = FACTORY_INTERFACE.decodeFunctionResult('getPair', result) as [string]
        if (!pairAddress || pairAddress === '0x0000000000000000000000000000000000000000') {
          setLookupError('Pair not found on-chain')
          return
        }
        setLookupPairAddress(pairAddress)
      } catch (err) {
        setLookupError(err instanceof Error ? err.message : 'RPC error')
      }
      return
    }
    setLookupError('Paste a pair address or two token addresses')
  }, [lookupInput, config.contracts.factory])

  const currentPrice = useMemo(() => {
    if (!pairLookup.reserves || !tonyToken || !wnovaToken) return null
    const reserve0 = parseFloat(formatUnits(pairLookup.reserves.reserve0.toString(), 18))
    const reserve1 = parseFloat(formatUnits(pairLookup.reserves.reserve1.toString(), 18))
    if (!reserve0 || !reserve1) return null
    return reserve0 > reserve1 ? reserve0 / reserve1 : reserve1 / reserve0
  }, [pairLookup.reserves, tonyToken, wnovaToken])

  return (
    <AppBody>
      <SwapPoolTabs active="explore" />
      <AutoColumn gap="lg">
        <RowBetween>
          <Row>
            <ButtonLight onClick={() => setTab('positions')} disabled={tab === 'positions'}>
              My Positions
            </ButtonLight>
            <ButtonLight onClick={() => setTab('pools')} disabled={tab === 'pools'}>
              All Pools
            </ButtonLight>
          </Row>
          <Row>
            <ButtonPrimary as={StyledInternalLink} to={createPoolHref}>
              Create Pool
            </ButtonPrimary>
            <ButtonLight as={StyledInternalLink} to="/find">
              Import Pool
            </ButtonLight>
          </Row>
        </RowBetween>

        {tab === 'positions' ? (
          <AutoColumn gap="md">
            {!account ? (
              <LightCard padding="32px">
                <TYPE.body textAlign="center">Connect wallet to view positions.</TYPE.body>
              </LightCard>
            ) : (
              <>
                <LightCard padding="16px">
                  <AutoColumn gap="sm">
                    <Text fontWeight={600}>Pinned Pool (TONY/WNOVA)</Text>
                    {pairLookup.status === 'exists' ? (
                      <>
                        <Text>
                          LP Balance:{' '}
                          {position.lpBalance ? formatAmount(position.lpBalance.toString(), 18) : '—'} LP
                        </Text>
                        <Text>
                          Reserves:{' '}
                          {position.reserves
                            ? `${formatAmount(position.reserves.reserve0.toString(), 18)} / ${formatAmount(
                                position.reserves.reserve1.toString(),
                                18
                              )}`
                            : '—'}
                        </Text>
                        <Text>Read path: {position.source}</Text>
                        {position.error ? <Text color="red">RPC: {position.error}</Text> : null}
                        <StyledInternalLink to={`/add/${currencyId(tonyToken!)}/${currencyId(wnovaToken!)}`}>
                          Add liquidity
                        </StyledInternalLink>
                      </>
                    ) : pairLookup.status === 'loading' ? (
                      <Text>Loading pool…</Text>
                    ) : (
                      <Text>Pool not found.</Text>
                    )}
                  </AutoColumn>
                </LightCard>

                <LightCard padding="16px">
                  <AutoColumn gap="sm">
                    <Text fontWeight={600}>Lookup Position</Text>
                    <Text fontSize={12} color="rgba(255,255,255,0.6)">
                      Paste pair address or tokenA tokenB addresses.
                    </Text>
                    <input
                      style={{
                        padding: '10px 12px',
                        borderRadius: '12px',
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(7,10,18,0.7)',
                        color: 'white'
                      }}
                      value={lookupInput}
                      onChange={event => setLookupInput(event.target.value)}
                      placeholder="0xPair… or 0xTokenA 0xTokenB"
                    />
                    <RowBetween>
                      <ButtonPrimary onClick={handleLookup}>Lookup</ButtonPrimary>
                      {lookupError ? <Text color="red">{lookupError}</Text> : null}
                    </RowBetween>
                    {lookupPairAddress ? (
                      <GreyCard padding="12px">
                        <AutoColumn gap="xs">
                          <Text>Pair: {lookupPairAddress}</Text>
                          <Text>LP: {lookupPosition.lpBalance ? formatAmount(lookupPosition.lpBalance.toString(), 18) : '—'}</Text>
                          <Text>Read path: {lookupPosition.source}</Text>
                        </AutoColumn>
                      </GreyCard>
                    ) : null}
                  </AutoColumn>
                </LightCard>

                <LightCard padding="16px">
                  <AutoColumn gap="sm">
                    <Text fontWeight={600}>My Positions (on-chain)</Text>
                    {lpBalancesLoading ? (
                      <Text>Loading LP balances…</Text>
                    ) : positionsInPage.length ? (
                      positionsInPage.map(pair => (
                        <GreyCard key={pair.address} padding="12px">
                          <AutoColumn gap="xs">
                            <Text>
                              {pair.token0.symbol}/{pair.token1.symbol}
                            </Text>
                            <Text fontSize={12}>Pair: {pair.address}</Text>
                            <Text fontSize={12}>
                              LP Balance: {formatAmount(lpBalances[pair.address]?.raw.toString() ?? '0', 18)}
                            </Text>
                          </AutoColumn>
                        </GreyCard>
                      ))
                    ) : (
                      <Text fontSize={12} color="rgba(255,255,255,0.7)">
                        No positions detected on this page. Use Lookup to check a specific pair.
                      </Text>
                    )}
                  </AutoColumn>
                </LightCard>
              </>
            )}
          </AutoColumn>
        ) : (
          <AutoColumn gap="md">
            <LightCard padding="16px">
              <AutoColumn gap="sm">
                <Text fontWeight={600}>Charts (Spot Price)</Text>
                {swapStatus === 'ok' ? (
                  <>
                    <Text fontSize={12}>Last swaps price (token1/token0)</Text>
                    <MiniChart values={swapPrices} />
                  </>
                ) : spotHistory.status === 'ok' ? (
                  <>
                    <Text fontSize={12}>On-chain spot price history (Sync events)</Text>
                    <MiniChart values={spotHistory.prices} />
                  </>
                ) : swapStatus === 'empty' ? (
                  <Text>No swap history yet. Showing current reserves only.</Text>
                ) : swapStatus === 'error' ? (
                  <Text>Subgraph unavailable — showing current reserves only.</Text>
                ) : spotHistory.status === 'loading' ? (
                  <Text>Loading spot price history…</Text>
                ) : null}
                {currentPrice ? <Text>Current price (TONY/WNOVA): {currentPrice.toFixed(6)}</Text> : null}
              </AutoColumn>
            </LightCard>

            {error ? (
              <LightCard padding="24px">
                <AutoColumn gap="sm">
                  <Text>RPC unstable — {error}</Text>
                  <ButtonLight onClick={retry}>Retry</ButtonLight>
                </AutoColumn>
              </LightCard>
            ) : null}

            {loading ? (
              <LightCard padding="24px">
                <Text>Loading pools…</Text>
              </LightCard>
            ) : (
              pairs.map(pair => {
                const reserve0 = formatAmount(pair.reserve0.toString(), pair.token0.decimals)
                const reserve1 = formatAmount(pair.reserve1.toString(), pair.token1.decimals)
                const price =
                  pair.reserve0.isZero()
                    ? null
                    : parseFloat(formatUnits(pair.reserve1, pair.token1.decimals)) /
                      parseFloat(formatUnits(pair.reserve0, pair.token0.decimals))
                return (
                  <GreyCard key={pair.address} padding="16px">
                    <AutoColumn gap="xs">
                      <Text fontWeight={600}>
                        {pair.token0.symbol}/{pair.token1.symbol}
                      </Text>
                      <Text fontSize={12}>Pair: {pair.address}</Text>
                      <Text fontSize={12}>
                        Reserves: {reserve0} {pair.token0.symbol} / {reserve1} {pair.token1.symbol}
                      </Text>
                      <Text fontSize={12}>Price: {price ? price.toFixed(6) : '—'}</Text>
                      <RowBetween>
                        <ButtonLight as={StyledInternalLink} to={`/add/${pair.token0.address}/${pair.token1.address}`}>
                          Add Liquidity
                        </ButtonLight>
                        <ButtonLight
                          as={StyledInternalLink}
                          to={`/swap?inputCurrency=${pair.token0.address}&outputCurrency=${pair.token1.address}`}
                        >
                          Swap
                        </ButtonLight>
                      </RowBetween>
                    </AutoColumn>
                  </GreyCard>
                )
              })
            )}

            <RowBetween>
              <Text>
                Showing {pairs.length} of {total}
              </Text>
              <Row>
                <ButtonLight disabled={page === 0} onClick={() => setPage(prev => Math.max(prev - 1, 0))}>
                  Prev
                </ButtonLight>
                <ButtonLight
                  disabled={(page + 1) * pageSize >= total}
                  onClick={() => setPage(prev => prev + 1)}
                >
                  Load more
                </ButtonLight>
              </Row>
            </RowBetween>
          </AutoColumn>
        )}
      </AutoColumn>
    </AppBody>
  )
}
