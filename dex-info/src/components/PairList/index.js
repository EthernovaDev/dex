import React, { useState, useEffect } from 'react'
import { useMedia } from 'react-use'
import dayjs from 'dayjs'
import LocalLoader from '../LocalLoader'
import utc from 'dayjs/plugin/utc'
import { Box, Flex, Text } from 'rebass'
import styled from 'styled-components'

import { CustomLink } from '../Link'
import { Divider } from '../../components'
import { withRouter } from 'react-router-dom'
import { formattedNum, formattedPercent, isFiniteNum, toNum } from '../../utils'
import DoubleTokenLogo from '../DoubleLogo'
import FormattedName from '../FormattedName'
import QuestionHelper from '../QuestionHelper'
import { TYPE } from '../../Theme'
import { PAIR_BLACKLIST } from '../../constants'
import { AutoColumn } from '../Column'
import { WRAPPED_NATIVE_ADDRESS, PAIR_ADDRESS } from '../../constants/urls'
import { usePairData } from '../../contexts/PairData'
import { client } from '../../apollo/client'
import { PAIRS_BULK } from '../../apollo/queries'
import { FEE_BPS, TREASURY_FEE_BPS } from '../../constants/base'

dayjs.extend(utc)

const PageButtons = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 2em;
  margin-bottom: 0.5em;
`

const Arrow = styled.div`
  color: ${({ theme }) => theme.primary1};
  opacity: ${(props) => (props.faded ? 0.3 : 1)};
  padding: 0 20px;
  user-select: none;
  :hover {
    cursor: pointer;
  }
`

const List = styled(Box)`
  -webkit-overflow-scrolling: touch;
`

const DashGrid = styled.div`
  display: grid;
  grid-gap: 1em;
  grid-template-columns: 100px 1fr 1fr;
  grid-template-areas: 'name liq vol';
  padding: 0 1.125rem;

  opacity: ${({ fade }) => (fade ? '0.6' : '1')};

  > * {
    justify-content: flex-end;

    :first-child {
      justify-content: flex-start;
      text-align: left;
      width: 20px;
    }
  }

  @media screen and (min-width: 740px) {
    padding: 0 1.125rem;
    grid-template-columns: 1.5fr 1fr 1fr};
    grid-template-areas: ' name liq vol pool ';
  }

  @media screen and (min-width: 1080px) {
    padding: 0 1.125rem;
    grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr;
    grid-template-areas: ' name liq vol volWeek fees apy';
  }

  @media screen and (min-width: 1200px) {
    grid-template-columns: 1.5fr 1fr 1fr 1fr 1fr 1fr;
    grid-template-areas: ' name liq vol volWeek fees apy';
  }
`

const ListWrapper = styled.div``

const ClickableText = styled(Text)`
  color: ${({ theme }) => theme.text1};
  &:hover {
    cursor: pointer;
    opacity: 0.6;
  }
  text-align: end;
  user-select: none;
`

const DataText = styled(Flex)`
  align-items: center;
  text-align: center;
  color: ${({ theme }) => theme.text1};

  & > * {
    font-size: 14px;
  }

  @media screen and (max-width: 600px) {
    font-size: 12px;
  }
