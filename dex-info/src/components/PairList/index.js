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
import { formattedNum, formattedPercent, isFiniteNum } from '../../utils'
import DoubleTokenLogo from '../DoubleLogo'
import FormattedName from '../FormattedName'
import QuestionHelper from '../QuestionHelper'
import { TYPE } from '../../Theme'
import { PAIR_BLACKLIST } from '../../constants'
import { AutoColumn } from '../Column'
import { WRAPPED_NATIVE_ADDRESS, TONY_ADDRESS, PAIR_ADDRESS } from '../../constants/urls'
import { usePairData } from '../../contexts/PairData'
import { FEE_BPS } from '../../constants/base'
import BigNumber from 'bignumber.js'

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

const safeBig = (value) => {
  try {
    return new BigNumber(value || 0)
  } catch {
    return new BigNumber(0)
  }
}

const getPairMetrics = (pairData) => {
  if (!pairData) {
    return {
      liquidity: new BigNumber(0),
      volume24h: new BigNumber(0),
      volume7d: new BigNumber(0),
      fees24h: new BigNumber(0),
      apy: 0,
      hasWnova: false,
    }
  }
  const token0Id = pairData.token0?.id?.toLowerCase?.() || ''
  const token1Id = pairData.token1?.id?.toLowerCase?.() || ''
  const isToken0Wnova = token0Id === WRAPPED_NATIVE_ADDRESS
  const isToken1Wnova = token1Id === WRAPPED_NATIVE_ADDRESS
  const reserve0 = safeBig(pairData.reserve0 ?? 0)
  const reserve1 = safeBig(pairData.reserve1 ?? 0)

  let liquidity = safeBig(pairData.trackedReserveETH ?? 0)
  if (liquidity.isZero()) {
    liquidity = safeBig(pairData.reserveETH ?? 0)
  }

  if (isToken0Wnova || isToken1Wnova) {
    const reserveWnova = isToken0Wnova ? reserve0 : reserve1
    if (reserveWnova.gt(0)) {
      liquidity = reserveWnova
    }
  }

  let volume24h = new BigNumber(0)
  if (isToken0Wnova) {
    volume24h = safeBig(pairData.oneDayVolumeToken0 ?? pairData.oneDayVolumeETH ?? 0)
  } else if (isToken1Wnova) {
    volume24h = safeBig(pairData.oneDayVolumeToken1 ?? pairData.oneDayVolumeETH ?? 0)
  } else {
    volume24h = safeBig(pairData.oneDayVolumeETH ?? 0)
  }

  let volume7d = new BigNumber(0)
  if (isToken0Wnova) {
    volume7d = safeBig(pairData.oneWeekVolumeToken0 ?? pairData.oneWeekVolumeETH ?? 0)
  } else if (isToken1Wnova) {
    volume7d = safeBig(pairData.oneWeekVolumeToken1 ?? pairData.oneWeekVolumeETH ?? 0)
  } else {
    volume7d = safeBig(pairData.oneWeekVolumeETH ?? 0)
  }

  const fees24h = volume24h.gt(0) ? volume24h.multipliedBy(FEE_BPS / 10000) : new BigNumber(0)
  const apy = liquidity.gt(0) ? fees24h.multipliedBy(365).multipliedBy(100).dividedBy(liquidity).toNumber() : 0

  return {
    liquidity,
    volume24h,
    volume7d,
    fees24h,
    apy,
    hasWnova: isToken0Wnova || isToken1Wnova,
  }
}

const formatDataText = (value, trackedValue, supressWarning = false) => {
  const showUntracked = value !== '—' && !trackedValue && !supressWarning
  return (
    <AutoColumn gap="2px" style={{ opacity: showUntracked ? '0.7' : '1' }}>
      <div style={{ textAlign: 'right' }}>{value}</div>
      <TYPE.light fontSize={'9px'} style={{ textAlign: 'right' }}>
        {showUntracked ? 'untracked' : '  '}
      </TYPE.light>
    </AutoColumn>
  )
}

