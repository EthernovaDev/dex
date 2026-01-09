/* eslint-disable react-hooks/rules-of-hooks */
/* global BigInt */
import React, { useEffect, useState } from 'react'
import { withRouter } from 'react-router-dom'
import 'feather-icons'
import styled from 'styled-components'
import Panel from '../components/Panel'
import {
  PageWrapper,
  ContentWrapperLarge,
  StyledIcon,
  BlockedWrapper,
  BlockedMessageWrapper,
  EmptyCard,
} from '../components/index'
import { AutoRow, RowBetween, RowFixed } from '../components/Row'
import Column, { AutoColumn } from '../components/Column'
import { ButtonLight, ButtonDark } from '../components/ButtonStyled'
import PairChart from '../components/PairChart'
import OnchainMarketPanel from '../components/OnchainMarketPanel'
import Link from '../components/Link'
import TxnList from '../components/TxnList'
import Loader from '../components/LocalLoader'
import { BasicLink } from '../components/Link'
import Search from '../components/Search'
import {
  formattedNum,
  formattedPercent,
  getPoolLink,
  getSwapLink,
  shortenAddress,
  formatPrice,
  isFiniteNum,
  isAddress,
  normAddr,
  isAddrEq,
} from '../utils'
import { useColor } from '../hooks'
import { usePairData, usePairTransactions, usePairChartData } from '../contexts/PairData'
import { client } from '../apollo/client'
import { PAIR_DATA } from '../apollo/queries'
import { TYPE, ThemedBackground } from '../Theme'
import { transparentize } from 'polished'
import CopyHelper from '../components/Copy'
import { useMedia } from 'react-use'
import DoubleTokenLogo from '../components/DoubleLogo'
import TokenLogo from '../components/TokenLogo'
import { Hover } from '../components'
import Warning from '../components/Warning'
import { usePathDismissed, useSavedPairs } from '../contexts/LocalStorage'
import { useLatestBlocks } from '../contexts/Application'

import { Bookmark, PlusCircle, AlertCircle } from 'react-feather'
import FormattedName from '../components/FormattedName'
import { useListedTokens } from '../contexts/Application'
import HoverText from '../components/HoverText'
import { UNTRACKED_COPY, PAIR_BLACKLIST, BLOCKED_WARNINGS } from '../constants'
import { EXPLORER_URL, BOOST_REGISTRY_ADDRESS } from '../constants/urls'
import { TREASURY_FEE_BPS } from '../constants/base'
import { useOnchainPair } from '../hooks/useOnchainPair'
import { useOnchainTokenInfo } from '../hooks/useOnchainTokenInfo'
import { usePairBoostInfo, useBoostRegistryConfig } from '../hooks/useBoostedPairs'
import { useTokenMetadata, usePairMetadata } from '../hooks/useTokenMetadata'
import { ethers } from 'ethers'

const explorerBase = EXPLORER_URL.replace(/\/+$/, '')
const RPC_URL = process.env.REACT_APP_RPC_URL
const FACTORY_ADDRESS = process.env.REACT_APP_FACTORY_ADDRESS
const WNOVA_ADDRESS = process.env.REACT_APP_WNOVA_ADDRESS
const TONY_ADDRESS = process.env.REACT_APP_TONY_ADDRESS

const BOOST_ABI = [
  'function boostPair(address pair, uint256 duration) payable',
  'function feeAmount() view returns (uint256)',
]
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function approve(address spender, uint256 value) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
]
const BOOST_DURATION = 60 * 60 * 24

const DashboardWrapper = styled.div`
  width: 100%;
`

const PanelWrapper = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  width: 100%;
  align-items: stretch;
`

const TokenDetailsLayout = styled.div`
  display: grid;
  width: 100%;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  column-gap: 20px;
  row-gap: 12px;
  align-items: start;
`

const FixedPanel = styled(Panel)`
  width: fit-content;
  padding: 8px 12px;
  border-radius: 10px;

  :hover {
    cursor: pointer;
    background-color: ${({ theme }) => theme.bg2};
  }
