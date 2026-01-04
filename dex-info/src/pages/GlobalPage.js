import React, { useEffect, useMemo, useState } from 'react'
import { withRouter } from 'react-router-dom'
import { Box } from 'rebass'
import styled from 'styled-components'
import { ethers } from 'ethers'

import { RowBetween } from '../components/Row'
import { AutoColumn } from '../components/Column'
import PairList from '../components/PairList'
import TxnList from '../components/TxnList'
import GlobalChart from '../components/GlobalChart'
import Search from '../components/Search'
import GlobalStats from '../components/GlobalStats'
import OnchainMarketPanel from '../components/OnchainMarketPanel'

import { useGlobalData, useGlobalTransactions, useGlobalChartData } from '../contexts/GlobalData'
import { useAllPairData, usePairData } from '../contexts/PairData'
import { useLatestBlocks } from '../contexts/Application'
import { useMedia } from 'react-use'
import Panel from '../components/Panel'
import {
  formattedNum,
  formattedPercent,
  getReserveWnova,
  isFiniteNum,
  normAddr,
  isAddrEq,
  calcWnovaPairMetrics,
  getPoolLink,
} from '../utils'
import { TYPE, ThemedBackground } from '../Theme'
import { transparentize } from 'polished'
import { CustomLink } from '../components/Link'

import { PageWrapper, ContentWrapper } from '../components'
import { useBoostedPairs } from '../hooks/useBoostedPairs'
import { useOnchainPair } from '../hooks/useOnchainPair'
import { useOnchainTokenInfo } from '../hooks/useOnchainTokenInfo'
import { usePairMetadata, useTokenMetadata } from '../hooks/useTokenMetadata'
import DoubleTokenLogo from '../components/DoubleLogo'
import CopyHelper from '../components/Copy'

const RPC_URL = process.env.REACT_APP_RPC_URL
const FACTORY_ADDRESS = process.env.REACT_APP_FACTORY_ADDRESS
const WNOVA_ADDRESS = process.env.REACT_APP_WNOVA_ADDRESS
const TONY_ADDRESS = process.env.REACT_APP_TONY_ADDRESS
const PAIR_ADDRESS = process.env.REACT_APP_PAIR_ADDRESS

const GridRow = styled.div`
  display: grid;
  width: 100%;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
  row-gap: 16px;
  align-items: stretch;
  justify-content: space-between;

  @media screen and (max-width: 980px) {
    grid-template-columns: 1fr;
  }
`

const SectionHeader = styled(RowBetween)`
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
`

