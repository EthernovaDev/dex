import React, { useState } from 'react'
import styled from 'styled-components'
import { ApolloProvider } from 'react-apollo'
import { client } from './apollo/client'
import { Route, Switch, HashRouter, Redirect } from 'react-router-dom'
import GlobalPage from './pages/GlobalPage'
import TokenPage from './pages/TokenPage'
import PairPage from './pages/PairPage'
import Link from './components/Link'
import { isAddress } from './utils'
import AccountPage from './pages/AccountPage'
import AllTokensPage from './pages/AllTokensPage'
import AllPairsPage from './pages/AllPairsPage'
import PinnedData from './components/PinnedData'

import SideNav from './components/SideNav'
import AccountLookup from './pages/AccountLookup'
import Meta from './components/Meta'
import LocalLoader from './components/LocalLoader'
import { useLatestBlocks } from './contexts/Application'
import GoogleAnalyticsReporter from './components/analytics/GoogleAnalyticsReporter'
import { PAIR_BLACKLIST, TOKEN_BLACKLIST } from './constants'
import { DEX_URL } from './constants/urls'
import { useSpotPriceHistory } from './hooks/useSpotPriceHistory'

const AppWrapper = styled.div`
  position: relative;
  width: 100%;
`
const ContentWrapper = styled.div`
  display: grid;
  grid-template-columns: ${({ open }) => (open ? '220px 1fr 200px' : '220px 1fr 64px')};

  @media screen and (max-width: 1400px) {
    grid-template-columns: 220px 1fr;
  }

  @media screen and (max-width: 1080px) {
    grid-template-columns: 1fr;
    max-width: 100vw;
    overflow: hidden;
    grid-gap: 0;
  }
`

const Right = styled.div`
  position: fixed;
  right: 0;
  bottom: 0rem;
  z-index: 99;
  width: ${({ open }) => (open ? '220px' : '64px')};
  height: ${({ open }) => (open ? 'fit-content' : '64px')};
  overflow: auto;
  background-color: ${({ theme }) => theme.bg1};
  @media screen and (max-width: 1400px) {
    display: none;
  }
`

const Center = styled.div`
  height: 100%;
  z-index: 9999;
  transition: width 0.25s ease;
  background-color: ${({ theme }) => theme.onlyLight};
`

const BannerWrapper = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`

const WarningBanner = styled.div`
  background-color: #ff6871;
  padding: 1.5rem;
  color: white;
  width: 100%;
  text-align: center;
  font-weight: 500;
`

const UrlBanner = styled.div`
  background-color: #ff007a;
  padding: 1rem;
  color: white;
  width: 100%;
  text-align: center;
  font-weight: 500;
`

const Decorator = styled.span`
  text-decoration: underline;
`

const MiniChart = ({ values }) => {
  if (!values || !values.length) return null
  const width = 280
  const height = 90
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1 || 1)) * width
      const y = height - ((value - min) / range) * height
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return (
    <svg width={width} height={height} style={{ width: '100%' }}>
      <polyline fill="none" stroke="rgba(139,92,246,0.9)" strokeWidth="2" points={points} />
    </svg>
  )
}

const FallbackCard = styled.div`
  max-width: 720px;
  margin: 2rem auto;
  padding: 1.5rem;
  background: rgba(8, 12, 22, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  color: rgba(255, 255, 255, 0.9);
  text-align: center;
`

const FallbackTitle = styled.h2`
  font-size: 20px;
  margin-bottom: 0.75rem;
`

const FallbackText = styled.p`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
`

const FallbackButton = styled.button`
  margin-top: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.5);
  background: rgba(139, 92, 246, 0.2);
  color: white;
  cursor: pointer;
