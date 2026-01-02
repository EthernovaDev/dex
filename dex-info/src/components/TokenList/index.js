import React, { useState, useEffect, useMemo } from 'react'
import styled from 'styled-components'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'

import { Box, Flex, Text } from 'rebass'
import TokenLogo from '../TokenLogo'
import { CustomLink } from '../Link'
import Row from '../Row'
import { Divider } from '..'

import { formattedNum, formattedPercent, formatPrice, isFiniteNum, toNum, normAddr, isAddrEq } from '../../utils'
import { useMedia } from 'react-use'
import { withRouter } from 'react-router-dom'
import { TOKEN_BLACKLIST } from '../../constants'
import FormattedName from '../FormattedName'
import { TYPE } from '../../Theme'
import { WRAPPED_NATIVE_ADDRESS, TONY_ADDRESS, PAIR_ADDRESS } from '../../constants/urls'
import { useAllPairData, usePairData } from '../../contexts/PairData'

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
  const isWnova = isAddrEq(token.id, WRAPPED_NATIVE_ADDRESS)
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
  const allPairs = useAllPairData()
  const pinnedPair = usePairData(PAIR_ADDRESS)
  const wnovaLower = normAddr(WRAPPED_NATIVE_ADDRESS)
  const tonyLower = normAddr(TONY_ADDRESS)

  const pairMetrics = useMemo(() => {
    const metricsByToken = {}
    let totalWnovaLiquidity = 0
    let totalWnovaVolume = 0
    if (!allPairs || !wnovaLower) {
      return { metricsByToken, totalWnovaLiquidity, totalWnovaVolume }
    }
    Object.values(allPairs).forEach((pair) => {
      const token0Id = normAddr(pair?.token0?.id)
      const token1Id = normAddr(pair?.token1?.id)
      if (!token0Id || !token1Id) return
      const isToken0Wnova = isAddrEq(token0Id, wnovaLower)
      const isToken1Wnova = isAddrEq(token1Id, wnovaLower)
      if (!isToken0Wnova && !isToken1Wnova) return

      const reserve0 = toNum(pair?.reserve0 ?? null, NaN)
      const reserve1 = toNum(pair?.reserve1 ?? null, NaN)
      if (!Number.isFinite(reserve0) || !Number.isFinite(reserve1)) return

      const reserveWnova = isToken0Wnova ? reserve0 : reserve1
      const reserveToken = isToken0Wnova ? reserve1 : reserve0
      const tokenId = isToken0Wnova ? token1Id : token0Id

      const priceWnova = reserveToken > 0 ? reserveWnova / reserveToken : NaN
      const volEth = toNum(pair?.oneDayVolumeETH ?? pair?.volumeETH ?? null, NaN)
      const volToken0 = toNum(pair?.oneDayVolumeToken0 ?? pair?.volumeToken0 ?? null, NaN)
      const volToken1 = toNum(pair?.oneDayVolumeToken1 ?? pair?.volumeToken1 ?? null, NaN)
      const volumeWnova = Number.isFinite(volEth)
        ? volEth
        : isToken0Wnova
        ? Number.isFinite(volToken0)
          ? volToken0
          : 0
        : Number.isFinite(volToken1)
        ? volToken1
        : 0

      if (Number.isFinite(reserveWnova)) totalWnovaLiquidity += reserveWnova
      if (Number.isFinite(volumeWnova)) totalWnovaVolume += volumeWnova

      const existing = metricsByToken[tokenId] || {
        liquidityWnova: 0,
        volume24hWnova: 0,
        priceWnova: null,
        bestReserveWnova: 0,
      }
      const nextLiquidity = existing.liquidityWnova + (Number.isFinite(reserveWnova) ? reserveWnova : 0)
      const nextVolume = existing.volume24hWnova + (Number.isFinite(volumeWnova) ? volumeWnova : 0)
      let price = existing.priceWnova
      let bestReserveWnova = existing.bestReserveWnova
      if (Number.isFinite(reserveWnova) && reserveWnova > bestReserveWnova && Number.isFinite(priceWnova)) {
        price = priceWnova
        bestReserveWnova = reserveWnova
      }

      metricsByToken[tokenId] = {
        liquidityWnova: nextLiquidity,
        volume24hWnova: nextVolume,
        priceWnova: price,
        bestReserveWnova,
      }
    })

    if (wnovaLower) {
      const existing = metricsByToken[wnovaLower] || {
        liquidityWnova: 0,
        volume24hWnova: 0,
        priceWnova: 1,
        bestReserveWnova: 0,
      }
      metricsByToken[wnovaLower] = {
        liquidityWnova: totalWnovaLiquidity || existing.liquidityWnova,
        volume24hWnova: totalWnovaVolume || existing.volume24hWnova,
        priceWnova: 1,
        bestReserveWnova: Math.max(existing.bestReserveWnova || 0, totalWnovaLiquidity || 0),
      }
    }

    return { metricsByToken, totalWnovaLiquidity, totalWnovaVolume }
  }, [allPairs, wnovaLower])

  const metricsByToken = pairMetrics.metricsByToken || {}

  const pinnedToken0 = normAddr(pinnedPair?.token0?.id)
  const pinnedToken1 = normAddr(pinnedPair?.token1?.id)
  const reserve0 = toNum(pinnedPair?.reserve0 ?? null, 0)
  const reserve1 = toNum(pinnedPair?.reserve1 ?? null, 0)
  const isToken0Wnova = isAddrEq(pinnedToken0, wnovaLower)
  const isToken1Wnova = isAddrEq(pinnedToken1, wnovaLower)
  const reserveWnova = isToken0Wnova ? reserve0 : isToken1Wnova ? reserve1 : 0
  const reserveTony = isToken0Wnova ? reserve1 : isToken1Wnova ? reserve0 : 0
  const tonyPriceWnova =
    Number.isFinite(metricsByToken?.[tonyLower]?.priceWnova) && metricsByToken?.[tonyLower]?.priceWnova > 0
      ? metricsByToken[tonyLower].priceWnova
      : reserveWnova > 0 && reserveTony > 0
      ? reserveWnova / reserveTony
      : 0
  let pairVolumeWnova =
    Number.isFinite(metricsByToken?.[tonyLower]?.volume24hWnova) && metricsByToken?.[tonyLower]?.volume24hWnova > 0
      ? metricsByToken[tonyLower].volume24hWnova
      : 0
  if (!pairVolumeWnova) {
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
      const tokenId = normAddr(token?.id)
      if (!tokenId) return token
      const metrics = metricsByToken?.[tokenId]

      if (isAddrEq(tokenId, wnovaLower)) {
        return {
          ...token,
          derivedETH: 1,
          priceETH: 1,
          totalLiquidityETH: Number.isFinite(metrics?.liquidityWnova)
            ? metrics.liquidityWnova
            : reserveWnova > 0
            ? reserveWnova
            : token.totalLiquidityETH ?? 0,
          oneDayVolumeETH: Number.isFinite(metrics?.volume24hWnova)
            ? metrics.volume24hWnova
            : pairVolumeWnova > 0
            ? pairVolumeWnova
            : token.oneDayVolumeETH ?? 0,
          priceChangeETH: token.priceChangeETH ?? 0,
        }
      }
      if (isAddrEq(tokenId, tonyLower)) {
        return {
          ...token,
          derivedETH:
            (Number.isFinite(metrics?.priceWnova) && metrics.priceWnova) ||
            tonyPriceWnova ||
            token.derivedETH ||
            0,
          priceETH:
            (Number.isFinite(metrics?.priceWnova) && metrics.priceWnova) ||
            tonyPriceWnova ||
            token.priceETH ||
            0,
          totalLiquidityETH:
            Number.isFinite(metrics?.liquidityWnova) && metrics.liquidityWnova > 0
              ? metrics.liquidityWnova
              : reserveWnova > 0
              ? reserveWnova
              : token.totalLiquidityETH ?? 0,
          oneDayVolumeETH:
            Number.isFinite(metrics?.volume24hWnova) && metrics.volume24hWnova > 0
              ? metrics.volume24hWnova
              : pairVolumeWnova > 0
              ? pairVolumeWnova
              : token.oneDayVolumeETH ?? 0,
          priceChangeETH: token.priceChangeETH ?? 0,
        }
      }
      if (metrics) {
        return {
          ...token,
          derivedETH:
            Number.isFinite(metrics.priceWnova) && metrics.priceWnova > 0 ? metrics.priceWnova : token.derivedETH,
          priceETH:
            Number.isFinite(metrics.priceWnova) && metrics.priceWnova > 0 ? metrics.priceWnova : token.priceETH,
          totalLiquidityETH:
            Number.isFinite(metrics.liquidityWnova) && metrics.liquidityWnova >= 0
              ? metrics.liquidityWnova
              : token.totalLiquidityETH,
          oneDayVolumeETH:
            Number.isFinite(metrics.volume24hWnova) && metrics.volume24hWnova >= 0
              ? metrics.volume24hWnova
              : token.oneDayVolumeETH,
        }
      }
      return token
    }

    if (fromSubgraph && fromSubgraph.length) {
      return fromSubgraph.map(applyOverrides)
    }

    const fallback = []
    if (wnovaLower) {
      fallback.push(
        applyOverrides({
          id: wnovaLower,
          symbol: 'WNOVA',
          name: 'Wrapped NOVA',
          derivedETH: 1,
          priceETH: 1,
          totalLiquidity: 0,
          totalLiquidityETH:
            Number.isFinite(metricsByToken?.[wnovaLower]?.liquidityWnova) && metricsByToken[wnovaLower].liquidityWnova > 0
              ? metricsByToken[wnovaLower].liquidityWnova
              : reserveWnova > 0
              ? reserveWnova
              : 0,
          oneDayVolumeETH:
            Number.isFinite(metricsByToken?.[wnovaLower]?.volume24hWnova) && metricsByToken[wnovaLower].volume24hWnova > 0
              ? metricsByToken[wnovaLower].volume24hWnova
              : pairVolumeWnova > 0
              ? pairVolumeWnova
              : 0,
          priceChangeETH: 0,
        })
      )
    }
    if (tonyLower) {
      fallback.push(
        applyOverrides({
          id: tonyLower,
          symbol: 'TONY',
          name: 'STARK - IRON MAN',
          derivedETH: tonyPriceWnova || 0,
          priceETH: tonyPriceWnova || 0,
          totalLiquidity: 0,
          totalLiquidityETH:
            Number.isFinite(metricsByToken?.[tonyLower]?.liquidityWnova) && metricsByToken[tonyLower].liquidityWnova > 0
              ? metricsByToken[tonyLower].liquidityWnova
              : reserveWnova > 0
              ? reserveWnova
              : 0,
          oneDayVolumeETH:
            Number.isFinite(metricsByToken?.[tonyLower]?.volume24hWnova) && metricsByToken[tonyLower].volume24hWnova > 0
              ? metricsByToken[tonyLower].volume24hWnova
              : pairVolumeWnova > 0
              ? pairVolumeWnova
              : 0,
          priceChangeETH: 0,
        })
      )
    }
    return fallback
  }, [
    tokens,
    reserveWnova,
    pairVolumeWnova,
    tonyPriceWnova,
    metricsByToken,
    wnovaLower,
    tonyLower,
  ])

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