const BoostedList = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;

  @media screen and (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`

const BoostCard = styled(Panel)`
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 120px;
`

const EmptyState = styled.div`
  padding: 1rem;
  color: ${({ theme }) => theme.text2};
  font-size: 0.9rem;
`

const PairSpotlight = styled(Panel)`
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 1.25rem;
`

const PairMetaRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
`

const PairAddressRow = styled.div`
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: ${({ theme }) => theme.text2};
`

const PairAddressText = styled.span`
  word-break: break-all;
`

const MetaTag = styled.span`
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.06);
  color: ${({ theme }) => theme.text2};
`

function BoostedPairCard({ entry, pairData, rpcUrl }) {
  const onchainPair = useOnchainPair(entry.address, rpcUrl)
  const pairMeta = usePairMetadata(entry.address)

  const token0Address = pairData?.token0?.id || pairMeta?.token0 || onchainPair?.data?.token0
  const token1Address = pairData?.token1?.id || pairMeta?.token1 || onchainPair?.data?.token1

  const token0Info = useOnchainTokenInfo(token0Address, token0Address ? rpcUrl : null)
  const token1Info = useOnchainTokenInfo(token1Address, token1Address ? rpcUrl : null)
  const token0Meta = useTokenMetadata(token0Address)
  const token1Meta = useTokenMetadata(token1Address)

  const symbol0 = pairData?.token0?.symbol || pairMeta?.symbol0 || token0Meta?.symbol || token0Info?.info?.symbol || '?'
  const symbol1 = pairData?.token1?.symbol || pairMeta?.symbol1 || token1Meta?.symbol || token1Info?.info?.symbol || '?'
  const pairName =
    token0Address && token1Address ? `${symbol0} / ${symbol1}` : `${entry.address.slice(0, 6)}…${entry.address.slice(-4)}`
  const timeLeft = Math.max(0, entry.expiresAt - Math.floor(Date.now() / 1000))
  const hoursLeft = Math.max(1, Math.ceil(timeLeft / 3600))
  const onchainMissing = onchainPair?.status === 'not_found'

  return (
    <BoostCard key={entry.address}>
      <RowBetween>
        <PairMetaRow>
          {token0Address && token1Address ? (
            <DoubleTokenLogo a0={token0Address} a1={token1Address} size={20} margin />
          ) : null}
          <TYPE.main>{pairName}</TYPE.main>
        </PairMetaRow>
        <CustomLink to={`/pair/${entry.address}`}>View</CustomLink>
      </RowBetween>
      <TYPE.light fontSize={12}>
        Boosted by {entry.booster?.slice(0, 6)}…{entry.booster?.slice(-4)}
      </TYPE.light>
      <PairAddressRow>
        <PairAddressText>{entry.address}</PairAddressText>
        <CopyHelper toCopy={entry.address} />
        {token0Address && token1Address && (
          <CustomLink to={getPoolLink(token0Address, token1Address)}>Add liquidity ↗</CustomLink>
        )}
      </PairAddressRow>
      <RowBetween>
        <TYPE.main fontSize={'1.125rem'}>{hoursLeft}h remaining</TYPE.main>
        <MetaTag>Boosted</MetaTag>
      </RowBetween>
      {onchainMissing && (
        <TYPE.light fontSize={12} color="text2">
          Pair contract not found on-chain yet.
        </TYPE.light>
      )}
      {onchainMissing && pairMeta?.token0 && pairMeta?.token1 && (
        <CustomLink to={getPoolLink(pairMeta.token0, pairMeta.token1)}>Create pool / add liquidity ↗</CustomLink>
      )}
    </BoostCard>
  )
}

function GlobalPage() {
  // get data for lists and totals
  const allPairs = useAllPairData()
  const transactions = useGlobalTransactions()
  const pinnedPair = usePairData(PAIR_ADDRESS)
  const [latestBlock] = useLatestBlocks()
  const subgraphReady = Boolean(latestBlock)
  const { totalLiquidityETH, oneDayVolumeETH, volumeChangeETH, liquidityChangeETH } = useGlobalData()
  const [dailyData] = useGlobalChartData()

  // breakpoints
  const below800 = useMedia('(max-width: 800px)')

  // scrolling refs
  useEffect(() => {
    document.querySelector('body').scrollTo({
      behavior: 'smooth',
      top: 0,
    })
  }, [])

  // for tracked data on pairs
  const [useTracked] = useState(true)
  const wnovaLower = normAddr(WNOVA_ADDRESS)
  const tonyLower = normAddr(TONY_ADDRESS)
  const boostState = useBoostedPairs(RPC_URL, 60000)
  const quoteTokenAddress = useMemo(() => {
    const token0Id = normAddr(pinnedPair?.token0?.id)
    const token1Id = normAddr(pinnedPair?.token1?.id)
    if (token0Id && token1Id) {
      if (isAddrEq(token0Id, wnovaLower)) return token1Id
      if (isAddrEq(token1Id, wnovaLower)) return token0Id
    }
    return tonyLower
  }, [pinnedPair, wnovaLower, tonyLower])

  const quoteTokenSymbol = useMemo(() => {
    const token0Id = normAddr(pinnedPair?.token0?.id)
    const token1Id = normAddr(pinnedPair?.token1?.id)
    if (token0Id && token1Id) {
      if (isAddrEq(token0Id, wnovaLower)) return pinnedPair?.token1?.symbol || 'TOKEN'
      if (isAddrEq(token1Id, wnovaLower)) return pinnedPair?.token0?.symbol || 'TOKEN'
    }
    return pinnedPair?.token1?.symbol || pinnedPair?.token0?.symbol || 'TOKEN'
  }, [pinnedPair, wnovaLower])

  const pairSwaps = useMemo(() => {
    if (!transactions?.swaps?.length || !wnovaLower || !quoteTokenAddress) return []
    return transactions.swaps.filter((swap) => {
      const token0 = normAddr(swap?.pair?.token0?.id)
      const token1 = normAddr(swap?.pair?.token1?.id)
      return (
        (isAddrEq(token0, wnovaLower) && isAddrEq(token1, quoteTokenAddress)) ||
        (isAddrEq(token1, wnovaLower) && isAddrEq(token0, quoteTokenAddress))
      )
    })
  }, [transactions, wnovaLower, quoteTokenAddress])

  const volumeWnova24h = useMemo(() => {
    if (!pairSwaps || !pairSwaps.length) return 0
    const now = Math.floor(Date.now() / 1000)
    return pairSwaps.reduce((sum, swap) => {
      const ts = Number.parseInt(swap?.transaction?.timestamp || swap?.timestamp || 0, 10)
      if (!ts || now - ts > 86400) return sum
      const token0 = normAddr(swap?.pair?.token0?.id)
      const token1 = normAddr(swap?.pair?.token1?.id)
      const amount0In = Number(swap?.amount0In || 0)
      const amount0Out = Number(swap?.amount0Out || 0)
      const amount1In = Number(swap?.amount1In || 0)
      const amount1Out = Number(swap?.amount1Out || 0)
      if (isAddrEq(token0, wnovaLower)) return sum + (amount0In > 0 ? amount0In : amount0Out)
      if (isAddrEq(token1, wnovaLower)) return sum + (amount1In > 0 ? amount1In : amount1Out)
      return sum
    }, 0)
  }, [pairSwaps, wnovaLower])

  const reserveWnova = useMemo(() => getReserveWnova(pinnedPair, WNOVA_ADDRESS) || 0, [pinnedPair])
  const reserveQuote = useMemo(() => {
    const token0Id = normAddr(pinnedPair?.token0?.id)
    const token1Id = normAddr(pinnedPair?.token1?.id)
    if (!token0Id || !token1Id) return 0
    const reserve0 = Number(pinnedPair?.reserve0 ?? 0)
    const reserve1 = Number(pinnedPair?.reserve1 ?? 0)
    if (isAddrEq(token0Id, wnovaLower)) return reserve1
    if (isAddrEq(token1Id, wnovaLower)) return reserve0
    return 0
  }, [pinnedPair, wnovaLower])
  const liquiditySeries = useMemo(() => {
    if (!dailyData || !dailyData.length) return []
    return dailyData
      .map((entry) => {
        const value = Number(entry?.totalLiquidityETH)
        return { time: Number(entry?.date), value }
      })
      .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
  }, [dailyData])
  const lastDaily = dailyData && dailyData.length ? dailyData[dailyData.length - 1] : null
  const chartVolume = Number(lastDaily?.dailyVolumeETH ?? lastDaily?.totalVolumeETH ?? NaN)
  const chartLiquidity = Number(lastDaily?.totalLiquidityETH ?? NaN)
  const headlineVolume = isFiniteNum(chartVolume)
    ? chartVolume
    : volumeWnova24h > 0
    ? volumeWnova24h
    : oneDayVolumeETH || 0
  const headlineLiquidity = isFiniteNum(chartLiquidity)
    ? chartLiquidity
    : reserveWnova > 0
    ? reserveWnova
    : totalLiquidityETH || 0

  const pairLookup = useMemo(() => {
    if (!allPairs) return {}
    const lookup = {}
    Object.keys(allPairs).forEach((key) => {
      lookup[normAddr(key)] = allPairs[key]
    })
    return lookup
  }, [allPairs])

  const wnovaPairs = useMemo(() => {
    if (!allPairs || !wnovaLower) return []
    return Object.values(allPairs)
      .map((pair) => ({ pair, metrics: calcWnovaPairMetrics(pair, WNOVA_ADDRESS) }))
      .filter((entry) => entry.metrics.hasWnova && isFiniteNum(entry.metrics.liquidityWnova))
  }, [allPairs, wnovaLower])

  const hotPairs = useMemo(() => wnovaPairs.filter((entry) => entry.metrics.liquidityWnova >= 100), [wnovaPairs])

  const trendingPairs = useMemo(
    () => wnovaPairs.filter((entry) => entry.metrics.liquidityWnova >= 50 && entry.metrics.liquidityWnova < 100),
    [wnovaPairs]
  )

  const pairOfWeek = useMemo(() => {
    if (!wnovaPairs.length) return null
    return wnovaPairs.reduce((best, entry) => {
      if (!best) return entry
      return entry.metrics.liquidityWnova > best.metrics.liquidityWnova ? entry : best
    }, null)
  }, [wnovaPairs])

  const toPairMap = (list) => {
    if (!list || !list.length) return null
    return list.reduce((acc, entry) => {
      acc[entry.pair.id] = entry.pair
      return acc
    }, {})
  }

  const boostedPairs = useMemo(() => {
    const boosted = boostState?.boosted || []
    if (!boosted.length) return []
    return boosted
      .map((item) => {
        const pair = pairLookup[normAddr(item.pair)]
        return {
          pair,
          address: item.pair,
          booster: item.booster,
          expiresAt: item.expiresAt,
        }
      })
      .filter((entry) => entry.address)
  }, [boostState, pairLookup])

  const boostFeeDisplay = useMemo(() => {
    const feeRaw = boostState?.config?.feeAmount
    if (!feeRaw) return '10'
    try {
      const parsed = Number(ethers.utils.formatUnits(feeRaw.toString(), 18))
      return formattedNum(parsed, false)
    } catch {
      return '10'
    }
  }, [boostState])

  return (
    <PageWrapper>
      <ThemedBackground backgroundColor={transparentize(0.6, '#ff007a')} />
      <ContentWrapper>
        <div>
          <AutoColumn gap="24px" style={{ paddingBottom: below800 ? '0' : '24px' }}>
            <TYPE.largeHeader>{below800 ? 'NovaDEX Analytics' : 'NovaDEX Analytics'}</TYPE.largeHeader>
            <Search />
            <GlobalStats />
            <TYPE.light fontSize={12} color="text2">
              No fiat oracle on Ethernova yet — values shown in WNOVA where possible.
            </TYPE.light>
          </AutoColumn>
          <OnchainMarketPanel
            rpcUrl={RPC_URL}
            factoryAddress={FACTORY_ADDRESS}
            baseTokenAddress={WNOVA_ADDRESS}
            quoteTokenAddress={quoteTokenAddress}
            baseSymbol="WNOVA"
            quoteSymbol={quoteTokenSymbol}
            pairAddress={PAIR_ADDRESS}
            reserveBase={reserveWnova}
            reserveQuote={reserveQuote}
            liquiditySeries={liquiditySeries}
            swaps={pairSwaps}
            showVolume={false}
            allowOnchain={!subgraphReady}
            testIdPrefix="overview-market"
          />
          {below800 && ( // mobile card
            <Box mb={20}>
              <Panel>
                <Box>
                  <AutoColumn gap="36px">
                    <AutoColumn gap="20px">
                      <RowBetween>
                        <TYPE.main>Volume (24hrs, WNOVA)</TYPE.main>
                        <div />
                      </RowBetween>
                      <RowBetween align="flex-end">
                        <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={600}>
                          {isFiniteNum(headlineVolume) ? formattedNum(headlineVolume, false) : '-'}
                        </TYPE.main>
                        <TYPE.main fontSize={12}>{formattedPercent(volumeChangeETH)}</TYPE.main>
                      </RowBetween>
                    </AutoColumn>
                    <AutoColumn gap="20px">
                      <RowBetween>
                        <TYPE.main>Total Liquidity (WNOVA)</TYPE.main>
                        <div />
                      </RowBetween>
                      <RowBetween align="flex-end">
                        <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={600}>
                          {isFiniteNum(headlineLiquidity) ? formattedNum(headlineLiquidity, false) : '-'}
                        </TYPE.main>
                        <TYPE.main fontSize={12}>
                          {formattedPercent(liquidityChangeETH)}
                        </TYPE.main>
                      </RowBetween>
                    </AutoColumn>
                  </AutoColumn>
                </Box>
              </Panel>
            </Box>
          )}
          {!below800 && (
            <GridRow>
              <Panel style={{ height: '100%', minHeight: '240px' }}>
                <div data-testid="chart-liquidity" style={{ height: '100%' }}>
                  <GlobalChart display="liquidity" />
                </div>
              </Panel>
              <Panel style={{ height: '100%', minHeight: '240px' }}>
                <div data-testid="chart-volume" style={{ height: '100%' }}>
                  <GlobalChart display="volume" />
                </div>
              </Panel>
            </GridRow>
          )}
          {below800 && (
            <AutoColumn style={{ marginTop: '6px' }} gap="24px">
              <Panel style={{ height: '100%', minHeight: '240px' }}>
                <div data-testid="chart-liquidity" style={{ height: '100%' }}>
                  <GlobalChart display="liquidity" />
                </div>
              </Panel>
            </AutoColumn>
          )}
          <SectionHeader>
            <TYPE.main fontSize={'1.125rem'} style={{ whiteSpace: 'nowrap' }}>
              Pair of the Week
            </TYPE.main>
            <CustomLink to={'/pairs'}>See all</CustomLink>
          </SectionHeader>
          {pairOfWeek ? (
            <PairSpotlight>
              <RowBetween>
                <PairMetaRow>
                  <DoubleTokenLogo
                    a0={pairOfWeek.pair.token0.id}
                    a1={pairOfWeek.pair.token1.id}
                    size={22}
                    margin
                  />
                  <TYPE.main>
                    {pairOfWeek.pair.token0.symbol} / {pairOfWeek.pair.token1.symbol}
                  </TYPE.main>
                </PairMetaRow>
                <CustomLink to={`/pair/${pairOfWeek.pair.id}`}>View</CustomLink>
              </RowBetween>
              <TYPE.light fontSize={12}>Highest WNOVA liquidity this week.</TYPE.light>
              <TYPE.main fontSize={'1.125rem'}>
                {formattedNum(pairOfWeek.metrics.liquidityWnova, false)} WNOVA
              </TYPE.main>
            </PairSpotlight>
          ) : (
            <Panel>
              <EmptyState>No pairs with WNOVA liquidity yet.</EmptyState>
            </Panel>
          )}

          <SectionHeader>
            <TYPE.main fontSize={'1.125rem'} style={{ whiteSpace: 'nowrap' }}>
              Boosted Tokens (24h)
            </TYPE.main>
            <CustomLink to={`/pair/${PAIR_ADDRESS}`}>Boost your pair</CustomLink>
          </SectionHeader>
          {boostedPairs.length ? (
            <BoostedList>
              {boostedPairs.map((entry) => {
                return <BoostedPairCard key={entry.address} entry={entry} pairData={entry.pair} rpcUrl={RPC_URL} />
              })}
            </BoostedList>
          ) : (
            <Panel>
              <EmptyState>
                No boosted pairs yet. Boost your pair for {boostFeeDisplay} NOVA to appear here for 24h.
              </EmptyState>
            </Panel>
          )}

          <SectionHeader>
            <TYPE.main fontSize={'1.125rem'} style={{ whiteSpace: 'nowrap' }}>
              Hot (≥ 100 WNOVA)
            </TYPE.main>
            <CustomLink to={'/pairs'}>See all</CustomLink>
          </SectionHeader>
          <Panel style={{ marginTop: '6px', padding: '1.125rem 0 ' }}>
            {hotPairs.length ? (
              <PairList pairs={toPairMap(hotPairs)} useTracked={useTracked} maxItems={10} />
            ) : (
              <EmptyState>No pairs with ≥100 WNOVA liquidity yet.</EmptyState>
            )}
          </Panel>

          <SectionHeader>
            <TYPE.main fontSize={'1.125rem'} style={{ whiteSpace: 'nowrap' }}>
              Trending (≥ 50 WNOVA)
            </TYPE.main>
            <CustomLink to={'/pairs'}>See all</CustomLink>
          </SectionHeader>
          <Panel style={{ marginTop: '6px', padding: '1.125rem 0 ' }}>
            {trendingPairs.length ? (
              <PairList pairs={toPairMap(trendingPairs)} useTracked={useTracked} maxItems={10} />
            ) : (
              <EmptyState>No pairs with ≥50 WNOVA liquidity yet.</EmptyState>
            )}
          </Panel>
          <span>
            <TYPE.main fontSize={'1.125rem'} style={{ marginTop: '2rem' }}>
              Transactions
            </TYPE.main>
          </span>
          <Panel style={{ margin: '1rem 0' }}>
            <TxnList transactions={transactions} />
          </Panel>
        </div>
      </ContentWrapper>
    </PageWrapper>
  )
}

export default withRouter(GlobalPage)
