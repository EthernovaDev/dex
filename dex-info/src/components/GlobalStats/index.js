import React from 'react'
import styled from 'styled-components'
import { RowFixed, RowBetween } from '../Row'
import { useMedia } from 'react-use'
import { useGlobalData } from '../../contexts/GlobalData'
import { useLatestBlocks } from '../../contexts/Application'
import { usePairData } from '../../contexts/PairData'
import { useSpotPriceHistory } from '../../hooks/useSpotPriceHistory'
import { formattedNum, localNumber, formatPrice } from '../../utils'
import { PAIR_ADDRESS, WRAPPED_NATIVE_ADDRESS } from '../../constants/urls'

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
      spotFromPair = reserve0 / reserve1
    } else if (token1Id === wnovaLower) {
      spotFromPair = reserve1 / reserve0
    }
  }
  const spotHistory = useSpotPriceHistory(subgraphReady ? null : rpcUrl, factoryAddress, wnovaAddress, tonyAddress)
  const spotValue = Number.isFinite(spotFromPair) ? spotFromPair : spotHistory?.lastPrice
  const formattedSpot = spotValue ? formatPrice(spotValue) : '—'
  const oneDayFees = oneDayVolumeETH ? formattedNum(oneDayVolumeETH * 0.003, false) : '—'

  return (
    <Header>
      <RowBetween style={{ padding: below816 ? '0.5rem' : '.5rem' }}>
        <RowFixed>
          {!below400 && (
            <TYPE.main mr={'1rem'} style={{ position: 'relative' }}>
              TONY price (WNOVA): <Medium>{formattedSpot}</Medium>
            </TYPE.main>
          )}

          {!below1180 && (
            <TYPE.main mr={'1rem'}>
              Transactions (24H): <Medium>{localNumber(oneDayTxns)}</Medium>
            </TYPE.main>
          )}
          {!below1024 && (
            <TYPE.main mr={'1rem'}>
              Pairs: <Medium>{localNumber(pairCount)}</Medium>
            </TYPE.main>
          )}
          {!below1295 && (
            <TYPE.main mr={'1rem'}>
              Fees (24H, WNOVA): <Medium>{oneDayFees}</Medium>&nbsp;
            </TYPE.main>
          )}
        </RowFixed>
      </RowBetween>
    </Header>
  )
}
