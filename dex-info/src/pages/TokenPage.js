import React, { useState } from 'react'
import 'feather-icons'
import { withRouter } from 'react-router-dom'
import { Text } from 'rebass'
import styled from 'styled-components'
import Link from '../components/Link'
import Panel from '../components/Panel'
import TokenLogo from '../components/TokenLogo'
import PairList from '../components/PairList'
import Loader from '../components/LocalLoader'
import { AutoRow, RowBetween, RowFixed } from '../components/Row'
import Column, { AutoColumn } from '../components/Column'
import { ButtonLight, ButtonDark } from '../components/ButtonStyled'
import TxnList from '../components/TxnList'
import TokenChart from '../components/TokenChart'
import { BasicLink } from '../components/Link'
import Search from '../components/Search'
import {
  formattedNum,
  formattedPercent,
  formatPrice,
  getPoolLink,
  getSwapLink,
  localNumber,
  isFiniteNum,
  isAddrEq,
} from '../utils'
import { useTokenData, useTokenTransactions, useTokenPairs } from '../contexts/TokenData'
import { TYPE, ThemedBackground } from '../Theme'
import { transparentize } from 'polished'
import { useColor } from '../hooks'
import CopyHelper from '../components/Copy'
import { useMedia } from 'react-use'
import { useDataForList } from '../contexts/PairData'
import { useEffect } from 'react'
import Warning from '../components/Warning'
import { usePathDismissed, useSavedTokens } from '../contexts/LocalStorage'
import { useLatestBlocks } from '../contexts/Application'
import { Hover, PageWrapper, ContentWrapper, StyledIcon, BlockedWrapper, BlockedMessageWrapper } from '../components'
import { PlusCircle, Bookmark, AlertCircle } from 'react-feather'
import FormattedName from '../components/FormattedName'
import { useListedTokens } from '../contexts/Application'
import HoverText from '../components/HoverText'
import { UNTRACKED_COPY, TOKEN_BLACKLIST, BLOCKED_WARNINGS } from '../constants'
import QuestionHelper from '../components/QuestionHelper'
import Checkbox from '../components/Checkbox'
import { shortenAddress } from '../utils'
import { EXPLORER_URL, WRAPPED_NATIVE_ADDRESS } from '../constants/urls'
import { useOnchainTokenInfo } from '../hooks/useOnchainTokenInfo'

const explorerBase = EXPLORER_URL.replace(/\/+$/, '')

const DashboardWrapper = styled.div`
  width: 100%;
`

const PanelWrapper = styled.div`
  grid-template-columns: repeat(3, 1fr);
  grid-template-rows: max-content;
  gap: 6px;
  display: inline-grid;
  width: 100%;
  align-items: start;
  @media screen and (max-width: 1024px) {
    grid-template-columns: 1fr;
    align-items: stretch;
    > * {
      /* grid-column: 1 / 4; */
    }

    > * {
      &:first-child {
        width: 100%;
      }
    }
  }
`

const TokenDetailsLayout = styled.div`
  display: inline-grid;
  width: 100%;
  grid-template-columns: auto auto auto 1fr;
  column-gap: 30px;
  align-items: start;

  &:last-child {
    align-items: center;
    justify-items: end;
  }
  @media screen and (max-width: 1024px) {
    grid-template-columns: 1fr;
    align-items: stretch;
    > * {
      /* grid-column: 1 / 4; */
      margin-bottom: 1rem;
    }

    &:last-child {
      align-items: start;
      justify-items: start;
    }
  }
`

const WarningIcon = styled(AlertCircle)`
  stroke: ${({ theme }) => theme.text1};
  height: 16px;
  width: 16px;
  opacity: 0.6;
`

const WarningGrouping = styled.div`
  opacity: ${({ disabled }) => disabled && '0.4'};
  pointer-events: ${({ disabled }) => disabled && 'none'};
`

