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
import { formattedNum, formattedPercent } from '../../utils'
import DoubleTokenLogo from '../DoubleLogo'
import FormattedName from '../FormattedName'
import QuestionHelper from '../QuestionHelper'
import { TYPE } from '../../Theme'
import { PAIR_BLACKLIST } from '../../constants'
import { AutoColumn } from '../Column'
import { WRAPPED_NATIVE_ADDRESS, TONY_ADDRESS, PAIR_ADDRESS } from '../../constants/urls'

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

  const resolvedPairs = React.useMemo(() => {
    if (pairs && Object.keys(pairs).length) return pairs
    if (!PAIR_ADDRESS || !WRAPPED_NATIVE_ADDRESS || !TONY_ADDRESS) return pairs
    return {
      [PAIR_ADDRESS]: {
        id: PAIR_ADDRESS,
        token0: { id: TONY_ADDRESS, symbol: 'TONY', name: 'STARK - IRON MAN' },
        token1: { id: WRAPPED_NATIVE_ADDRESS, symbol: 'WNOVA', name: 'Wrapped NOVA' },
        trackedReserveETH: 0,
        reserveETH: 0,
        oneDayVolumeETH: 0,
        oneWeekVolumeETH: 0,
        oneDayVolumeToken0: 0,
        oneDayVolumeToken1: 0,
      },
    }
  }, [pairs])

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

  const getLiquidityValue = (pairData) => {
    if (!pairData) return 0
    const trackedEth = parseFloat(pairData.trackedReserveETH ?? 0)
    const reserveEth = parseFloat(pairData.reserveETH ?? 0)
    if (trackedEth > 0) return trackedEth
    if (reserveEth > 0) return reserveEth
    const trackedUsd = parseFloat(pairData.trackedReserveUSD ?? 0)
    const reserveUsd = parseFloat(pairData.reserveUSD ?? 0)
    return trackedUsd > 0 ? trackedUsd : reserveUsd
  }

  const getVolumeValue = (pairData) => {
    if (!pairData) return 0
    const token0Id = pairData.token0?.id?.toLowerCase?.() || ''
    const token1Id = pairData.token1?.id?.toLowerCase?.() || ''
    if (token0Id === WRAPPED_NATIVE_ADDRESS && pairData.oneDayVolumeToken0) {
      return parseFloat(pairData.oneDayVolumeToken0)
    }
    if (token1Id === WRAPPED_NATIVE_ADDRESS && pairData.oneDayVolumeToken1) {
      return parseFloat(pairData.oneDayVolumeToken1)
    }
    return parseFloat(pairData.oneDayVolumeETH ?? 0)
  }

  const ListItem = ({ pairAddress, index }) => {
    const pairData = resolvedPairs[pairAddress]

    if (pairData && pairData.token0 && pairData.token1) {
      const liquidityValue = getLiquidityValue(pairData)
      const volumeValue = getVolumeValue(pairData)
      const liquidity = liquidityValue ? formattedNum(liquidityValue, false) : '—'
      const volume = volumeValue ? formattedNum(volumeValue, false) : '—'

      const weekVolumeValue = parseFloat(pairData.oneWeekVolumeETH ?? 0)
      const weekVolume = weekVolumeValue ? formattedNum(weekVolumeValue, false) : '—'

      const feesValue = volumeValue ? volumeValue * 0.003 : 0
      const fees = feesValue ? formattedNum(feesValue, false) : '—'

      const apyBase = liquidityValue > 0 ? (feesValue * 365 * 100) / liquidityValue : 0
      const apy = apyBase ? formattedPercent(apyBase) : '—'

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
          <DataText area="liq">{formatDataText(liquidity, pairData.trackedReserveETH)}</DataText>
          <DataText area="vol">{formatDataText(volume, pairData.oneDayVolumeETH)}</DataText>
          {!below1080 && <DataText area="volWeek">{formatDataText(weekVolume, pairData.oneWeekVolumeETH)}</DataText>}
          {!below1080 && <DataText area="fees">{formatDataText(fees, pairData.oneDayVolumeETH)}</DataText>}
          {!below1080 && <DataText area="apy">{formatDataText(apy, pairData.oneDayVolumeETH, true)}</DataText>}
        </DashGrid>
      )
    } else {
      return ''
    }
  }

  const pairList =
    resolvedPairs &&
    Object.keys(resolvedPairs)
      .filter((address) => {
        if (PAIR_BLACKLIST.includes(address)) return false
        const entry = resolvedPairs[address]
        if (!entry) return false
        if (!useTracked) return true
        return !!entry.trackedReserveETH || !!entry.trackedReserveUSD
      })
      .sort((addressA, addressB) => {
        const pairA = resolvedPairs[addressA]
        const pairB = resolvedPairs[addressB]
        if (!pairA || !pairB) return 0
        if (sortedColumn === SORT_FIELD.APY) {
          const base0 = getLiquidityValue(pairA)
          const base1 = getLiquidityValue(pairB)
          const vol0 = getVolumeValue(pairA)
          const vol1 = getVolumeValue(pairB)
          const apy0 = base0 ? (vol0 * 0.003 * 356 * 100) / base0 : 0
          const apy1 = base1 ? (vol1 * 0.003 * 356 * 100) / base1 : 0
          return apy0 > apy1 ? (sortDirection ? -1 : 1) * 1 : (sortDirection ? -1 : 1) * -1
        }
        return parseFloat(pairA[FIELD_TO_VALUE(sortedColumn, useTracked)]) >
          parseFloat(pairB[FIELD_TO_VALUE(sortedColumn, useTracked)])
          ? (sortDirection ? -1 : 1) * 1
          : (sortDirection ? -1 : 1) * -1
      })
      .slice(ITEMS_PER_PAGE * (page - 1), page * ITEMS_PER_PAGE)
      .map((pairAddress, index) => {
        return (
          pairAddress && (
            <div key={index} data-testid={`pair-row-${pairAddress}`}>
              <ListItem index={(page - 1) * ITEMS_PER_PAGE + index + 1} pairAddress={pairAddress} />
              <Divider />
            </div>
          )
        )
      })

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
        {!pairList ? (
          <LocalLoader />
        ) : pairList.length ? (
          pairList
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