function PairList({ pairs, color, disbaleLinks, maxItems = 10, useTracked = false }) {
  const below600 = useMedia('(max-width: 600px)')
  const below740 = useMedia('(max-width: 740px)')
  const below1080 = useMedia('(max-width: 1080px)')
  const pinnedPair = usePairData(PAIR_ADDRESS)

  const resolvedPairs = React.useMemo(() => {
    if (pairs && Object.keys(pairs).length) return pairs
    if (!PAIR_ADDRESS || !WRAPPED_NATIVE_ADDRESS || !TONY_ADDRESS) return pairs
    if (pinnedPair && pinnedPair.id) {
      return {
        [PAIR_ADDRESS]: pinnedPair,
      }
    }
    return {
      [PAIR_ADDRESS]: {
        id: PAIR_ADDRESS,
        token0: { id: TONY_ADDRESS, symbol: 'TONY', name: 'STARK - IRON MAN' },
        token1: { id: WRAPPED_NATIVE_ADDRESS, symbol: 'WNOVA', name: 'Wrapped NOVA' },
        trackedReserveETH: 0,
        reserveETH: 0,
        reserve0: 0,
        reserve1: 0,
        oneDayVolumeETH: 0,
        oneWeekVolumeETH: 0,
        oneDayVolumeToken0: 0,
        oneDayVolumeToken1: 0,
      },
    }
  }, [pairs, pinnedPair])

  // pagination
  const [page, setPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)
  const ITEMS_PER_PAGE = maxItems

  // sorting
  const [sortDirection, setSortDirection] = useState(true)
  const [sortedColumn, setSortedColumn] = useState(SORT_FIELD.LIQ)

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

  const pairEntries = React.useMemo(() => {
    if (!resolvedPairs) return []
    return Object.keys(resolvedPairs).map((id) => {
      const pairData = resolvedPairs[id]
      return { id, pairData, metrics: getPairMetrics(pairData) }
    })
  }, [resolvedPairs])

  const ListItem = ({ pairAddress, index }) => {
    const pairData = resolvedPairs[pairAddress]
    const metrics = getPairMetrics(pairData)
    const pairKey = pairAddress?.toLowerCase?.() || pairAddress

    if (pairData && pairData.token0 && pairData.token1) {
      const liquidityValue = metrics.liquidity?.isFinite?.() ? metrics.liquidity.toString() : null
      const volumeValue = metrics.volume24h?.isFinite?.() ? metrics.volume24h.toString() : null
      const liquidity = isFiniteNum(liquidityValue) ? formattedNum(liquidityValue, false) : '—'
      const volume = isFiniteNum(volumeValue) ? formattedNum(volumeValue, false) : '—'

      const weekVolumeValue = metrics.volume7d?.isFinite?.() ? metrics.volume7d.toString() : null
      const weekVolume = isFiniteNum(weekVolumeValue) ? formattedNum(weekVolumeValue, false) : '—'

      const feesValue = metrics.fees24h?.isFinite?.() ? metrics.fees24h.toString() : null
      const fees = isFiniteNum(feesValue) ? formattedNum(feesValue, false) : '—'

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
              {formatDataText(fees, metrics.hasWnova)}
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
            ? new BigNumber(metricsA.apy || 0)
            : safeBig(a.pairData?.[FIELD_TO_VALUE(sortedColumn, useTracked)] ?? 0)
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
            ? new BigNumber(metricsB.apy || 0)
            : safeBig(b.pairData?.[FIELD_TO_VALUE(sortedColumn, useTracked)] ?? 0)

        if (valueA.eq(valueB)) return 0
        return valueA.gt(valueB) ? (sortDirection ? -1 : 1) * 1 : (sortDirection ? -1 : 1) * -1
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
    if (!resolvedPairs || !PAIR_ADDRESS) return null
    return (
      Object.keys(resolvedPairs).find((key) => key?.toLowerCase?.() === PAIR_ADDRESS) || PAIR_ADDRESS
    )
  }, [resolvedPairs])

  const safePairList =
    pairList && pairList.length
      ? pairList
      : fallbackPairKey && resolvedPairs?.[fallbackPairKey]
      ? [
          <div key={fallbackPairKey} data-testid={`pair-row-${fallbackPairKey?.toLowerCase?.() || fallbackPairKey}`}>
            <ListItem index={1} pairAddress={fallbackPairKey} />
            <Divider />
          </div>,
        ]
      : pairList

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
    </ListWrapper>
  )
}

export default withRouter(PairList)