`

const SORT_FIELD = {
  LIQ: 0,
  VOL: 1,
  VOL_7DAYS: 3,
  FEES: 4,
  APY: 5,
}

const FIELD_TO_VALUE = (field, useTracked) => {
  switch (field) {
    case SORT_FIELD.LIQ:
      return useTracked ? 'trackedReserveETH' : 'reserveETH'
    case SORT_FIELD.VOL:
      return useTracked ? 'oneDayVolumeETH' : 'oneDayVolumeETH'
    case SORT_FIELD.VOL_7DAYS:
      return useTracked ? 'oneWeekVolumeETH' : 'oneWeekVolumeETH'
    case SORT_FIELD.FEES:
      return useTracked ? 'oneDayVolumeETH' : 'oneDayVolumeETH'
    default:
      return 'trackedReserveETH'
  }
}

const getPairMetrics = (pairData) => {
  if (!pairData) {
    return {
      liquidity: null,
      volume24h: null,
      volume7d: null,
      fees24h: null,
      protocolFees24h: null,
      apy: null,
      hasWnova: false
    }
  }
  const token0Id = pairData.token0?.id?.toLowerCase?.() || ''
  const token1Id = pairData.token1?.id?.toLowerCase?.() || ''
  const isToken0Wnova = token0Id === WRAPPED_NATIVE_ADDRESS
  const isToken1Wnova = token1Id === WRAPPED_NATIVE_ADDRESS
  const reserve0 = toNum(pairData.reserve0, NaN)
  const reserve1 = toNum(pairData.reserve1, NaN)
  const reserveWnova = isToken0Wnova ? reserve0 : isToken1Wnova ? reserve1 : NaN

  const oneDayVol0 = toNum(pairData.oneDayVolumeToken0, NaN)
  const oneDayVol1 = toNum(pairData.oneDayVolumeToken1, NaN)
  const oneWeekVol0 = toNum(pairData.oneWeekVolumeToken0, NaN)
  const oneWeekVol1 = toNum(pairData.oneWeekVolumeToken1, NaN)
  const totalVol0 = toNum(pairData.volumeToken0, NaN)
  const totalVol1 = toNum(pairData.volumeToken1, NaN)

  const liquidity = Number.isFinite(reserveWnova) && reserveWnova > 0 ? reserveWnova : null

  const volume24h = isToken0Wnova
    ? Number.isFinite(oneDayVol0) && oneDayVol0 > 0
      ? oneDayVol0
      : Number.isFinite(totalVol0) && totalVol0 > 0
      ? totalVol0
      : 0
    : isToken1Wnova
    ? Number.isFinite(oneDayVol1) && oneDayVol1 > 0
      ? oneDayVol1
      : Number.isFinite(totalVol1) && totalVol1 > 0
      ? totalVol1
      : 0
    : null

  const volume7d = isToken0Wnova
    ? Number.isFinite(oneWeekVol0) && oneWeekVol0 > 0
      ? oneWeekVol0
      : Number.isFinite(totalVol0) && totalVol0 > 0
      ? totalVol0
      : 0
    : isToken1Wnova
    ? Number.isFinite(oneWeekVol1) && oneWeekVol1 > 0
      ? oneWeekVol1
      : Number.isFinite(totalVol1) && totalVol1 > 0
      ? totalVol1
      : 0
    : null

  const fees24h = Number.isFinite(volume24h) ? volume24h * (FEE_BPS / 10000) : null
  const protocolFees24h =
    Number.isFinite(volume24h) && TREASURY_FEE_BPS > 0 ? volume24h * (TREASURY_FEE_BPS / 10000) : null
  const apy =
    Number.isFinite(liquidity) && liquidity > 0 && Number.isFinite(fees24h)
      ? (fees24h * 365 * 100) / liquidity
      : null

  return {
    liquidity,
    volume24h,
    volume7d,
    fees24h,
    protocolFees24h,
    apy,
    hasWnova: isToken0Wnova || isToken1Wnova
  }
}

const formatDataText = (value, trackedValue, supressWarning = false, subLabel = '') => {
  const showUntracked = value !== '—' && !trackedValue && !supressWarning && !subLabel
  return (
    <AutoColumn gap="2px" style={{ opacity: showUntracked ? '0.7' : '1' }}>
      <div style={{ textAlign: 'right' }}>{value}</div>
      <TYPE.light fontSize={'9px'} style={{ textAlign: 'right' }}>
        {subLabel ? subLabel : showUntracked ? 'untracked' : '  '}
      </TYPE.light>
    </AutoColumn>
  )
}

function PairList({ pairs, color, disbaleLinks, maxItems = 10, useTracked = false }) {
  const below600 = useMedia('(max-width: 600px)')
  const below740 = useMedia('(max-width: 740px)')
  const below1080 = useMedia('(max-width: 1080px)')
  const pinnedPair = usePairData(PAIR_ADDRESS)
  const debug =
    typeof window !== 'undefined' && window.location && window.location.search && window.location.search.includes('debug=1')

  const resolvedPairs = React.useMemo(() => {
    if (pairs && Object.keys(pairs).length) return pairs
    if (pinnedPair && pinnedPair.id) {
      return {
        [pinnedPair.id]: pinnedPair,
      }
    }
    return null
  }, [pairs, pinnedPair])

  // pagination
  const [page, setPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const ITEMS_PER_PAGE = maxItems

  // sorting
  const [sortDirection, setSortDirection] = useState(true)
  const [sortedColumn, setSortedColumn] = useState(SORT_FIELD.LIQ)
  const [fallbackPairs, setFallbackPairs] = useState(null)

  useEffect(() => {
    let active = true
    async function fetchFallback() {
      if (resolvedPairs || fallbackPairs || !PAIR_ADDRESS) return
      try {
        const result = await client.query({
          query: PAIRS_BULK,
          variables: { allPairs: [PAIR_ADDRESS] },
          fetchPolicy: 'network-only',
        })
        const pair = result?.data?.pairs?.[0]
        if (active && pair?.id) {
          setFallbackPairs({ [pair.id]: pair })
        }
      } catch (err) {
        if (debug) {
          console.log('PairList fallback query failed', err?.message || err)
        }
      }
    }
    fetchFallback()
    return () => {
      active = false
    }
  }, [debug, fallbackPairs, resolvedPairs])

  useEffect(() => {
    setMaxPage(1) // edit this to do modular
    setPage(1)
  }, [resolvedPairs])

  useEffect(() => {
    if (resolvedPairs) {
      let extraPages = 1
      if (Object.keys(resolvedPairs).length % ITEMS_PER_PAGE === 0) {
        extraPages = 0
      }
      setMaxPage(Math.max(1, Math.floor(Object.keys(resolvedPairs).length / ITEMS_PER_PAGE) + extraPages))
    }
  }, [ITEMS_PER_PAGE, resolvedPairs])

  const effectivePairs = resolvedPairs || fallbackPairs

  const pairEntries = React.useMemo(() => {
    if (!effectivePairs) return []
    return Object.keys(effectivePairs).map((id) => {
      const pairData = effectivePairs[id]
      return { id, pairData, metrics: getPairMetrics(pairData) }
    })
  }, [effectivePairs])

  const ListItem = ({ pairAddress, index }) => {
    const pairData = effectivePairs[pairAddress]
    const metrics = getPairMetrics(pairData)
    const pairKey = pairAddress?.toLowerCase?.() || pairAddress

    if (pairData && pairData.token0 && pairData.token1) {
      const liquidity = isFiniteNum(metrics.liquidity) ? formattedNum(metrics.liquidity, false) : '—'
      const volume = isFiniteNum(metrics.volume24h) ? formattedNum(metrics.volume24h, false) : '—'
      const weekVolume = isFiniteNum(metrics.volume7d) ? formattedNum(metrics.volume7d, false) : '—'
      const fees = isFiniteNum(metrics.fees24h) ? formattedNum(metrics.fees24h, false) : '—'
      const protocolFees = isFiniteNum(metrics.protocolFees24h) ? formattedNum(metrics.protocolFees24h, false) : '—'
      const apy = Number.isFinite(metrics.apy) ? formattedPercent(metrics.apy) : '—'

      return (
        <DashGrid style={{ height: '48px' }} disbaleLinks={disbaleLinks} focus={true}>
          <DataText area="name" fontWeight="500">
            {!below600 && <div style={{ marginRight: '20px', width: '10px' }}>{index}</div>}
            <DoubleTokenLogo
              size={below600 ? 16 : 20}
              a0={pairData.token0.id}
              a1={pairData.token1.id}
              margin={!below740}
            />
            <CustomLink style={{ marginLeft: '20px', whiteSpace: 'nowrap' }} to={'/pair/' + pairAddress} color={color}>
              <FormattedName
                text={pairData.token0.symbol + '-' + pairData.token1.symbol}
                maxCharacters={below600 ? 8 : 16}
                adjustSize={true}
                link={true}
              />
            </CustomLink>
          </DataText>
          <DataText area="liq" data-testid={`pair-liquidity-${pairKey}`}>
            {formatDataText(liquidity, metrics.hasWnova)}
          </DataText>
          <DataText area="vol" data-testid={`pair-volume-${pairKey}`}>
            {formatDataText(volume, metrics.hasWnova)}
          </DataText>
          {!below1080 && (
            <DataText area="volWeek" data-testid={`pair-volume-7d-${pairKey}`}>
              {formatDataText(weekVolume, metrics.hasWnova)}
            </DataText>
          )}
          {!below1080 && (
            <DataText area="fees" data-testid={`pair-fees-${pairKey}`}>
              {formatDataText(
                fees,
                metrics.hasWnova,
                true,
                protocolFees !== '—' ? `protocol ${protocolFees}` : ''
              )}
            </DataText>
          )}
          {!below1080 && (
            <DataText area="apy" data-testid={`pair-apy-${pairKey}`}>
              {formatDataText(apy, metrics.hasWnova, true)}
            </DataText>
          )}
        </DashGrid>
      )
    } else {
      return ''
    }
  }

  const pairList =
    pairEntries &&
    pairEntries
      .filter((entry) => {
        if (!entry?.id || PAIR_BLACKLIST.includes(entry.id)) return false
        if (!useTracked) return true
        return entry.metrics?.hasWnova
      })
      .sort((a, b) => {
        const metricsA = a.metrics || getPairMetrics(a.pairData)
        const metricsB = b.metrics || getPairMetrics(b.pairData)
        const valueA =
          sortedColumn === SORT_FIELD.LIQ
            ? metricsA.liquidity
            : sortedColumn === SORT_FIELD.VOL
            ? metricsA.volume24h
            : sortedColumn === SORT_FIELD.VOL_7DAYS
            ? metricsA.volume7d
            : sortedColumn === SORT_FIELD.FEES
            ? metricsA.fees24h
            : sortedColumn === SORT_FIELD.APY
            ? metricsA.apy
            : toNum(a.pairData?.[FIELD_TO_VALUE(sortedColumn, useTracked)] ?? 0, 0)
        const valueB =
          sortedColumn === SORT_FIELD.LIQ
            ? metricsB.liquidity
            : sortedColumn === SORT_FIELD.VOL
            ? metricsB.volume24h
            : sortedColumn === SORT_FIELD.VOL_7DAYS
            ? metricsB.volume7d
            : sortedColumn === SORT_FIELD.FEES
            ? metricsB.fees24h
            : sortedColumn === SORT_FIELD.APY
            ? metricsB.apy
            : toNum(b.pairData?.[FIELD_TO_VALUE(sortedColumn, useTracked)] ?? 0, 0)

        const safeA = Number.isFinite(valueA) ? valueA : -Infinity
        const safeB = Number.isFinite(valueB) ? valueB : -Infinity
        if (safeA === safeB) return 0
        return safeA > safeB ? (sortDirection ? -1 : 1) * 1 : (sortDirection ? -1 : 1) * -1
      })
      .slice(ITEMS_PER_PAGE * (page - 1), page * ITEMS_PER_PAGE)
      .map((entry, index) => {
        const pairAddress = entry.id
        if (!pairAddress) return null
        const pairKey = pairAddress?.toLowerCase?.() || pairAddress
        return (
          <div key={pairAddress} data-testid={`pair-row-${pairKey}`}>
            <ListItem index={(page - 1) * ITEMS_PER_PAGE + index + 1} pairAddress={pairAddress} />
            <Divider />
          </div>
        )
      })

  const fallbackPairKey = React.useMemo(() => {
    if (!effectivePairs || !PAIR_ADDRESS) return null
    return (
      Object.keys(effectivePairs).find((key) => key?.toLowerCase?.() === PAIR_ADDRESS) || PAIR_ADDRESS
    )
  }, [effectivePairs])

  const safePairList =
    effectivePairs === null
      ? null
      : pairList && pairList.length
      ? pairList
      : fallbackPairKey && effectivePairs?.[fallbackPairKey]
      ? [
          <div key={fallbackPairKey} data-testid={`pair-row-${fallbackPairKey?.toLowerCase?.() || fallbackPairKey}`}>
            <ListItem index={1} pairAddress={fallbackPairKey} />
            <Divider />
          </div>,
        ]
      : pairList

  const debugInfo = React.useMemo(() => {
    if (!debug) return null
    const pair = (PAIR_ADDRESS && effectivePairs?.[PAIR_ADDRESS]) || pinnedPair
    if (!pair) return null
    const metrics = getPairMetrics(pair)
    return {
      pair: pair?.id || PAIR_ADDRESS,
      reserve0: pair?.reserve0 ?? null,
      reserve1: pair?.reserve1 ?? null,
      volume24h: Number.isFinite(metrics.volume24h) ? metrics.volume24h : null,
      liquidityWnova: Number.isFinite(metrics.liquidity) ? metrics.liquidity : null,
      readSource: pair?.id ? 'subgraph' : 'fallback',
    }
  }, [debug, effectivePairs, pinnedPair])

  return (
    <ListWrapper>
      <DashGrid
        center={true}
        disbaleLinks={disbaleLinks}
        style={{ height: 'fit-content', padding: '0 1.125rem 1rem 1.125rem' }}
      >
        <Flex alignItems="center" justifyContent="flexStart">
          <TYPE.main area="name">Name</TYPE.main>
        </Flex>
        <Flex alignItems="center" justifyContent="flexEnd">
          <ClickableText
            area="liq"
            onClick={(e) => {
              setSortedColumn(SORT_FIELD.LIQ)
              setSortDirection(sortedColumn !== SORT_FIELD.LIQ ? true : !sortDirection)
            }}
          >
            Liquidity (WNOVA) {sortedColumn === SORT_FIELD.LIQ ? (!sortDirection ? '↑' : '↓') : ''}
          </ClickableText>
        </Flex>
        <Flex alignItems="center">
          <ClickableText
            area="vol"
            onClick={(e) => {
              setSortedColumn(SORT_FIELD.VOL)
              setSortDirection(sortedColumn !== SORT_FIELD.VOL ? true : !sortDirection)
            }}
          >
            Volume (24hrs, WNOVA)
            {sortedColumn === SORT_FIELD.VOL ? (!sortDirection ? '↑' : '↓') : ''}
          </ClickableText>
        </Flex>
        {!below1080 && (
          <Flex alignItems="center" justifyContent="flexEnd">
            <ClickableText
              area="volWeek"
              onClick={(e) => {
                setSortedColumn(SORT_FIELD.VOL_7DAYS)
                setSortDirection(sortedColumn !== SORT_FIELD.VOL_7DAYS ? true : !sortDirection)
              }}
            >
              Volume (7d, WNOVA) {sortedColumn === SORT_FIELD.VOL_7DAYS ? (!sortDirection ? '↑' : '↓') : ''}
            </ClickableText>
          </Flex>
        )}
        {!below1080 && (
          <Flex alignItems="center" justifyContent="flexEnd">
            <ClickableText
              area="fees"
              onClick={(e) => {
                setSortedColumn(SORT_FIELD.FEES)
                setSortDirection(sortedColumn !== SORT_FIELD.FEES ? true : !sortDirection)
              }}
            >
              Fees (24hr, WNOVA) {sortedColumn === SORT_FIELD.FEES ? (!sortDirection ? '↑' : '↓') : ''}
            </ClickableText>
          </Flex>
        )}
        {!below1080 && (
          <Flex alignItems="center" justifyContent="flexEnd">
            <ClickableText
              area="apy"
              onClick={(e) => {
                setSortedColumn(SORT_FIELD.APY)
                setSortDirection(sortedColumn !== SORT_FIELD.APY ? true : !sortDirection)
              }}
            >
              1y Fees / Liquidity {sortedColumn === SORT_FIELD.APY ? (!sortDirection ? '↑' : '↓') : ''}
            </ClickableText>
            <QuestionHelper text={'Based on 24hr volume annualized'} />
          </Flex>
        )}
      </DashGrid>
      <Divider />
      <List p={0}>
        {!safePairList ? (
          <LocalLoader />
        ) : safePairList.length ? (
          safePairList
        ) : (
          <TYPE.light style={{ padding: '1rem' }}>No pairs yet.</TYPE.light>
        )}
      </List>
      <PageButtons>
        <div
          onClick={(e) => {
            setPage(page === 1 ? page : page - 1)
          }}
        >
          <Arrow faded={page === 1 ? true : false}>←</Arrow>
        </div>
        <TYPE.body>{'Page ' + page + ' of ' + maxPage}</TYPE.body>
        <div
          onClick={(e) => {
            setPage(page === maxPage ? page : page + 1)
          }}
        >
          <Arrow faded={page === maxPage ? true : false}>→</Arrow>
        </div>
      </PageButtons>
      {debugInfo && (
        <TYPE.light fontSize={'10px'} style={{ padding: '0 1.125rem 1rem', opacity: 0.7 }}>
          Debug: {JSON.stringify(debugInfo)}
        </TYPE.light>
      )}
    </ListWrapper>
  )
}

export default withRouter(PairList)
