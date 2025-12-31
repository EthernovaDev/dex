import React, { useContext, useEffect, useMemo, useState } from 'react'
import { ThemeContext } from 'styled-components'
import { JSBI, Pair, Token } from '@im33357/uniswap-v2-sdk'
import { Link } from 'react-router-dom'
import { SwapPoolTabs } from '../../components/NavigationTabs'

import Question from '../../components/QuestionHelper'
import FullPositionCard from '../../components/PositionCard'
import { useTokenBalancesWithLoadingIndicator } from '../../state/wallet/hooks'
import { StyledInternalLink, TYPE } from '../../theme'
import { Text } from 'rebass'
import { GreyCard, LightCard } from '../../components/Card'
import { RowBetween } from '../../components/Row'
import { ButtonPrimary } from '../../components/Button'
import { AutoColumn } from '../../components/Column'

import { useActiveWeb3React } from '../../hooks'
import { usePairs } from '../../data/Reserves'
import { toV2LiquidityToken, useTrackedTokenPairs } from '../../state/user/hooks'
import { usePairAddresses } from '../../hooks/usePairAddresses'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { usePairLookup } from '../../hooks/usePairLookup'
import { usePairPosition } from '../../hooks/usePairPosition'
import AppBody from '../AppBody'
import { Dots } from '../../components/swap/styleds'
import { isAddress } from '../../utils'
import { formatUnits } from '@ethersproject/units'

