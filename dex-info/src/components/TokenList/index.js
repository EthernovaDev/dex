import React, { useState, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import { Box, Flex, Text } from 'rebass'
import TokenLogo from '../TokenLogo'
import { CustomLink } from '../Link'
import Row from '../Row'
import { Divider } from '..'

import { formattedNum, formattedPercent, formatPrice, isFiniteNum, toNum } from '../../utils'
import { useMedia } from 'react-use'
import { withRouter } from 'react-router-dom'
import { TOKEN_BLACKLIST } from '../../constants'
import FormattedName from '../FormattedName'
import { TYPE } from '../../Theme'
import { WRAPPED_NATIVE_ADDRESS, TONY_ADDRESS, PAIR_ADDRESS } from '../../constants/urls'
import { usePairData } from '../../contexts/PairData'

dayjs.extend(utc)

const PageButtons = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  margin-top: 2em;
  margin-bottom: 2em;
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

  > * {
    justify-content: flex-end;

    &:first-child {
      justify-content: flex-start;
      text-align: left;
      width: 100px;
    }
  }

  @media screen and (min-width: 680px) {
    display: grid;
    grid-gap: 1em;
    grid-template-columns: 180px 1fr 1fr 1fr;
    grid-template-areas: 'name symbol liq vol ';

    > * {
      justify-content: flex-end;
      width: 100%;

      &:first-child {
        justify-content: flex-start;
      }
    }
  }

  @media screen and (min-width: 1080px) {
    display: grid;
    grid-gap: 0.5em;
    grid-template-columns: 1.5fr 0.6fr 1fr 1fr 1fr 1fr;
    grid-template-areas: 'name symbol liq vol price change';
  }
`

const ListWrapper = styled.div``

const ClickableText = styled(Text)`
  text-align: end;
  &:hover {
    cursor: pointer;
    opacity: 0.6;
  }
  user-select: none;
  color: ${({ theme }) => theme.text1} !important;
  @media screen and (max-width: 640px) {
    font-size: 0.85rem;
  }
`

const DataText = styled(Flex)`
  align-items: center;
  text-align: center;
  color: ${({ theme }) => theme.text1} !important;

  & > * {
    font-size: 14px;
  }

  @media screen and (max-width: 600px) {
    font-size: 12px;
  }
`

const SORT_FIELD = {
  LIQ: 'totalLiquidityETH',
  VOL: 'oneDayVolumeETH',
  VOL_UT: 'oneDayVolumeUT',
  SYMBOL: 'symbol',
  NAME: 'name',
  PRICE: 'priceETH',
  CHANGE: 'priceChangeETH',
}

const getTokenMetrics = (token) => {
  if (!token) return { price: null, liquidity: null, volume: null }
  const isWnova = token.id?.toLowerCase?.() === WRAPPED_NATIVE_ADDRESS
  const price = toNum(token.priceETH ?? token.derivedETH ?? (isWnova ? 1 : null), null)
  let liquidity = toNum(token.totalLiquidityETH ?? null, null)
  if (!Number.isFinite(liquidity) || liquidity === 0) {
    const rawLiquidity = toNum(token.totalLiquidity ?? null, null)
    if (Number.isFinite(rawLiquidity) && rawLiquidity > 0 && Number.isFinite(price) && price > 0) {
      liquidity = rawLiquidity * price
    }
  }

  let volume = toNum(token.oneDayVolumeETH ?? null, null)
  if (!Number.isFinite(volume) || volume === 0) {
    const tradeVolume = toNum(token.tradeVolume ?? null, null)
    const priorTrade = toNum(token.oneDayData?.tradeVolume ?? null, 0)
    const oneDayVolume = Number.isFinite(tradeVolume) ? tradeVolume - priorTrade : null
    if (Number.isFinite(oneDayVolume) && oneDayVolume > 0 && Number.isFinite(price) && price > 0) {
      volume = oneDayVolume * price
    }
  }

  return { price, liquidity, volume }
}

// @TODO rework into virtualized list
function TopTokenList({ tokens, itemMax = 10, useTracked = false }) {
  // page state
  const [page, setPage] = useState(1)
  const [maxPage, setMaxPage] = useState(1)

  // sorting
  const [sortDirection, setSortDirection] = useState(true)
  const [sortedColumn, setSortedColumn] = useState(SORT_FIELD.VOL)

  const below1080 = useMedia('(max-width: 1080px)')
  const below680 = useMedia('(max-width: 680px)')
  const below600 = useMedia('(max-width: 600px)')
  const pinnedPair = usePairData(PAIR_ADDRESS)
  const pinnedToken0 = pinnedPair?.token0?.id?.toLowerCase?.()
  const pinnedToken1 = pinnedPair?.token1?.id?.toLowerCase?.()
  const reserve0 = toNum(pinnedPair?.reserve0 ?? null, 0)
  const reserve1 = toNum(pinnedPair?.reserve1 ?? null, 0)
  const isToken0Wnova = pinnedToken0 === WRAPPED_NATIVE_ADDRESS
  const isToken1Wnova = pinnedToken1 === WRAPPED_NATIVE_ADDRESS
  const reserveWnova = isToken0Wnova ? reserve0 : isToken1Wnova ? reserve1 : 0
  const reserveTony = isToken0Wnova ? reserve1 : isToken1Wnova ? reserve0 : 0
  const tonyPriceWnova = reserveWnova > 0 && reserveTony > 0 ? reserveWnova / reserveTony : 0
  let pairVolumeWnova = 0
  if (isToken0Wnova) {
    pairVolumeWnova = toNum(
      pinnedPair?.oneDayVolumeToken0 ?? pinnedPair?.oneDayVolumeETH ?? pinnedPair?.volumeToken0 ?? null,
      0
    )
  } else if (isToken1Wnova) {
    pairVolumeWnova = toNum(
      pinnedPair?.oneDayVolumeToken1 ?? pinnedPair?.oneDayVolumeETH ?? pinnedPair?.volumeToken1 ?? null,
      0
    )
  }
  const debug =
    typeof window !== 'undefined' && window.location && window.location.search && window.location.search.includes('debug=1')

  useEffect(() => {
    setMaxPage(1) // edit this to do modular
    setPage(1)
  }, [tokens, reserveWnova, pairVolumeWnova, tonyPriceWnova])

  const formattedTokens = useMemo(() => {
    const fromSubgraph =
      tokens &&
      Object.keys(tokens)
        .filter((key) => {
          return !TOKEN_BLACKLIST.includes(key)
        })
        .map((key) => tokens[key])

    const applyOverrides = (token) => {
      const tokenId = token?.id?.toLowerCase?.()
      if (!tokenId) return token
      if (tokenId === WRAPPED_NATIVE_ADDRESS) {
        return {
          ...token,
          derivedETH: 1,
          priceETH: 1,
          totalLiquidityETH: reserveWnova > 0 ? reserveWnova : token.totalLiquidityETH ?? 0,
          oneDayVolumeETH: pairVolumeWnova > 0 ? pairVolumeWnova : token.oneDayVolumeETH ?? 0,
          priceChangeETH: token.priceChangeETH ?? 0,
        }
      }
      if (tokenId === TONY_ADDRESS) {
        return {
          ...token,
          derivedETH: tonyPriceWnova || token.derivedETH || 0,
          priceETH: tonyPriceWnova || token.priceETH || 0,
          totalLiquidityETH: reserveWnova > 0 ? reserveWnova : token.totalLiquidityETH ?? 0,
          oneDayVolumeETH: pairVolumeWnova > 0 ? pairVolumeWnova : token.oneDayVolumeETH ?? 0,
          priceChangeETH: token.priceChangeETH ?? 0,
        }
      }
      return token
    }

    if (fromSubgraph && fromSubgraph.length) {
      return fromSubgraph.map(applyOverrides)
    }

    const fallback = []
    if (WRAPPED_NATIVE_ADDRESS) {
      fallback.push(
        applyOverrides({
          id: WRAPPED_NATIVE_ADDRESS,
          symbol: 'WNOVA',
          name: 'Wrapped NOVA',
          derivedETH: 1,
          priceETH: 1,
          totalLiquidity: 0,
          totalLiquidityETH: reserveWnova > 0 ? reserveWnova : 0,
          oneDayVolumeETH: pairVolumeWnova > 0 ? pairVolumeWnova : 0,
          priceChangeETH: 0,
        })
      )
    }
    if (TONY_ADDRESS) {
      fallback.push(
        applyOverrides({
          id: TONY_ADDRESS,
          symbol: 'TONY',
          name: 'STARK - IRON MAN',
          derivedETH: tonyPriceWnova || 0,
          priceETH: tonyPriceWnova || 0,
          totalLiquidity: 0,
          totalLiquidityETH: reserveWnova > 0 ? reserveWnova : 0,
          oneDayVolumeETH: pairVolumeWnova > 0 ? pairVolumeWnova : 0,
          priceChangeETH: 0,
        })
      )
    }
    return fallback
  }, [tokens, reserveWnova, pairVolumeWnova, tonyPriceWnova])

  const tokensWithMetrics = useMemo(() => {
    return (formattedTokens || []).map((token) => ({
      ...token,
      _metrics: getTokenMetrics(token),
    }))
  }, [formattedTokens])

  useEffect(() => {
    if (tokens && formattedTokens) {
      let extraPages = 1
      if (formattedTokens.length % itemMax === 0) {
        extraPages = 0
      }
      setMaxPage(Math.max(1, Math.floor(formattedTokens.length / itemMax) + extraPages))
    }
  }, [tokens, formattedTokens, itemMax])

  const filteredList = useMemo(() => {
    return (
      tokensWithMetrics &&
      tokensWithMetrics
        .sort((a, b) => {
          if (sortedColumn === SORT_FIELD.SYMBOL || sortedColumn === SORT_FIELD.NAME) {
            return a[sortedColumn] > b[sortedColumn] ? (sortDirection ? -1 : 1) * 1 : (sortDirection ? -1 : 1) * -1
          }
          const aMetrics = a._metrics || {}
          const bMetrics = b._metrics || {}
          const aValue =
            sortedColumn === SORT_FIELD.PRICE
              ? aMetrics.price
              : sortedColumn === SORT_FIELD.LIQ
              ? aMetrics.liquidity
              : sortedColumn === SORT_FIELD.VOL || sortedColumn === SORT_FIELD.VOL_UT
              ? aMetrics.volume
              : toNum(a[sortedColumn] ?? 0, 0)
          const bValue =
            sortedColumn === SORT_FIELD.PRICE
              ? bMetrics.price
              : sortedColumn === SORT_FIELD.LIQ
              ? bMetrics.liquidity
              : sortedColumn === SORT_FIELD.VOL || sortedColumn === SORT_FIELD.VOL_UT
              ? bMetrics.volume
              : toNum(b[sortedColumn] ?? 0, 0)

          const safeA = Number.isFinite(aValue) ? aValue : -Infinity
          const safeB = Number.isFinite(bValue) ? bValue : -Infinity
          if (safeA === safeB) return 0
          return safeA > safeB ? (sortDirection ? -1 : 1) * 1 : (sortDirection ? -1 : 1) * -1
        })
        .slice(itemMax * (page - 1), page * itemMax)
    )
  }, [tokensWithMetrics, itemMax, page, sortDirection, sortedColumn])

  const ListItem = ({ item, index }) => {
    const metrics = item._metrics || getTokenMetrics(item)
    const liquidityValue = metrics.liquidity
    const volumeValue = metrics.volume
    const priceValue = metrics.price
    return (
      <DashGrid style={{ height: '48px' }} focus={true}>
        <DataText area="name" fontWeight="500">
          <Row>
            {!below680 && <div style={{ marginRight: '1rem', width: '10px' }}>{index}</div>}
            <TokenLogo address={item.id} />
            <CustomLink style={{ marginLeft: '16px', whiteSpace: 'nowrap' }} to={'/token/' + item.id}>
              <FormattedName
                text={below680 ? item.symbol : item.name}
                maxCharacters={below600 ? 8 : 16}
                adjustSize={true}
                link={true}
              />
            </CustomLink>
          </Row>
        </DataText>
        {!below680 && (
          <DataText area="symbol" color="text" fontWeight="500">
            <FormattedName text={item.symbol} maxCharacters={5} />
          </DataText>
        )}
        <DataText area="liq" data-testid={`token-liquidity-${item.id?.toLowerCase?.() || item.id}`}>
          {isFiniteNum(liquidityValue) ? formattedNum(liquidityValue, false) : '—'}
        </DataText>
        <DataText area="vol" data-testid={`token-volume-${item.id?.toLowerCase?.() || item.id}`}>
          {isFiniteNum(volumeValue) ? formattedNum(volumeValue, false) : '—'}
        </DataText>
        {!below1080 && (
          <DataText area="price" color="text" fontWeight="500" data-testid={`token-price-${item.id?.toLowerCase?.() || item.id}`}>
            {isFiniteNum(priceValue) ? formatPrice(priceValue) : '—'}
          </DataText>
        )}
        {!below1080 && <DataText area="change">{formattedPercent(item.priceChangeETH)}</DataText>}
      </DashGrid>
    )
  }

  return (
    <ListWrapper>
      <DashGrid center={true} style={{ height: 'fit-content', padding: '0 1.125rem 1rem 1.125rem' }}>
        <Flex alignItems="center" justifyContent="flexStart">
          <ClickableText
            color="text"
            area="name"
            fontWeight="500"
            onClick={(e) => {
              setSortedColumn(SORT_FIELD.NAME)
              setSortDirection(sortedColumn !== SORT_FIELD.NAME ? true : !sortDirection)
            }}
          >
            {below680 ? 'Symbol' : 'Name'} {sortedColumn === SORT_FIELD.NAME ? (!sortDirection ? '↑' : '↓') : ''}
          </ClickableText>
        </Flex>
        {!below680 && (
          <Flex alignItems="center">
            <ClickableText
              area="symbol"
              onClick={() => {
                setSortedColumn(SORT_FIELD.SYMBOL)
                setSortDirection(sortedColumn !== SORT_FIELD.SYMBOL ? true : !sortDirection)
              }}
            >
              Symbol {sortedColumn === SORT_FIELD.SYMBOL ? (!sortDirection ? '↑' : '↓') : ''}
            </ClickableText>
          </Flex>
        )}

        <Flex alignItems="center">
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
            onClick={() => {
              setSortedColumn(useTracked ? SORT_FIELD.VOL_UT : SORT_FIELD.VOL)
              setSortDirection(
                sortedColumn !== (useTracked ? SORT_FIELD.VOL_UT : SORT_FIELD.VOL) ? true : !sortDirection
              )
            }}
          >
            Volume (24hrs, WNOVA)
            {sortedColumn === (useTracked ? SORT_FIELD.VOL_UT : SORT_FIELD.VOL) ? (!sortDirection ? '↑' : '↓') : ''}
          </ClickableText>
        </Flex>
        {!below1080 && (
          <Flex alignItems="center">
            <ClickableText
              area="price"
              onClick={(e) => {
                setSortedColumn(SORT_FIELD.PRICE)
                setSortDirection(sortedColumn !== SORT_FIELD.PRICE ? true : !sortDirection)
              }}
            >
              Price (WNOVA) {sortedColumn === SORT_FIELD.PRICE ? (!sortDirection ? '↑' : '↓') : ''}
            </ClickableText>
          </Flex>
        )}
        {!below1080 && (
          <Flex alignItems="center">
            <ClickableText
              area="change"
              onClick={(e) => {
                setSortedColumn(SORT_FIELD.CHANGE)
                setSortDirection(sortedColumn !== SORT_FIELD.CHANGE ? true : !sortDirection)
              }}
            >
              Price Change (24hrs)
              {sortedColumn === SORT_FIELD.CHANGE ? (!sortDirection ? '↑' : '↓') : ''}
            </ClickableText>
          </Flex>
        )}
      </DashGrid>
      <Divider />
      <List p={0}>
        {filteredList && filteredList.length ? (
          filteredList.map((item, index) => {
            return (
              <div key={index} data-testid={`token-row-${item.id}`}>
                <ListItem index={(page - 1) * itemMax + index + 1} item={item} />
                <Divider />
              </div>
            )
          })
        ) : (
          <TYPE.light style={{ padding: '1rem' }}>No tokens yet.</TYPE.light>
        )}
      </List>
      <PageButtons>
        <div onClick={() => setPage(page === 1 ? page : page - 1)}>
          <Arrow faded={page === 1 ? true : false}>←</Arrow>
        </div>
        <TYPE.body>{'Page ' + page + ' of ' + maxPage}</TYPE.body>
        <div onClick={() => setPage(page === maxPage ? page : page + 1)}>
          <Arrow faded={page === maxPage ? true : false}>→</Arrow>
        </div>
      </PageButtons>
      {debug && (
        <TYPE.light fontSize={'10px'} style={{ padding: '0 1.125rem 1rem', opacity: 0.7 }}>
          Debug:{' '}
          {JSON.stringify({
            reserveWnova: Number.isFinite(reserveWnova) ? reserveWnova : null,
            tonyPriceWnova: Number.isFinite(tonyPriceWnova) ? tonyPriceWnova : null,
            volume24h: Number.isFinite(pairVolumeWnova) ? pairVolumeWnova : null
          })}
        </TYPE.light>
      )}
    </ListWrapper>
  )
}

export default withRouter(TopTokenList)
