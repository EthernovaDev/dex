import React from 'react'
import styled from 'styled-components'
import { RowFixed, RowBetween } from '../Row'
import { useMedia } from 'react-use'
import { useGlobalData } from '../../contexts/GlobalData'
import { useSpotPriceHistory } from '../../hooks/useSpotPriceHistory'
import { formattedNum, localNumber, formatPrice } from '../../utils'

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
  const rpcUrl = process.env.REACT_APP_RPC_URL
  const factoryAddress = process.env.REACT_APP_FACTORY_ADDRESS
  const wnovaAddress = process.env.REACT_APP_WNOVA_ADDRESS
  const tonyAddress = process.env.REACT_APP_TONY_ADDRESS
  const spotHistory = useSpotPriceHistory(rpcUrl, factoryAddress, wnovaAddress, tonyAddress)
  const formattedSpot = spotHistory?.lastPrice ? formatPrice(spotHistory.lastPrice) : '—'
  const oneDayFees = oneDayVolumeETH ? formattedNum(oneDayVolumeETH * 0.003, false) : '—'

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
