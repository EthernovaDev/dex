import React from 'react'
import styled from 'styled-components'
import { RowFixed, RowBetween } from '../Row'
import { useMedia } from 'react-use'
import { useGlobalData, useGlobalTransactions } from '../../contexts/GlobalData'
import { useLatestBlocks } from '../../contexts/Application'
import { usePairData, useAllPairData } from '../../contexts/PairData'
import { useSpotPriceHistory } from '../../hooks/useSpotPriceHistory'
import { formattedNum, localNumber, formatPrice, isFiniteNum } from '../../utils'
import { PAIR_ADDRESS, WRAPPED_NATIVE_ADDRESS } from '../../constants/urls'
import { FEE_BPS, TREASURY_FEE_BPS } from '../../constants/base'

import { TYPE } from '../../Theme'

const Header = styled.div`
  width: 100%;
  position: sticky;
  top: 0;
`

const Medium = styled.span`
  font-weight: 500;
`

export default function GlobalStats() {
  const below1295 = useMedia('(max-width: 1295px)')
  const below1180 = useMedia('(max-width: 1180px)')
  const below1024 = useMedia('(max-width: 1024px)')
  const below400 = useMedia('(max-width: 400px)')
  const below816 = useMedia('(max-width: 816px)')

  const { oneDayVolumeETH, oneDayTxns, pairCount } = useGlobalData()
  const transactions = useGlobalTransactions()
  const allPairs = useAllPairData()
  const [latestBlock] = useLatestBlocks()
  const subgraphReady = Boolean(latestBlock)
  const rpcUrl = process.env.REACT_APP_RPC_URL
  const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS
  const wnovaAddress = process.env.REACT_APP_WNOVA_ADDRESS
  const tonyAddress = process.env.REACT_APP_TONY_ADDRESS
  const pairAddress = PAIR_ADDRESS || process.env.REACT_APP_PAIR_ADDRESS
  const pairData = usePairData(pairAddress)
  const wnovaLower = WRAPPED_NATIVE_ADDRESS || wnovaAddress?.toLowerCase?.() || ''
  const token0Id = pairData?.token0?.id?.toLowerCase?.()
  const token1Id = pairData?.token1?.id?.toLowerCase?.()
  const reserve0 = Number(pairData?.reserve0 || 0)
  const reserve1 = Number(pairData?.reserve1 || 0)
  let spotFromPair = null
  if (wnovaLower && token0Id && token1Id && reserve0 > 0 && reserve1 > 0) {
    if (token0Id === wnovaLower) {
      spotFromPair = reserve1 / reserve0
    } else if (token1Id === wnovaLower) {
      spotFromPair = reserve0 / reserve1
    }
  }
  const spotHistory = useSpotPriceHistory(subgraphReady ? null : rpcUrl, factoryAddress, wnovaAddress, tonyAddress)
  const spotValue = Number.isFinite(spotFromPair) ? spotFromPair : spotHistory?.lastPrice
  const formattedSpot = spotValue ? formatPrice(spotValue) : '—'
  const nowSec = Math.floor(Date.now() / 1000)
  const recentSwaps = (transactions?.swaps || []).filter((swap) => {
    const ts = Number.parseInt(swap?.transaction?.timestamp || swap?.timestamp || 0, 10)
    if (!ts) return false
    return nowSec - ts <= 86400
  })
  const volumeWnova = recentSwaps.reduce((sum, swap) => {
    const token0Id = swap?.pair?.token0?.id?.toLowerCase?.()
    const token1Id = swap?.pair?.token1?.id?.toLowerCase?.()
    const amount0In = Number(swap?.amount0In || 0)
    const amount0Out = Number(swap?.amount0Out || 0)
    const amount1In = Number(swap?.amount1In || 0)
    const amount1Out = Number(swap?.amount1Out || 0)
    if (token0Id === wnovaLower) return sum + (amount0In > 0 ? amount0In : amount0Out)
    if (token1Id === wnovaLower) return sum + (amount1In > 0 ? amount1In : amount1Out)
    return sum
  }, 0)
  const txns24h = recentSwaps.length || oneDayTxns || 0
  const pairCountWnova = (() => {
    const localCount =
      Object.values(allPairs || {}).filter((pair) => {
        const t0 = pair?.token0?.id?.toLowerCase?.()
        const t1 = pair?.token1?.id?.toLowerCase?.()
        return t0 === wnovaLower || t1 === wnovaLower
      }).length || 0
    const pinnedFallback = pairData?.id ? 1 : 0
    return Math.max(localCount, pairCount || 0, pinnedFallback)
  })()
  const volumeForFees = volumeWnova > 0 ? volumeWnova : oneDayVolumeETH || 0
  const oneDayFees = isFiniteNum(volumeForFees) ? formattedNum(volumeForFees * (FEE_BPS / 10000), false) : '—'
  const protocolFees = isFiniteNum(volumeForFees)
    ? formattedNum(volumeForFees * (TREASURY_FEE_BPS / 10000), false)
    : '—'

  return (
    <Header>
      <RowBetween style={{ padding: below816 ? '0.5rem' : '.5rem' }}>
        <RowFixed>
          {!below400 && (
            <TYPE.main mr={'1rem'} style={{ position: 'relative' }}>
              Pool price (TONY/WNOVA): <Medium>{formattedSpot}</Medium>
            </TYPE.main>
          )}

          {!below1180 && (
            <TYPE.main mr={'1rem'}>
              Transactions (24H): <Medium>{localNumber(txns24h)}</Medium>
            </TYPE.main>
          )}
          {!below1024 && (
            <TYPE.main mr={'1rem'}>
              Pairs: <Medium>{localNumber(pairCountWnova)}</Medium>
            </TYPE.main>
          )}
          {!below1295 && (
            <TYPE.main mr={'1rem'}>
              Fees (24H, WNOVA): <Medium>{oneDayFees}</Medium>&nbsp;
            </TYPE.main>
          )}
          {!below1295 && (
            <TYPE.main mr={'1rem'}>
              Treasury (24H, WNOVA): <Medium>{protocolFees}</Medium>&nbsp;
            </TYPE.main>
          )}
        </RowFixed>
      </RowBetween>
    </Header>
  )
}