export default function Pool() {
  const theme = useContext(ThemeContext)
  const { account } = useActiveWeb3React()
  const { config } = useEthernovaConfig()

  const fallbackChainId = config.chainId || 77777
  const tonyAddress = isAddress(config.tokens.TONY.address)
  const wnovaAddress = isAddress(config.tokens.WNOVA.address)
  const tonyToken = useMemo(
    () =>
      tonyAddress
        ? new Token(
            fallbackChainId,
            tonyAddress,
            config.tokens.TONY.decimals || 18,
            config.tokens.TONY.symbol || 'TONY',
            config.tokens.TONY.name || 'STARK - IRON MAN'
          )
        : null,
    [tonyAddress, fallbackChainId, config]
  )
  const wnovaToken = useMemo(
    () =>
      wnovaAddress
        ? new Token(
            fallbackChainId,
            wnovaAddress,
            config.tokens.WNOVA.decimals || 18,
            config.tokens.WNOVA.symbol || 'WNOVA',
            config.tokens.WNOVA.name || 'Wrapped NOVA'
          )
        : null,
    [wnovaAddress, fallbackChainId, config]
  )
  const pinnedLookup = usePairLookup(tonyToken ?? undefined, wnovaToken ?? undefined)
  const pinnedPosition = usePairPosition(pinnedLookup.pairAddress, account ?? undefined)
  const pinnedLpBalance = pinnedPosition.lpBalance
  const pinnedHasPosition = Boolean(
    pinnedLpBalance && JSBI.greaterThan(JSBI.BigInt(pinnedLpBalance.toString()), JSBI.BigInt(0))
  )
  const pinnedLpFormatted = pinnedLpBalance ? formatUnits(pinnedLpBalance, 18) : undefined
  const pinnedViewState = useMemo(() => {
    if (!account) return 'idle'
    if (pinnedLookup.status === 'error' || pinnedLookup.error) return 'error'
    if (pinnedLookup.status === 'not_exists') return 'no_pool'
    if (pinnedLookup.status === 'loading') return 'loading'
    if (pinnedLookup.status === 'exists') {
      if (pinnedPosition.status === 'rpc_unstable') return 'error'
      if (pinnedPosition.status === 'loading') return 'loading'
      return pinnedHasPosition ? 'found' : 'no_position'
    }
    return 'idle'
  }, [account, pinnedLookup.status, pinnedLookup.error, pinnedPosition.status, pinnedHasPosition])

  // fetch the user's balances of all tracked V2 LP tokens
  const trackedTokenPairs = useTrackedTokenPairs()
  const { addresses: pairAddressMap, loading: pairAddressLoading } = usePairAddresses(
    trackedTokenPairs as [Token, Token][]
  )

  const tokenPairsWithLiquidityTokens = useMemo(() => {
    return trackedTokenPairs
      .map(tokens => {
        const [tokenA, tokenB] = tokens as [Token, Token]
        const key =
          tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
            ? `${tokenA.address.toLowerCase()}:${tokenB.address.toLowerCase()}`
            : `${tokenB.address.toLowerCase()}:${tokenA.address.toLowerCase()}`
        const pairAddress = pairAddressMap[key]
        if (!pairAddress && fallbackChainId === 77777) {
          return null
        }
        const liquidityToken = pairAddress
          ? new Token(tokenA.chainId, pairAddress, 18, 'LP', 'NovaDEX LP')
          : toV2LiquidityToken(tokens)
        return { liquidityToken, tokens }
      })
      .filter((item): item is { liquidityToken: Token; tokens: [Token, Token] } => Boolean(item))
  }, [trackedTokenPairs, pairAddressMap, fallbackChainId])
  const liquidityTokens = useMemo(() => tokenPairsWithLiquidityTokens.map(tpwlt => tpwlt.liquidityToken), [
    tokenPairsWithLiquidityTokens
  ])
  const [v2PairsBalances, fetchingV2PairBalances] = useTokenBalancesWithLoadingIndicator(
    account ?? undefined,
    liquidityTokens
  )

  // fetch the reserves for all V2 pools in which the user has a balance
  const liquidityTokensWithBalances = useMemo(
    () =>
      tokenPairsWithLiquidityTokens.filter(({ liquidityToken }) =>
        v2PairsBalances[liquidityToken.address]?.greaterThan('0')
      ),
    [tokenPairsWithLiquidityTokens, v2PairsBalances]
  )

  const v2Pairs = usePairs(liquidityTokensWithBalances.map(({ tokens }) => tokens))
  const v2IsLoading =
    fetchingV2PairBalances ||
    pairAddressLoading ||
    v2Pairs?.length < liquidityTokensWithBalances.length ||
    v2Pairs?.some(V2Pair => !V2Pair)

  const allV2PairsWithLiquidity = v2Pairs.map(([, pair]) => pair).filter((v2Pair): v2Pair is Pair => Boolean(v2Pair))

  const [timedOut, setTimedOut] = useState(false)
  useEffect(() => {
    if (!v2IsLoading) {
      setTimedOut(false)
      return
    }
    const timeout = setTimeout(() => setTimedOut(true), 10000)
    return () => clearTimeout(timeout)
  }, [v2IsLoading])

  return (
    <>
      <AppBody>
        <SwapPoolTabs active={'pool'} />
        <AutoColumn gap="lg" justify="center">
          <ButtonPrimary id="join-pool-button" as={Link} style={{ padding: 16 }} to="/add/ETH">
            <Text fontWeight={500} fontSize={20}>
              Add Liquidity
            </Text>
          </ButtonPrimary>

          <AutoColumn gap="12px" style={{ width: '100%' }}>
            <RowBetween padding={'0 8px'}>
              <Text color={theme.text1} fontWeight={500}>
                Your Liquidity
              </Text>
              <Question text="When you add liquidity, you are given pool tokens that represent your share. If you don’t see a pool you joined in this list, try importing a pool below." />
            </RowBetween>

            {!account ? (
              <LightCard padding="40px">
                <TYPE.body color={theme.text3} textAlign="center">
                  Connect to a wallet to view your liquidity.
                </TYPE.body>
              </LightCard>
            ) : (
              <GreyCard padding="16px">
                <AutoColumn gap="xs">
                  <Text fontWeight={600}>Pinned position (TONY/WNOVA)</Text>
                  {pinnedViewState === 'found' ? (
                    <>
                      <Text>LP balance: {pinnedLpFormatted ?? '—'} LP</Text>
                      {tonyToken?.address && wnovaToken?.address ? (
                        <StyledInternalLink to={`/add/${tonyToken.address}/${wnovaToken.address}`}>
                          Manage position
                        </StyledInternalLink>
                      ) : null}
                    </>
                  ) : pinnedViewState === 'loading' ? (
                    <Text>
                      Checking position <Dots />
                    </Text>
                  ) : pinnedViewState === 'error' ? (
                    <RowBetween>
                      <Text color={theme.text3}>RPC unstable — Retry</Text>
                      <ButtonPrimary padding="6px 10px" onClick={pinnedPosition.retry}>
                        Retry
                      </ButtonPrimary>
                    </RowBetween>
                  ) : pinnedViewState === 'no_pool' ? (
                    <Text>Pool not found.</Text>
                  ) : (
                    <Text>Pool exists, but you have no liquidity yet.</Text>
                  )}
                </AutoColumn>
              </GreyCard>
            )}

            {account && v2IsLoading && !timedOut ? (
              <LightCard padding="40px">
                <TYPE.body color={theme.text3} textAlign="center">
                  <Dots>Loading</Dots>
                </TYPE.body>
              </LightCard>
            ) : account && v2IsLoading && timedOut ? (
              <LightCard padding="40px">
                <AutoColumn gap="sm" justify="center">
                  <TYPE.body color={theme.text3} textAlign="center">
                    RPC unstable — Retry
                  </TYPE.body>
                  <ButtonPrimary padding="10px 14px" onClick={() => window.location.reload()}>
                    Retry
                  </ButtonPrimary>
                </AutoColumn>
              </LightCard>
            ) : allV2PairsWithLiquidity?.length > 0 ? (
              <>
                {allV2PairsWithLiquidity.map(v2Pair => {
                  const tokenA = v2Pair.token0
                  const tokenB = v2Pair.token1
                  const key =
                    tokenA.address.toLowerCase() < tokenB.address.toLowerCase()
                      ? `${tokenA.address.toLowerCase()}:${tokenB.address.toLowerCase()}`
                      : `${tokenB.address.toLowerCase()}:${tokenA.address.toLowerCase()}`
                  const pairAddress = pairAddressMap[key]
                  const liquidityTokenOverride = pairAddress
                    ? new Token(v2Pair.chainId, pairAddress, 18, 'LP', 'NovaDEX LP')
                    : undefined
                  return (
                    <FullPositionCard
                      key={v2Pair.liquidityToken.address}
                      pair={v2Pair}
                      liquidityTokenOverride={liquidityTokenOverride}
                    />
                  )
                })}
              </>
            ) : (
              <LightCard padding="40px">
                <TYPE.body color={theme.text3} textAlign="center">
                  No liquidity found.
                </TYPE.body>
              </LightCard>
            )}

            <div>
              <Text textAlign="center" fontSize={14} style={{ padding: '.5rem 0 .5rem 0' }}>
                {"Don't see a pool you joined?"}{' '}
                <StyledInternalLink id="import-pool-link" to="/find">
                  Import it.
                </StyledInternalLink>
              </Text>
            </div>
          </AutoColumn>
        </AutoColumn>
      </AppBody>
    </>
  )
}