`

const HoverSpan = styled.span`
  :hover {
    cursor: pointer;
    opacity: 0.7;
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

function PairPageContent({ pairId, history }) {
  const pairData = usePairData(pairId)
  const isNotFound = Boolean(pairData?.__notFound)
  const [pairOverride, setPairOverride] = useState(null)
  const [pairOverrideError, setPairOverrideError] = useState(null)
  const [pairOverrideChecked, setPairOverrideChecked] = useState(false)
  const onchainPair = useOnchainPair(pairId, RPC_URL)
  const token0Info = useOnchainTokenInfo(onchainPair?.data?.token0, RPC_URL)
  const token1Info = useOnchainTokenInfo(onchainPair?.data?.token1, RPC_URL)
  const pairMeta = usePairMetadata(pairId)
  const onchainPairData = React.useMemo(() => {
    if (!onchainPair?.data?.token0 || !onchainPair?.data?.token1) return null
    const token0Address = onchainPair.data.token0
    const token1Address = onchainPair.data.token1
    const token0Decimals = token0Info?.info?.decimals || 18
    const token1Decimals = token1Info?.info?.decimals || 18
    const reserve0 = ethers.utils.formatUnits(onchainPair.data.reserve0, token0Decimals)
    const reserve1 = ethers.utils.formatUnits(onchainPair.data.reserve1, token1Decimals)
    return {
      id: pairId,
      token0: {
        id: token0Address,
        symbol: token0Info?.info?.symbol || 'UNKNOWN',
        name: token0Info?.info?.name || 'Unknown Token',
        decimals: token0Decimals,
      },
      token1: {
        id: token1Address,
        symbol: token1Info?.info?.symbol || 'UNKNOWN',
        name: token1Info?.info?.name || 'Unknown Token',
        decimals: token1Decimals,
      },
      reserve0,
      reserve1,
      volumeToken0: '0',
      volumeToken1: '0',
      reserveETH: null,
      trackedReserveETH: null,
    }
  }, [onchainPair, token0Info, token1Info, pairId])

  const activePair = pairOverride || pairData || onchainPairData
  const {
    token0,
    token1,
    reserve0,
    reserve1,
    reserveETH,
    trackedReserveETH,
    oneDayVolumeETH,
    volumeChangeETH,
    liquidityChangeETH,
  } = activePair || {}

  const transactions = usePairTransactions(pairId)
  const hasTransactions = Boolean(
    transactions &&
      ((transactions.mints && transactions.mints.length) ||
        (transactions.burns && transactions.burns.length) ||
        (transactions.swaps && transactions.swaps.length))
  )
  const swapsCount = transactions?.swaps?.length || 0
  const pairChartData = usePairChartData(pairId)
  const backgroundColor = useColor(pairId)

  const wnovaLower = normAddr(WNOVA_ADDRESS)
  const token0Id = normAddr(token0?.id)
  const token1Id = normAddr(token1?.id)
  const token0Meta = useTokenMetadata(token0?.id)
  const token1Meta = useTokenMetadata(token1?.id)
  const isToken0Wnova = isAddrEq(token0Id, wnovaLower)
  const isToken1Wnova = isAddrEq(token1Id, wnovaLower)
  const reserveWnova = isToken0Wnova ? reserve0 : isToken1Wnova ? reserve1 : null
  const reserveQuote = isToken0Wnova ? reserve1 : isToken1Wnova ? reserve0 : null
  const reserveWnovaNum = isFiniteNum(reserveWnova) ? Number(reserveWnova) : null
  const reserveQuoteNum = isFiniteNum(reserveQuote) ? Number(reserveQuote) : null
  const quoteTokenAddress = isToken0Wnova ? token1?.id : isToken1Wnova ? token0?.id : token1?.id || token0?.id
  const quoteSymbol = isToken0Wnova
    ? token1?.symbol || 'TOKEN'
    : isToken1Wnova
    ? token0?.symbol || 'TOKEN'
    : token1?.symbol || token0?.symbol || 'TOKEN'
  const volumeWnova24h = React.useMemo(() => {
    if (!transactions?.swaps?.length || !wnovaLower) return 0
    const now = Math.floor(Date.now() / 1000)
    return transactions.swaps.reduce((sum, swap) => {
      const ts = Number.parseInt(swap?.transaction?.timestamp || swap?.timestamp || 0, 10)
      if (!ts || now - ts > 86400) return sum
      const pairToken0 = normAddr(swap?.pair?.token0?.id)
      const pairToken1 = normAddr(swap?.pair?.token1?.id)
      const amount0In = Number(swap?.amount0In || 0)
      const amount0Out = Number(swap?.amount0Out || 0)
      const amount1In = Number(swap?.amount1In || 0)
      const amount1Out = Number(swap?.amount1Out || 0)
      if (isAddrEq(pairToken0, wnovaLower)) return sum + (amount0In > 0 ? amount0In : amount0Out)
      if (isAddrEq(pairToken1, wnovaLower)) return sum + (amount1In > 0 ? amount1In : amount1Out)
      return sum
    }, 0)
  }, [transactions, wnovaLower])
  const liquiditySeries = React.useMemo(() => {
    if (!pairChartData || !pairChartData.length) return []
    return pairChartData
      .map((entry) => {
        const value = Number(entry?.reserveETH)
        return { time: Number(entry?.date), value }
      })
      .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
  }, [pairChartData])
  const liquidityWnova = isFiniteNum(reserveWnova) ? formattedNum(Number(reserveWnova), false) : null
  const formattedLiquidity = liquidityWnova
    ? liquidityWnova
    : isFiniteNum(reserveETH)
    ? formattedNum(reserveETH, false)
    : isFiniteNum(trackedReserveETH)
    ? formattedNum(trackedReserveETH, false)
    : '—'
  const liquidityChange = formattedPercent(liquidityChangeETH)

  // volume
  const volumeSource = isFiniteNum(volumeWnova24h)
    ? volumeWnova24h
    : isFiniteNum(oneDayVolumeETH)
    ? oneDayVolumeETH
    : NaN
  const volume = isFiniteNum(volumeSource) ? formattedNum(volumeSource, false) : '—'
  const volumeChange = formattedPercent(volumeChangeETH)

  const showUSDWaning = false

  // get fees	  // get fees
  const fees = isFiniteNum(volumeSource) ? formattedNum(volumeSource * 0.003, false) : '—'
  const protocolFees = isFiniteNum(volumeSource)
    ? formattedNum(volumeSource * (TREASURY_FEE_BPS / 10000), false)
    : '—'

  // rates
  const token0Rate = isFiniteNum(reserve0) && isFiniteNum(reserve1) ? formatPrice(reserve1 / reserve0) : '—'
  const token1Rate = isFiniteNum(reserve0) && isFiniteNum(reserve1) ? formatPrice(reserve0 / reserve1) : '—'

  // formatted symbols for overflow
  const formattedSymbol0 =
    token0?.symbol?.length > 6 ? token0?.symbol.slice(0, 5) + '...' : token0?.symbol || ''
  const formattedSymbol1 =
    token1?.symbol?.length > 6 ? token1?.symbol.slice(0, 5) + '...' : token1?.symbol || ''

  const below1080 = useMedia('(max-width: 1080px)')
  const below900 = useMedia('(max-width: 900px)')
  const below600 = useMedia('(max-width: 600px)')

  const boostInfoState = usePairBoostInfo(pairId, RPC_URL)
  const boostConfigState = useBoostRegistryConfig(RPC_URL)
  const forceRpcFail =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('rpcFail') === '1'
  const boostRpcError = forceRpcFail
    ? 'Simulated RPC error'
    : boostInfoState?.error || boostConfigState?.error
  const boostFeeRaw = boostConfigState?.config?.feeAmount || '10000000000000000000'
  const toBigIntSafe = (value) => {
    try {
      if (value === null || value === undefined) return 0n
      if (typeof value === 'bigint') return value
      if (typeof value === 'number') return BigInt(Math.floor(value))
      if (typeof value === 'string') return BigInt(value)
      if (typeof value?.toString === 'function') return BigInt(value.toString())
      return BigInt(String(value))
    } catch {
      return 0n
    }
  }
  const formatUnitsSafe = (value, decimals = 18) => {
    try {
      if (ethers?.utils?.formatUnits) return ethers.utils.formatUnits(value, decimals)
      if (ethers?.formatUnits) return ethers.formatUnits(value, decimals)
      return value?.toString?.() || String(value || '0')
    } catch {
      return '0'
    }
  }
  const boostFeeAmount = boostFeeRaw
  const boostFeeAmountBI = toBigIntSafe(boostFeeRaw)
  let boostFeeDisplay = '10'
  try {
    boostFeeDisplay = formattedNum(Number(formatUnitsSafe(boostFeeRaw, 18)), false)
  } catch {
    boostFeeDisplay = '10'
  }
  const boostExpiresAt = boostInfoState?.info?.expiresAt || 0
  const boostActive = boostExpiresAt > Math.floor(Date.now() / 1000)
  const boostRemainingHours = boostActive
    ? Math.max(1, Math.ceil((boostExpiresAt - Math.floor(Date.now() / 1000)) / 3600))
    : 0
  const [boostStatus, setBoostStatus] = useState({ state: 'idle', error: null, tx: null })
  const handleBoostRetry = () => {
    if (boostInfoState?.refresh) boostInfoState.refresh()
    if (boostConfigState?.refresh) boostConfigState.refresh()
  }

  const [dismissed, markAsDismissed] = usePathDismissed(history.location.pathname)
  const [latestBlock] = useLatestBlocks()
  const subgraphReady = Boolean(latestBlock)

  useEffect(() => {
    window.scrollTo({
      behavior: 'smooth',
      top: 0,
    })
  }, [])

  const [savedPairs, addPair] = useSavedPairs()

  const listedTokens = useListedTokens()

  useEffect(() => {
    let cancelled = false
    async function fetchPairOverride() {
      if (!pairId || !isAddress(pairId)) return
      setPairOverrideError(null)
      try {
        const result = await client.query({
          query: PAIR_DATA(pairId),
          fetchPolicy: 'no-cache',
        })
        if (cancelled) return
        const found = result?.data?.pairs?.[0] || null
        setPairOverride(found)
        setPairOverrideChecked(true)
      } catch (err) {
        if (!cancelled) {
          setPairOverrideError(err)
          setPairOverrideChecked(true)
        }
      } finally {
        if (!cancelled) {
          // no-op
        }
      }
    }
    fetchPairOverride()
    return () => {
      cancelled = true
    }
  }, [pairId])

  const switchToEthernova = async (ethereum) => {
    const chainIdHex = '0x1dab5'
    const params = {
      chainId: chainIdHex,
      chainName: 'Ethernova',
      rpcUrls: ['https://rpc.ethnova.net'],
      nativeCurrency: { name: 'NOVA', symbol: 'NOVA', decimals: 18 },
      blockExplorerUrls: ['https://explorer.ethnova.net'],
    }
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: chainIdHex }] })
    } catch (err) {
      if (err?.code === 4902) {
        await ethereum.request({ method: 'wallet_addEthereumChain', params: [params] })
      } else {
        throw err
      }
    }
  }

  const handleBoost = async () => {
    if (!BOOST_REGISTRY_ADDRESS) {
      setBoostStatus({ state: 'error', error: 'Boost registry not configured', tx: null })
      return
    }
    if (!pairId) {
      setBoostStatus({ state: 'error', error: 'Missing pair address', tx: null })
      return
    }
    if (onchainPair?.status === 'not_found') {
      setBoostStatus({ state: 'error', error: 'Pair contract not found on-chain', tx: null })
      return
    }
    if (!window?.ethereum) {
      setBoostStatus({ state: 'error', error: 'No wallet detected', tx: null })
      return
    }

    try {
      setBoostStatus({ state: 'pending', error: null, tx: null })
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      await switchToEthernova(window.ethereum)
      const provider = new ethers.providers.Web3Provider(window.ethereum)
      const network = await provider.getNetwork()
      if (Number(network.chainId) !== 121525) {
        throw new Error('Wrong network: switch to Ethernova')
      }
      const signer = provider.getSigner()
      const account = await signer.getAddress()

      const boostContract = new ethers.Contract(BOOST_REGISTRY_ADDRESS, BOOST_ABI, signer)
      const wnovaContract = new ethers.Contract(WNOVA_ADDRESS, ERC20_ABI, signer)

      const feeAmount = boostFeeAmount
      const novaBalance = await provider.getBalance(account)
      const novaBalanceBI = toBigIntSafe(novaBalance)
      let tx

      if (novaBalanceBI >= boostFeeAmountBI) {
        tx = await boostContract.boostPair(pairId, BOOST_DURATION, { value: feeAmount })
      } else {
        const allowance = await wnovaContract.allowance(account, BOOST_REGISTRY_ADDRESS)
        if (toBigIntSafe(allowance) < boostFeeAmountBI) {
          const approveTx = await wnovaContract.approve(BOOST_REGISTRY_ADDRESS, feeAmount)
          await approveTx.wait(1)
        }
        tx = await boostContract.boostPair(pairId, BOOST_DURATION)
      }

      setBoostStatus({ state: 'submitted', error: null, tx: tx.hash })
      await tx.wait(1)
      setBoostStatus({ state: 'confirmed', error: null, tx: tx.hash })
      if (typeof window !== 'undefined') {
        try {
          const expiresAt = Math.floor(Date.now() / 1000) + BOOST_DURATION
          const cached = window.localStorage.getItem('novadex.boostedPairs')
          const parsed = cached ? JSON.parse(cached) : {}
          const current = Array.isArray(parsed?.boosted) ? parsed.boosted : []
          const next = [
            { pair: pairId, booster: account, expiresAt },
            ...current.filter((entry) => entry?.pair?.toLowerCase() !== pairId.toLowerCase()),
          ]
          window.localStorage.setItem('novadex.boostedPairs', JSON.stringify({ boosted: next, ts: Date.now() }))
        } catch (err) {
          console.warn('[boostedPairs] cache update failed', err)
        }
        window.dispatchEvent(new CustomEvent('boosted-pairs-refresh'))
      }
    } catch (err) {
      const message = err?.message || 'Boost failed'
      setBoostStatus({ state: 'error', error: message, tx: null })
    }
  }

  const pairLoaded = Boolean(token0?.id && token1?.id)
  const showIndexWarning = pairOverrideChecked && !pairOverride && !pairData
  const onchainMissing = onchainPair?.status === 'not_found'
  const pairNotIndexed = (showIndexWarning && !pairLoaded && !onchainPairData) || (isNotFound && !onchainPairData)

  if (pairNotIndexed) {
    return (
      <PageWrapper>
        <ContentWrapperLarge>
          <Panel style={{ padding: '2rem' }} data-testid="pair-not-indexed">
            <TYPE.main fontSize="1.25rem">{onchainMissing ? 'Pair not found on-chain' : 'Pair not indexed yet'}</TYPE.main>
            <TYPE.light style={{ marginTop: '0.5rem' }}>
              {onchainMissing
                ? 'The pair contract was not found on-chain. Create the pool and add liquidity first.'
                : 'This pair is not available in the subgraph yet. It may still be syncing.'}
            </TYPE.light>
            {boostActive && (
              <TYPE.light style={{ marginTop: '0.5rem' }} color="text2">
                Boosted · {boostRemainingHours}h remaining
              </TYPE.light>
            )}
            {pairMeta?.token0 && pairMeta?.token1 && (
              <TYPE.light style={{ marginTop: '0.5rem' }}>
                Token0: {pairMeta.symbol0 || shortenAddress(pairMeta.token0)} · Token1:{' '}
                {pairMeta.symbol1 || shortenAddress(pairMeta.token1)}
              </TYPE.light>
            )}
            <Link
              external
              href={`${explorerBase}/address/${pairId}`}
              style={{ marginTop: '0.75rem', display: 'inline-flex' }}
            >
              View on Explorer ↗
            </Link>
            {pairMeta?.token0 && pairMeta?.token1 && (
              <Link
                external
                href={getPoolLink(pairMeta.token0, pairMeta.token1)}
                style={{ marginTop: '0.5rem', display: 'inline-flex' }}
              >
                Create pool / add liquidity ↗
              </Link>
            )}
            {pairOverrideError ? (
              <TYPE.light style={{ marginTop: '0.75rem' }}>
                Subgraph error: {pairOverrideError?.message || 'unknown'}
              </TYPE.light>
            ) : null}
          </Panel>
        </ContentWrapperLarge>
      </PageWrapper>
    )
  }

  if (PAIR_BLACKLIST.includes(pairId)) {
    return (
      <BlockedWrapper>
        <BlockedMessageWrapper>
          <AutoColumn gap="1rem" justify="center">
            <TYPE.light style={{ textAlign: 'center' }}>
              {BLOCKED_WARNINGS[pairId] ?? `This pair is not supported.`}
            </TYPE.light>
            <Link external={true} href={`${explorerBase}/address/${pairId}`}>{`More about ${shortenAddress(
              pairId
            )}`}</Link>
          </AutoColumn>
        </BlockedMessageWrapper>
      </BlockedWrapper>
    )
  }

  return (
    <PageWrapper>
      <ThemedBackground backgroundColor={transparentize(0.6, backgroundColor)} />
      <span />
      <Warning
        type={'pair'}
        show={!dismissed && listedTokens && !(listedTokens.includes(token0?.id) && listedTokens.includes(token1?.id))}
        setShow={markAsDismissed}
        address={pairId}
      />
      <ContentWrapperLarge>
        {showIndexWarning && (
          <Panel style={{ padding: '1rem', marginBottom: '1rem' }} data-testid="pair-index-warning">
            <TYPE.main fontSize="0.95rem">Pair not indexed yet — showing on-chain snapshot.</TYPE.main>
            <TYPE.light fontSize="0.85rem" style={{ marginTop: '0.25rem' }}>
              Subgraph data may be incomplete until indexing finishes.
            </TYPE.light>
          </Panel>
        )}
        <RowBetween>
          <TYPE.body data-testid="pair-breadcrumb">
            <BasicLink to="/pairs">{'Pairs '}</BasicLink>→{' '}
            {token0?.symbol && token1?.symbol ? `${token0.symbol}-${token1.symbol}` : 'Loading'}
          </TYPE.body>
          {!below600 && <Search small={true} />}
        </RowBetween>
        {BOOST_REGISTRY_ADDRESS && (
          <Panel style={{ marginTop: '0.75rem', padding: '1rem' }} data-testid="pair-boost-panel">
            <RowBetween>
              <TYPE.main>Boost this pair</TYPE.main>
              {boostActive ? (
                <TYPE.light fontSize={12}>Boosted ({boostRemainingHours}h left)</TYPE.light>
              ) : (
                <TYPE.light fontSize={12}>24h feature</TYPE.light>
              )}
            </RowBetween>
            <TYPE.light fontSize={12} style={{ marginTop: '0.25rem' }}>
              Pay {boostFeeDisplay} NOVA (wrapped to WNOVA) to pin this pair in Boosted for 24h.
            </TYPE.light>
            {boostRpcError && (
              <TYPE.light fontSize={12} style={{ marginTop: '0.5rem' }}>
                RPC busy, retrying…
              </TYPE.light>
            )}
            <RowBetween style={{ marginTop: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
              <ButtonDark disabled={boostStatus.state === 'pending'} onClick={handleBoost}>
                {boostStatus.state === 'pending' ? 'Boosting…' : 'Boost pair'}
              </ButtonDark>
              {boostRpcError && <ButtonDark onClick={handleBoostRetry}>Retry</ButtonDark>}
              <CopyHelper toCopy={pairId} />
              {boostStatus.state === 'confirmed' && boostStatus.tx && (
                <Link external href={`${explorerBase}/tx/${boostStatus.tx}`}>
                  View tx ↗
                </Link>
              )}
            </RowBetween>
            {boostStatus.error && (
              <TYPE.light fontSize={12} color="text2" style={{ marginTop: '0.5rem' }}>
                {boostStatus.error}
              </TYPE.light>
            )}
          </Panel>
        )}
        <WarningGrouping
          disabled={
            !dismissed && listedTokens && !(listedTokens.includes(token0?.id) && listedTokens.includes(token1?.id))
          }
        >
          <OnchainMarketPanel
            rpcUrl={RPC_URL}
            factoryAddress={FACTORY_ADDRESS}
            baseTokenAddress={WNOVA_ADDRESS}
            quoteTokenAddress={quoteTokenAddress}
            baseSymbol="WNOVA"
            quoteSymbol={quoteSymbol}
            pairAddress={pairId}
            reserveBase={reserveWnovaNum}
            reserveQuote={reserveQuoteNum}
            liquiditySeries={liquiditySeries}
            swaps={transactions?.swaps || []}
            allowOnchain={!subgraphReady}
            testIdPrefix="pair-market"
            recentTradesTestId="pair-recent-trades"
            recentTradesEmptyTestId="pair-recent-trades-empty"
          />
          <DashboardWrapper>
            <AutoColumn gap="40px" style={{ marginBottom: '1.5rem' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  width: '100%',
                }}
              >
                <RowFixed style={{ flexWrap: 'wrap', minWidth: '100px' }}>
                  <RowFixed>
                    {token0 && token1 && (
                      <DoubleTokenLogo a0={token0?.id || ''} a1={token1?.id || ''} size={40} margin={true} />
                    )}{' '}
                    <TYPE.main
                      fontSize={below1080 ? '1.5rem' : '2rem'}
                      style={{ margin: '0 1rem' }}
                      data-testid="pair-title"
                    >
                    {token0 && token1 ? (
                      <>
                        <HoverSpan onClick={() => history.push(`/token/${token0Id}`)}>{token0.symbol}</HoverSpan>
                        <span>-</span>
                        <HoverSpan onClick={() => history.push(`/token/${token1Id}`)}>
                          {token1.symbol}
                          </HoverSpan>{' '}
                          Pair
                        </>
                      ) : (
                        ''
                      )}
                    </TYPE.main>
                    {boostActive && (
                      <Panel style={{ padding: '6px 10px', borderRadius: '999px' }}>
                        <TYPE.light fontSize={12}>Boosted · {boostRemainingHours}h</TYPE.light>
                      </Panel>
                    )}
                  </RowFixed>
                </RowFixed>
                <RowFixed
                  ml={below900 ? '0' : '2.5rem'}
                  mt={below1080 && '1rem'}
                  style={{
                    flexDirection: below1080 ? 'row-reverse' : 'initial',
                  }}
                >
                  {!!!savedPairs[pairId] && !below1080 ? (
                    <Hover onClick={() => addPair(pairId, token0.id, token1.id, token0.symbol, token1.symbol)}>
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

                  <Link external href={getPoolLink(token0?.id, token1?.id)}>
                    <ButtonLight color={backgroundColor}>+ Add Liquidity</ButtonLight>
                  </Link>
                  <Link external href={getSwapLink(token0?.id, token1?.id)}>
                    <ButtonDark ml={!below1080 && '.5rem'} mr={below1080 && '.5rem'} color={backgroundColor}>
                      Trade
                    </ButtonDark>
                  </Link>
                </RowFixed>
              </div>
            </AutoColumn>
            <AutoRow
              gap="6px"
              style={{
                width: 'fit-content',
                marginTop: below900 ? '1rem' : '0',
                marginBottom: below900 ? '0' : '2rem',
                flexWrap: 'wrap',
              }}
            >
              <FixedPanel onClick={() => history.push(`/token/${token0?.id}`)}>
                <RowFixed>
                  <TokenLogo address={token0?.id} size={'var(--avatar-sm)'} />
                  <TYPE.main fontSize={'16px'} lineHeight={1} fontWeight={500} ml={'4px'}>
                    {token0 && token1 ? `1 ${formattedSymbol0} = ${token0Rate} ${formattedSymbol1}` : '-'}
                  </TYPE.main>
                </RowFixed>
              </FixedPanel>
              <FixedPanel onClick={() => history.push(`/token/${token1?.id}`)}>
                <RowFixed>
                  <TokenLogo address={token1?.id} size={'var(--avatar-sm)'} />
                  <TYPE.main fontSize={'16px'} lineHeight={1} fontWeight={500} ml={'4px'}>
                    {token0 && token1 ? `1 ${formattedSymbol1} = ${token1Rate} ${formattedSymbol0}` : '-'}
                  </TYPE.main>
                </RowFixed>
              </FixedPanel>
            </AutoRow>
            <>
              {!below1080 && (
                <RowFixed>
                  <TYPE.main fontSize={'1.125rem'} mr="6px">
                    Pair Stats
                  </TYPE.main>
                  {showUSDWaning ? (
                    <HoverText text={UNTRACKED_COPY}>
                      <WarningIcon />
                    </HoverText>
                  ) : null}
                </RowFixed>
              )}
              <PanelWrapper style={{ marginTop: '1.5rem' }}>
                <Panel style={{ height: '100%' }}>
                  <AutoColumn gap="20px">
                    <RowBetween>
                      <TYPE.main>Total Liquidity (WNOVA)</TYPE.main>
                      <div />
                    </RowBetween>
                    <RowBetween align="flex-end">
                      <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={500}>
                        {formattedLiquidity}
                      </TYPE.main>
                      <TYPE.main>{liquidityChange}</TYPE.main>
                    </RowBetween>
                  </AutoColumn>
                </Panel>
                <Panel style={{ height: '100%' }}>
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
                <Panel style={{ height: '100%' }}>
                  <AutoColumn gap="20px">
                    <RowBetween>
                      <TYPE.main>Fees (24hrs, WNOVA)</TYPE.main>
                      <div />
                    </RowBetween>
                    <RowBetween align="flex-end">
                      <AutoColumn gap="6px">
                        <TYPE.main fontSize={'1.5rem'} lineHeight={1} fontWeight={500}>
                          {fees}
                        </TYPE.main>
                        <TYPE.light fontSize={12} color="text2">
                          Protocol: {protocolFees} WNOVA
                        </TYPE.light>
                      </AutoColumn>
                      <TYPE.main>{volumeChange}</TYPE.main>
                    </RowBetween>
                  </AutoColumn>
                </Panel>
                <Panel style={{ height: '100%' }}>
                  <AutoColumn gap="20px">
                    <RowBetween>
                      <TYPE.main>Pooled Tokens</TYPE.main>
                      <div />
                    </RowBetween>
                    <Hover onClick={() => history.push(`/token/${token0?.id}`)} fade={true}>
                      <AutoRow gap="4px">
                        <TokenLogo address={token0?.id} />
                        <TYPE.main fontSize={20} lineHeight={1} fontWeight={500}>
                          <RowFixed>
                    {isFiniteNum(reserve0) ? formattedNum(reserve0) : '—'}{' '}
                    <FormattedName text={token0?.symbol ?? ''} maxCharacters={8} margin={true} />
                          </RowFixed>
                        </TYPE.main>
                      </AutoRow>
                    </Hover>
                    <Hover onClick={() => history.push(`/token/${token1?.id}`)} fade={true}>
                      <AutoRow gap="4px">
                        <TokenLogo address={token1?.id} />
                        <TYPE.main fontSize={20} lineHeight={1} fontWeight={500}>
                          <RowFixed>
                    {isFiniteNum(reserve1) ? formattedNum(reserve1) : '—'}{' '}
                    <FormattedName text={token1?.symbol ?? ''} maxCharacters={8} margin={true} />
                          </RowFixed>
                        </TYPE.main>
                      </AutoRow>
                    </Hover>
                  </AutoColumn>
                </Panel>
                {(token0Meta || token1Meta) && (
                  <Panel style={{ height: '100%' }}>
                    <AutoColumn gap="12px">
                      <TYPE.main>Token profiles</TYPE.main>
                      {token0Meta && (
                        <AutoColumn gap="6px">
                          <TYPE.main fontSize={14}>{token0?.symbol || 'Token0'}</TYPE.main>
                          {token0Meta.description && (
                            <TYPE.light fontSize={12} color="text2">
                              {token0Meta.description}
                            </TYPE.light>
                          )}
                          <AutoRow gap="10px" style={{ flexWrap: 'wrap' }}>
                            {token0Meta.website && (
                              <Link external href={token0Meta.website}>
                                Website ↗
                              </Link>
                            )}
                            {token0Meta.twitter && (
                              <Link external href={token0Meta.twitter}>
                                X ↗
                              </Link>
                            )}
                            {token0Meta.telegram && (
                              <Link external href={token0Meta.telegram}>
                                Telegram ↗
                              </Link>
                            )}
                            {token0Meta.discord && (
                              <Link external href={token0Meta.discord}>
                                Discord ↗
                              </Link>
                            )}
                          </AutoRow>
                        </AutoColumn>
                      )}
                      {token1Meta && (
                        <AutoColumn gap="6px" style={{ marginTop: 8 }}>
                          <TYPE.main fontSize={14}>{token1?.symbol || 'Token1'}</TYPE.main>
                          {token1Meta.description && (
                            <TYPE.light fontSize={12} color="text2">
                              {token1Meta.description}
                            </TYPE.light>
                          )}
                          <AutoRow gap="10px" style={{ flexWrap: 'wrap' }}>
                            {token1Meta.website && (
                              <Link external href={token1Meta.website}>
                                Website ↗
                              </Link>
                            )}
                            {token1Meta.twitter && (
                              <Link external href={token1Meta.twitter}>
                                X ↗
                              </Link>
                            )}
                            {token1Meta.telegram && (
                              <Link external href={token1Meta.telegram}>
                                Telegram ↗
                              </Link>
                            )}
                            {token1Meta.discord && (
                              <Link external href={token1Meta.discord}>
                                Discord ↗
                              </Link>
                            )}
                          </AutoRow>
                        </AutoColumn>
                      )}
                    </AutoColumn>
                  </Panel>
                )}
                <Panel
                  style={{
                    gridColumn: below1080 ? '1' : '2/4',
                    gridRow: below1080 ? '' : '1/5',
                  }}
                >
                  <PairChart
                    address={pairId}
                    color={backgroundColor}
                    base0={isFiniteNum(reserve0) && isFiniteNum(reserve1) && reserve0 > 0 ? reserve1 / reserve0 : 0}
                    base1={isFiniteNum(reserve0) && isFiniteNum(reserve1) && reserve1 > 0 ? reserve0 / reserve1 : 0}
                  />
                </Panel>
              </PanelWrapper>
              <TYPE.main fontSize={'1.125rem'} style={{ marginTop: '3rem' }}>
                Transactions
              </TYPE.main>
              <span
                data-testid="pair-swaps-count"
                data-value={swapsCount}
                style={{ position: 'absolute', left: '-9999px', top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
              >
                {swapsCount}
              </span>
              <Panel
                style={{
                  marginTop: '1.5rem',
                }}
              >
                {transactions ? (
                  hasTransactions ? (
                    <TxnList transactions={transactions} />
                  ) : (
                    <EmptyCard height="140px">No transactions for this pair yet.</EmptyCard>
                  )
                ) : (
                  <Loader />
                )}
              </Panel>
              <RowBetween style={{ marginTop: '3rem' }}>
                <TYPE.main fontSize={'1.125rem'}>Pair Information</TYPE.main>{' '}
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
                    <TYPE.main>Pair Name</TYPE.main>
                    <TYPE.main style={{ marginTop: '.5rem' }}>
                      <RowFixed>
                        <FormattedName text={token0?.symbol ?? '—'} maxCharacters={8} />
                        -
                        <FormattedName text={token1?.symbol ?? '—'} maxCharacters={8} />
                      </RowFixed>
                    </TYPE.main>
                  </Column>
                  <Column>
                    <TYPE.main>Pair Address</TYPE.main>
                    <AutoRow align="flex-end">
                      <TYPE.main style={{ marginTop: '.5rem' }}>
                        {pairId.slice(0, 6) + '...' + pairId.slice(38, 42)}
                      </TYPE.main>
                      <CopyHelper toCopy={pairId} />
                    </AutoRow>
                  </Column>
                  <Column>
                    <TYPE.main>
                      <RowFixed>
                        <span>{token0?.symbol ? `${token0.symbol} Address` : 'Token0 Address'}</span>
                      </RowFixed>
                    </TYPE.main>
                    <AutoRow align="flex-end">
                      <TYPE.main style={{ marginTop: '.5rem' }} data-testid="pair-token0-address">
                        {token0?.id ? `${token0.id.slice(0, 6)}...${token0.id.slice(38, 42)}` : '—'}
                      </TYPE.main>
                      {token0?.id ? <CopyHelper toCopy={token0?.id} /> : null}
                    </AutoRow>
                  </Column>
                  <Column>
                    <TYPE.main>
                      <RowFixed>
                        <span>{token1?.symbol ? `${token1.symbol} Address` : 'Token1 Address'}</span>
                      </RowFixed>
                    </TYPE.main>
                    <AutoRow align="flex-end">
                      <TYPE.main style={{ marginTop: '.5rem' }} fontSize={16} data-testid="pair-token1-address">
                        {token1?.id ? `${token1.id.slice(0, 6)}...${token1.id.slice(38, 42)}` : '—'}
                      </TYPE.main>
                      {token1?.id ? <CopyHelper toCopy={token1?.id} /> : null}
                    </AutoRow>
                  </Column>
                  <ButtonLight color={backgroundColor}>
                    <Link color={backgroundColor} external href={`${explorerBase}/address/${pairId}`}>
                      View on Explorer ↗
                    </Link>
                  </ButtonLight>
                </TokenDetailsLayout>
              </Panel>
            </>
          </DashboardWrapper>
        </WarningGrouping>
      </ContentWrapperLarge>
    </PageWrapper>
  )
}

function PairPage({ pairAddress, history }) {
  const pairId = normAddr(pairAddress) || pairAddress
  const isValidPair = Boolean(pairId && isAddress(pairId))

  if (!isValidPair) {
    return (
      <PageWrapper>
        <ContentWrapperLarge>
          <Panel style={{ padding: '2rem' }}>
            <TYPE.main fontSize="1.25rem">Invalid pair address</TYPE.main>
            <TYPE.light style={{ marginTop: '0.5rem' }}>
              The pair address in the URL is not a valid EVM address.
            </TYPE.light>
          </Panel>
        </ContentWrapperLarge>
      </PageWrapper>
    )
  }

  return <PairPageContent pairId={pairId} history={history} />
}

export default withRouter(PairPage)