`

const RPC_URL = process.env.REACT_APP_RPC_URL
const FACTORY_ADDRESS = process.env.REACT_APP_FACTORY_ADDRESS
const WNOVA_ADDRESS = process.env.REACT_APP_WNOVA_ADDRESS
const TONY_ADDRESS = process.env.REACT_APP_TONY_ADDRESS

/**
 * Wrap the component with the header and sidebar pinned tab
 */
const LayoutWrapper = ({ children, savedOpen, setSavedOpen }) => {
  return (
    <>
      <ContentWrapper open={savedOpen}>
        <Meta />
        <SideNav />
        <Center id="center">{children}</Center>
        <Right open={savedOpen}>
          <PinnedData open={savedOpen} setSavedOpen={setSavedOpen} />
        </Right>
      </ContentWrapper>
    </>
  )
}

const BLOCK_DIFFERENCE_THRESHOLD = 30

function App() {
  const [savedOpen, setSavedOpen] = useState(false)

  const [latestBlock, headBlock] = useLatestBlocks()
  const spotHistory = useSpotPriceHistory(RPC_URL, FACTORY_ADDRESS, WNOVA_ADDRESS, TONY_ADDRESS)

  // show warning
  const showWarning = headBlock && latestBlock ? headBlock - latestBlock > BLOCK_DIFFERENCE_THRESHOLD : false
  const subgraphReady = Boolean(latestBlock)

  return (
    <ApolloProvider client={client}>
      <AppWrapper>
        <BannerWrapper>
          <UrlBanner>
            {'Open the NovaDEX swap interface at '}
            <Link color="white" external href={DEX_URL}>
              <Decorator>{DEX_URL.replace(/^https?:\/\//, '')}</Decorator>
            </Link>
          </UrlBanner>
        </BannerWrapper>
        {showWarning && (
          <BannerWrapper>
            <WarningBanner>
              {`Warning: The data on this site has only synced to Ethernova block ${latestBlock} (out of ${headBlock}). Please check back soon.`}
            </WarningBanner>
          </BannerWrapper>
        )}
        <HashRouter>
          {!subgraphReady ? (
            <>
              {spotHistory.status === 'loading' ? <LocalLoader fill="true" /> : null}
              <FallbackCard>
                <FallbackTitle>Subgraph offline or syncing</FallbackTitle>
                <FallbackText>
                  Charts are unavailable. We’ll show on-chain spot price while indexing catches up.
                </FallbackText>
                {spotHistory.status === 'ok' && spotHistory.lastPrice ? (
                  <>
                    <FallbackText>Current spot price: {spotHistory.lastPrice.toFixed(6)} TONY per WNOVA</FallbackText>
                    <MiniChart values={spotHistory.prices} />
                  </>
                ) : spotHistory.status === 'loading' ? (
                  <FallbackText>Fetching on-chain spot price…</FallbackText>
                ) : spotHistory.status === 'error' ? (
                  <FallbackText>Spot price unavailable (RPC unstable).</FallbackText>
                ) : null}
                <FallbackButton onClick={() => window.location.reload()}>Retry</FallbackButton>
              </FallbackCard>
            </>
          ) : null}
            <Route component={GoogleAnalyticsReporter} />
            <Switch>
              <Route
                exacts
                strict
                path="/token/:tokenAddress"
                render={({ match }) => {
                  if (
                    isAddress(match.params.tokenAddress.toLowerCase()) &&
                    !Object.keys(TOKEN_BLACKLIST).includes(match.params.tokenAddress.toLowerCase())
                  ) {
                    return (
                      <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                        <TokenPage address={match.params.tokenAddress.toLowerCase()} />
                      </LayoutWrapper>
                    )
                  } else {
                    return <Redirect to="/home" />
                  }
                }}
              />
              <Route
                exacts
                strict
                path="/pair/:pairAddress"
                render={({ match }) => {
                  if (
                    isAddress(match.params.pairAddress.toLowerCase()) &&
                    !Object.keys(PAIR_BLACKLIST).includes(match.params.pairAddress.toLowerCase())
                  ) {
                    return (
                      <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                        <PairPage pairAddress={match.params.pairAddress.toLowerCase()} />
                      </LayoutWrapper>
                    )
                  } else {
                    return <Redirect to="/home" />
                  }
                }}
              />
              <Route
                exacts
                strict
                path="/account/:accountAddress"
                render={({ match }) => {
                  if (isAddress(match.params.accountAddress.toLowerCase())) {
                    return (
                      <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                        <AccountPage account={match.params.accountAddress.toLowerCase()} />
                      </LayoutWrapper>
                    )
                  } else {
                    return <Redirect to="/home" />
                  }
                }}
              />

              <Route path="/home">
                <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                  <GlobalPage />
                </LayoutWrapper>
              </Route>

              <Route path="/tokens">
                <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                  <AllTokensPage />
                </LayoutWrapper>
              </Route>

              <Route path="/pairs">
                <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                  <AllPairsPage />
                </LayoutWrapper>
              </Route>

              <Route path="/accounts">
                <LayoutWrapper savedOpen={savedOpen} setSavedOpen={setSavedOpen}>
                  <AccountLookup />
                </LayoutWrapper>
              </Route>

              <Redirect to="/home" />
            </Switch>
          </HashRouter>
      </AppWrapper>
    </ApolloProvider>
  )
}

export default App
