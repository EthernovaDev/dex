import React, { useEffect, useMemo, useState } from 'react'
import { withRouter } from 'react-router-dom'
import { Box } from 'rebass'
import styled from 'styled-components'

import { AutoRow, RowBetween } from '../components/Row'
import { AutoColumn } from '../components/Column'
import PairList from '../components/PairList'
import TopTokenList from '../components/TokenList'
import TxnList from '../components/TxnList'
import GlobalChart from '../components/GlobalChart'
import Search from '../components/Search'
import GlobalStats from '../components/GlobalStats'
import OnchainMarketPanel from '../components/OnchainMarketPanel'

import { useGlobalData, useGlobalTransactions } from '../contexts/GlobalData'
import { useAllPairData } from '../contexts/PairData'
import { useMedia } from 'react-use'
import Panel from '../components/Panel'
import { useAllTokenData } from '../contexts/TokenData'
import { formattedNum, formattedPercent } from '../utils'
import { TYPE, ThemedBackground } from '../Theme'
import { transparentize } from 'polished'
import { CustomLink } from '../components/Link'

import { PageWrapper, ContentWrapper } from '../components'
import CheckBox from '../components/Checkbox'
import QuestionHelper from '../components/QuestionHelper'

const RPC_URL = process.env.REACT_APP_RPC_URL
const FACTORY_ADDRESS = process.env.REACT_APP_FACTORY_ADDRESS
const WNOVA_ADDRESS = process.env.REACT_APP_WNOVA_ADDRESS
const TONY_ADDRESS = process.env.REACT_APP_TONY_ADDRESS
const PAIR_ADDRESS = process.env.REACT_APP_PAIR_ADDRESS

const ListOptions = styled(AutoRow)`
  height: 40px;
  width: 100%;
  font-size: 1.25rem;
  font-weight: 600;

  @media screen and (max-width: 640px) {
    font-size: 1rem;
  }
`

const GridRow = styled.div`
  display: grid;
  width: 100%;
  grid-template-columns: 1fr 1fr;
  column-gap: 6px;
  align-items: start;
  justify-content: space-between;
`

function GlobalPage() {
  // get data for lists and totals
  const allPairs = useAllPairData()
  const allTokens = useAllTokenData()
  const transactions = useGlobalTransactions()
  const { totalLiquidityETH, oneDayVolumeETH, volumeChangeETH, liquidityChangeETH } = useGlobalData()

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
  const [useTracked, setUseTracked] = useState(false)
  const wnovaLower = WNOVA_ADDRESS?.toLowerCase?.() || ''
  const tonyLower = TONY_ADDRESS?.toLowerCase?.() || ''
  const pairSwaps = useMemo(() => {
    if (!transactions?.swaps?.length || !wnovaLower || !tonyLower) return []
    return transactions.swaps.filter((swap) => {
      const token0 = swap?.pair?.token0?.id?.toLowerCase?.()
      const token1 = swap?.pair?.token1?.id?.toLowerCase?.()
      return (
        (token0 === wnovaLower && token1 === tonyLower) ||
        (token1 === wnovaLower && token0 === tonyLower)
      )
    })
  }, [transactions, wnovaLower, tonyLower])

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
              No USD oracle on Ethernova yet — values shown in WNOVA where possible.
            </TYPE.light>
          </AutoColumn>
          <OnchainMarketPanel
            rpcUrl={RPC_URL}
            factoryAddress={FACTORY_ADDRESS}
            wnovaAddress={WNOVA_ADDRESS}
            tonyAddress={TONY_ADDRESS}
            pairAddress={PAIR_ADDRESS}
            swaps={pairSwaps}
            showVolume={false}
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
                          {oneDayVolumeETH ? formattedNum(oneDayVolumeETH, false) : '-'}
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
                          {totalLiquidityETH ? formattedNum(totalLiquidityETH, false) : '-'}
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
              <Panel style={{ height: '100%', minHeight: '300px' }}>
                <div data-testid="chart-liquidity" style={{ height: '100%' }}>
                  <GlobalChart display="liquidity" />
                </div>
              </Panel>
              <Panel style={{ height: '100%' }}>
                <div data-testid="chart-volume" style={{ height: '100%' }}>
                  <GlobalChart display="volume" />
                </div>
              </Panel>
            </GridRow>
          )}
          {below800 && (
            <AutoColumn style={{ marginTop: '6px' }} gap="24px">
              <Panel style={{ height: '100%', minHeight: '300px' }}>
                <div data-testid="chart-liquidity" style={{ height: '100%' }}>
                  <GlobalChart display="liquidity" />
                </div>
              </Panel>
            </AutoColumn>
          )}
          <ListOptions gap="10px" style={{ marginTop: '2rem', marginBottom: '.5rem' }}>
            <RowBetween>
              <TYPE.main fontSize={'1.125rem'} style={{ whiteSpace: 'nowrap' }}>
                Top Tokens
              </TYPE.main>
              <CustomLink to={'/tokens'}>See All</CustomLink>
            </RowBetween>
          </ListOptions>
          <Panel style={{ marginTop: '6px', padding: '1.125rem 0 ' }}>
            <TopTokenList tokens={allTokens} />
          </Panel>
          <ListOptions gap="10px" style={{ marginTop: '2rem', marginBottom: '.5rem' }}>
            <RowBetween>
              <TYPE.main fontSize={'1rem'} style={{ whiteSpace: 'nowrap' }}>
                Top Pairs
              </TYPE.main>
              <AutoRow gap="4px" width="100%" justifyContent="flex-end">
                <CheckBox
                  checked={useTracked}
                  setChecked={() => setUseTracked(!useTracked)}
                  text={'Hide pairs without WNOVA'}
                />
                <QuestionHelper text="Values are shown in WNOVA; pairs without WNOVA are still listed but may not have volume estimates." />
                <CustomLink to={'/pairs'}>See All</CustomLink>
              </AutoRow>
            </RowBetween>
          </ListOptions>
          <Panel style={{ marginTop: '6px', padding: '1.125rem 0 ' }}>
            <PairList pairs={allPairs} useTracked={useTracked} />
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