function TokenPage({ address, history }) {
  const tokenData = useTokenData(address)
  const {
    id,
    name,
    symbol,
    priceETH,
    oneDayVolumeETH,
    totalLiquidityETH,
    volumeChangeETH,
    oneDayVolumeUT,
    volumeChangeUT,
    priceChangeETH,
    liquidityChangeETH,
    oneDayTxns,
    txnChange,
  } = tokenData || {}
  const rpcUrl = process.env.REACT_APP_RPC_URL || 'https://rpc.ethnova.net'
  const [latestBlock] = useLatestBlocks()
  const subgraphReady = Boolean(latestBlock)
  const [allowOnchain, setAllowOnchain] = useState(false)

  useEffect(() => {
    if (!address) return
    if (subgraphReady && tokenData?.id) {
      setAllowOnchain(false)
      return
    }
    const timer = setTimeout(() => setAllowOnchain(true), 15000)
    return () => clearTimeout(timer)
  }, [address, subgraphReady, tokenData])

  const shouldUseOnchain = allowOnchain && (!subgraphReady || !tokenData)
  const onchainInfo = useOnchainTokenInfo(address, shouldUseOnchain ? rpcUrl : null)
  const isWrappedNative = isAddrEq(address, WRAPPED_NATIVE_ADDRESS)
  const safeSymbol = symbol || onchainInfo.info?.symbol || (isWrappedNative ? 'WNOVA' : 'UNKNOWN')
  const safeName = name || onchainInfo.info?.name || (isWrappedNative ? 'Wrapped NOVA' : 'Unknown Token')

  useEffect(() => {
    document.querySelector('body').scrollTo(0, 0)
  }, [])

  // detect color from token
  const backgroundColor = useColor(id || address, safeSymbol)

  const allPairs = useTokenPairs(address)

  // pairs to show in pair list
  const fetchedPairsList = useDataForList(allPairs)

  // all transactions with this token
  const transactions = useTokenTransactions(address)

  // price
  const hasPrice = isFiniteNum(priceETH) && Number(priceETH) > 0
  const price = hasPrice ? formatPrice(priceETH) : isWrappedNative ? '1 WNOVA' : '—'
  const priceChange = formattedPercent(priceChangeETH)

  // volume
  const volumeSource = isFiniteNum(oneDayVolumeETH) ? oneDayVolumeETH : oneDayVolumeUT || 0
  const volume = formattedNum(volumeSource, false)

  const usingUtVolume = isFiniteNum(oneDayVolumeETH) && Number(oneDayVolumeETH) === 0 && !!oneDayVolumeUT
  const volumeChange = formattedPercent(!usingUtVolume ? volumeChangeETH : volumeChangeUT)

  // liquidity
  const liquidity = isFiniteNum(totalLiquidityETH) ? formattedNum(totalLiquidityETH, false) : '—'
  const liquidityChange = formattedPercent(liquidityChangeETH)

  // transactions
  const txnChangeFormatted = formattedPercent(txnChange)

  const below1080 = useMedia('(max-width: 1080px)')
  const below800 = useMedia('(max-width: 800px)')
  const below600 = useMedia('(max-width: 600px)')
  const below500 = useMedia('(max-width: 500px)')

  // format for long symbol
  const LENGTH = below1080 ? 10 : 16
  const formattedSymbol = safeSymbol?.length > LENGTH ? safeSymbol.slice(0, LENGTH) + '...' : safeSymbol

  const [dismissed, markAsDismissed] = usePathDismissed(history.location.pathname)
  const [savedTokens, addToken] = useSavedTokens()
  const listedTokens = useListedTokens()

  useEffect(() => {
    window.scrollTo({
      behavior: 'smooth',
      top: 0,
    })
  }, [])

  const [useTracked, setUseTracked] = useState(false)

  if (TOKEN_BLACKLIST.includes(address)) {
    return (
      <BlockedWrapper>
        <BlockedMessageWrapper>
          <AutoColumn gap="1rem" justify="center">
            <TYPE.light style={{ textAlign: 'center' }}>
              {BLOCKED_WARNINGS[address] ?? `This token is not supported.`}
            </TYPE.light>
            <Link external={true} href={`${explorerBase}/address/${address}`}>{`More about ${shortenAddress(
              address
            )}`}</Link>
          </AutoColumn>
        </BlockedMessageWrapper>
      </BlockedWrapper>
    )
  }

  return (
    <PageWrapper>
      <ThemedBackground backgroundColor={transparentize(0.6, backgroundColor)} />
      <Warning
        type={'token'}
        show={!dismissed && listedTokens && !listedTokens.includes(address)}
        setShow={markAsDismissed}
        address={address}
      />
      <ContentWrapper>
        <RowBetween style={{ flexWrap: 'wrap', alingItems: 'start' }}>
          <AutoRow align="flex-end" style={{ width: 'fit-content' }}>
            <TYPE.body>
              <BasicLink to="/tokens">{'Tokens '}</BasicLink>→ {safeSymbol}
            </TYPE.body>
            <Link
              style={{ width: 'fit-content' }}
              color={backgroundColor}
              external
              href={`${explorerBase}/address/${address}`}
            >
              <Text style={{ marginLeft: '.15rem' }} fontSize={'14px'} fontWeight={400}>
                ({address.slice(0, 8) + '...' + address.slice(36, 42)})
              </Text>
            </Link>
          </AutoRow>
          {!below600 && <Search small={true} />}
        </RowBetween>
        <WarningGrouping disabled={!dismissed && listedTokens && !listedTokens.includes(address)}>
          <DashboardWrapper style={{ marginTop: below1080 ? '0' : '1rem' }}>
            <RowBetween
              style={{
                flexWrap: 'wrap',
                marginBottom: '2rem',
                alignItems: 'flex-start',
              }}
            >
              <RowFixed style={{ flexWrap: 'wrap' }}>
                <RowFixed style={{ alignItems: 'baseline' }}>
                  <TokenLogo address={address} size="32px" style={{ alignSelf: 'center' }} />
                  <TYPE.main
                    data-testid="token-header"
                    fontSize={below1080 ? '1.5rem' : '2rem'}
                    fontWeight={500}
                    style={{ margin: '0 1rem' }}
                  >
                    <RowFixed gap="6px">
                      <FormattedName
                        text={safeName ? safeName + ' ' : ''}
                        maxCharacters={16}
                        style={{ marginRight: '6px' }}
                      />{' '}
                      {formattedSymbol ? `(${formattedSymbol})` : ''}
                    </RowFixed>
                  </TYPE.main>{' '}
                  {!below1080 && (
                    <>
                      <TYPE.main fontSize={'1.5rem'} fontWeight={500} style={{ marginRight: '1rem' }}>
                        {price}
                      </TYPE.main>
                      {priceChange}
                    </>
                  )}
                </RowFixed>
              </RowFixed>
              <span>
                <RowFixed ml={below500 ? '0' : '2.5rem'} mt={below500 ? '1rem' : '0'}>
                  {!!!savedTokens[address] && !below800 ? (
                    <Hover onClick={() => addToken(address, safeSymbol)}>
                      <StyledIcon>
                        <PlusCircle style={{ marginRight: '0.5rem' }} />
                      </StyledIcon>
                    </Hover>
                  ) : !below1080 ? (
                    <StyledIcon>
                      <Bookmark style={{ marginRight: '0.5rem', opacity: 0.4 }} />
                    </StyledIcon>
                  ) : (
                    <></>
                  )}
                  <Link href={getPoolLink(address)} target="_blank">
                    <ButtonLight color={backgroundColor}>+ Add Liquidity</ButtonLight>
                  </Link>
                  <Link href={getSwapLink(address)} target="_blank">
                    <ButtonDark ml={'.5rem'} mr={below1080 && '.5rem'} color={backgroundColor}>
                      Trade
                    </ButtonDark>
                  </Link>
                </RowFixed>
              </span>
            </RowBetween>

            <>
              {!below1080 && (
                <RowFixed>
                  <TYPE.main fontSize={'1.125rem'} mr="6px">
                    Token Stats
                  </TYPE.main>
                  {usingUtVolume && (
                    <HoverText text={UNTRACKED_COPY}>
                      <WarningIcon />
                    </HoverText>
                  )}
                </RowFixed>
              )}
              <PanelWrapper style={{ marginTop: below1080 ? '0' : '1rem' }}>
                {below1080 && price && (
                  <Panel>
                    <AutoColumn gap="20px">
                      <RowBetween>
                        <TYPE.main>Price (WNOVA)</TYPE.main>
                        <div />
                      </RowBetween>
                      <RowBetween align="flex-end">
                        {' '}
                        <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={500}>
                          {price}
                        </TYPE.main>
                        <TYPE.main>{priceChange}</TYPE.main>
                      </RowBetween>
                    </AutoColumn>
                  </Panel>
                )}
                <Panel>
                  <AutoColumn gap="20px">
                    <RowBetween>
                      <TYPE.main>Total Liquidity (WNOVA)</TYPE.main>
                      <div />
                    </RowBetween>
                    <RowBetween align="flex-end">
                      <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={500}>
                        {liquidity}
                      </TYPE.main>
                      <TYPE.main>{liquidityChange}</TYPE.main>
                    </RowBetween>
                  </AutoColumn>
                </Panel>
                <Panel>
                  <AutoColumn gap="20px">
                    <RowBetween>
                      <TYPE.main>Volume (24hrs, WNOVA)</TYPE.main>
                      <div />
                    </RowBetween>
                    <RowBetween align="flex-end">
                      <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={500}>
                        {volume}
                      </TYPE.main>
                      <TYPE.main>{volumeChange}</TYPE.main>
                    </RowBetween>
                  </AutoColumn>
                </Panel>

                <Panel>
                  <AutoColumn gap="20px">
                    <RowBetween>
                      <TYPE.main>Transactions (24hrs)</TYPE.main>
                      <div />
                    </RowBetween>
                    <RowBetween align="flex-end">
                      <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={500}>
                        {oneDayTxns ? localNumber(oneDayTxns) : 0}
                      </TYPE.main>
                      <TYPE.main>{txnChangeFormatted}</TYPE.main>
                    </RowBetween>
                  </AutoColumn>
                </Panel>
                <Panel
                  style={{
                    gridColumn: below1080 ? '1' : '2/4',
                    gridRow: below1080 ? '' : '1/4',
                  }}
                >
                  <TokenChart address={address} color={backgroundColor} base={priceETH} />
                </Panel>
              </PanelWrapper>
            </>

            <RowBetween style={{ marginTop: '3rem' }}>
              <TYPE.main fontSize={'1.125rem'}>Top Pairs</TYPE.main>
              <AutoRow gap="4px" style={{ width: 'fit-content' }}>
                <Checkbox
                  checked={useTracked}
                  setChecked={() => setUseTracked(!useTracked)}
                  text={'Hide untracked pairs'}
                />
                <QuestionHelper text="Values are shown in WNOVA; pairs without WNOVA may not have volume estimates." />
              </AutoRow>
            </RowBetween>
            <Panel
              rounded
              style={{
                marginTop: '1.5rem',
                padding: '1.125rem 0 ',
              }}
            >
              {address && fetchedPairsList ? (
                <PairList color={backgroundColor} address={address} pairs={fetchedPairsList} useTracked={useTracked} />
              ) : (
                <Loader />
              )}
            </Panel>
            <RowBetween mt={40} mb={'1rem'}>
              <TYPE.main fontSize={'1.125rem'}>Transactions</TYPE.main> <div />
            </RowBetween>
            <Panel rounded>
              {transactions ? <TxnList color={backgroundColor} transactions={transactions} /> : <Loader />}
            </Panel>
            <>
              <RowBetween style={{ marginTop: '3rem' }}>
                <TYPE.main fontSize={'1.125rem'}>Token Information</TYPE.main>{' '}
              </RowBetween>
              <Panel
                rounded
                style={{
                  marginTop: '1.5rem',
                }}
                p={20}
              >
                <TokenDetailsLayout>
                  <Column>
                    <TYPE.main>Symbol</TYPE.main>
                    <Text style={{ marginTop: '.5rem' }} fontSize={24} fontWeight="500">
                      <FormattedName text={safeSymbol} maxCharacters={12} />
                    </Text>
                  </Column>
                  <Column>
                    <TYPE.main>Name</TYPE.main>
                    <TYPE.main style={{ marginTop: '.5rem' }} fontSize={24} fontWeight="500">
                      <FormattedName text={safeName} maxCharacters={16} />
                    </TYPE.main>
                  </Column>
                  <Column>
                    <TYPE.main>Address</TYPE.main>
                    <AutoRow align="flex-end">
                      <TYPE.main style={{ marginTop: '.5rem' }} fontSize={24} fontWeight="500">
                        {address.slice(0, 8) + '...' + address.slice(36, 42)}
                      </TYPE.main>
                      <CopyHelper toCopy={address} />
                    </AutoRow>
                  </Column>
                  <ButtonLight color={backgroundColor}>
                    <Link color={backgroundColor} external href={`${explorerBase}/address/${address}`}>
                      View on Explorer ↗
                    </Link>
                  </ButtonLight>
                </TokenDetailsLayout>
              </Panel>
            </>
          </DashboardWrapper>
        </WarningGrouping>
      </ContentWrapper>
    </PageWrapper>
  )
}

export default withRouter(TokenPage)
