import { Currency, ETHER, JSBI, Pair, Token, TokenAmount, currencyEquals } from '@im33357/uniswap-v2-sdk'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus } from 'react-feather'
import { Text } from 'rebass'
import { ButtonDropdownLight, ButtonPrimary } from '../../components/Button'
import { LightCard } from '../../components/Card'
import { AutoColumn, ColumnCenter } from '../../components/Column'
import CurrencyLogo from '../../components/CurrencyLogo'
import { FindPoolTabs } from '../../components/NavigationTabs'
import { MinimalPositionCard } from '../../components/PositionCard'
import Row from '../../components/Row'
import CurrencySearchModal from '../../components/SearchModal/CurrencySearchModal'
import { PairState, usePair } from '../../data/Reserves'
import { useActiveWeb3React } from '../../hooks'
import { usePairAdder } from '../../state/user/hooks'
import { ExternalLink, StyledInternalLink } from '../../theme'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { usePairLookup } from '../../hooks/usePairLookup'
import { isAddress } from '../../utils'
import { getEtherscanLink, shortenAddress } from '../../utils'
import { currencyId } from '../../utils/currencyId'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import { usePairPosition } from '../../hooks/usePairPosition'
import { emitDebug } from '../../utils/debugEvents'
import { formatUnits } from '@ethersproject/units'
import AppBody from '../AppBody'
import { Dots } from '../Pool/styleds'
import { wrappedCurrency } from '../../utils/wrappedCurrency'
import { normalizePairReserves } from '../../utils/pairReserves'

enum Fields {
  TOKEN0 = 0,
  TOKEN1 = 1
}

export default function PoolFinder() {
  const { account, chainId } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const fallbackChainId = config.chainId || 121525

  const [showSearch, setShowSearch] = useState<boolean>(false)
  const [activeField, setActiveField] = useState<number>(Fields.TOKEN1)

  const [currency0, setCurrency0] = useState<Currency | null>(null)
  const [currency1, setCurrency1] = useState<Currency | null>(null)
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
    [config, fallbackChainId, tonyAddress]
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
    [config, fallbackChainId, wnovaAddress]
  )

  useEffect(() => {
    if (!currency0 && tonyToken) setCurrency0(tonyToken)
    if (!currency1 && wnovaToken) setCurrency1(wnovaToken)
  }, [currency0, currency1, tonyToken, wnovaToken])
  const currency0Symbol = currency0 === ETHER ? NATIVE_SYMBOL : currency0?.symbol
  const currency1Symbol = currency1 === ETHER ? NATIVE_SYMBOL : currency1?.symbol

  const [pairState, pair] = usePair(currency0 ?? undefined, currency1 ?? undefined)
  const pairLookup = usePairLookup(currency0 ?? undefined, currency1 ?? undefined)
  const addPair = usePairAdder()
  useEffect(() => {
    if (pair) {
      addPair(pair)
    }
  }, [pair, addPair])

  const activeChainId = chainId ?? fallbackChainId
  const wrapped0 = wrappedCurrency(currency0 ?? undefined, activeChainId)
  const wrapped1 = wrappedCurrency(currency1 ?? undefined, activeChainId)
  const fallbackPair = useMemo(() => {
    if (pair) return pair
    if (pairLookup.status !== 'exists' || !pairLookup.reserves) return null
    if (!wrapped0 || !wrapped1) return null
    const normalized = normalizePairReserves(
      wrapped0,
      wrapped1,
      pairLookup.reserves.reserve0,
      pairLookup.reserves.reserve1,
      pairLookup.token0,
      pairLookup.token1
    )
    if (!normalized) return null
    try {
      return new Pair(
        new TokenAmount(normalized.token0, normalized.reserve0.toString()),
        new TokenAmount(normalized.token1, normalized.reserve1.toString())
      )
    } catch {
      return null
    }
  }, [pair, pairLookup.status, pairLookup.reserves, pairLookup.token0, pairLookup.token1, wrapped0, wrapped1])
  const effectivePair = pair ?? fallbackPair
  const pairAddress =
    pairLookup.pairAddress ?? (activeChainId !== 121525 ? pair?.liquidityToken?.address : undefined)
  const lpTokenOverride = useMemo(() => {
    if (!pairAddress || !isAddress(pairAddress)) return undefined
    return new Token(fallbackChainId, pairAddress, 18, 'LP', 'NovaDEX LP')
  }, [pairAddress, fallbackChainId])
  const position = usePairPosition(pairAddress, account ?? undefined)
  const lpBalanceRaw = position.lpBalance
  const hasPosition = Boolean(lpBalanceRaw && JSBI.greaterThan(JSBI.BigInt(lpBalanceRaw.toString()), JSBI.BigInt(0)))
  const lpBalanceFormatted = lpBalanceRaw ? formatUnits(lpBalanceRaw, 18) : undefined

  const isNativeWrappedPair = useMemo(() => {
    if (!currency0 || !currency1 || !wnovaToken) return false
    const currency0IsNative = currency0 === ETHER
    const currency1IsNative = currency1 === ETHER
    const currency0IsWrapped = currencyEquals(currency0, wnovaToken)
    const currency1IsWrapped = currencyEquals(currency1, wnovaToken)
    return (currency0IsNative && currency1IsWrapped) || (currency1IsNative && currency0IsWrapped)
  }, [currency0, currency1, wnovaToken])

  const debugEnabled = typeof window !== 'undefined' && window.location.search.includes('debug=1')
  useEffect(() => {
    if (!debugEnabled) return
    emitDebug({
      lastLiquidityContext: {
        chainId: chainId ?? null,
        chainIdRaw: typeof window !== 'undefined' ? (window as any)?.ethereum?.chainId ?? null : null,
        account: account ?? null,
        currencyA:
          currency0 instanceof Token
            ? { symbol: currency0.symbol, address: currency0.address }
            : currency0
            ? { symbol: currency0.symbol, address: null }
            : undefined,
        currencyB:
          currency1 instanceof Token
            ? { symbol: currency1.symbol, address: currency1.address }
            : currency1
            ? { symbol: currency1.symbol, address: null }
            : undefined,
        pairAddress: pairAddress ?? null,
        token0: position.token0 ?? null,
        token1: position.token1 ?? null,
        reserve0: position.reserves?.reserve0?.toString() ?? null,
        reserve1: position.reserves?.reserve1?.toString() ?? null,
        lpBalanceRaw: lpBalanceRaw?.toString() ?? null,
        lpReadPath: position.source,
        lastRpcError: position.error ?? null
      }
    })
  }, [
    debugEnabled,
    chainId,
    account,
    currency0,
    currency1,
    pairAddress,
    position.token0,
    position.token1,
    position.reserves,
    position.source,
    position.error,
    lpBalanceRaw
  ])
  const explorerChainId = config.chainId || chainId
  const pairExplorerLink =
    explorerChainId && pairAddress ? getEtherscanLink(explorerChainId, pairAddress, 'address') : undefined

  const positionViewState = useMemo(() => {
    if (!account) return 'idle'
    if (pairLookup.status === 'error' || pairLookup.error) return 'error'
    if (pairLookup.status === 'not_exists') return 'no_pool'
    if (pairLookup.status === 'loading') return 'loading'
    if (pairLookup.status === 'exists') {
      if (position.status === 'rpc_unstable') return 'error'
      if (position.status === 'loading') return 'loading'
      return hasPosition ? 'found' : 'no_position'
    }
    return 'idle'
  }, [account, pairLookup.status, pairLookup.error, position.status, hasPosition])

  const handleCurrencySelect = useCallback(
    (currency: Currency) => {
      emitDebug({
        lastAction: {
          name: 'IMPORT_POOL_SELECT_TOKEN',
          time: new Date().toISOString(),
          meta: { field: activeField === Fields.TOKEN0 ? 'TOKEN0' : 'TOKEN1', currency: currency.symbol }
        }
      })
      if (activeField === Fields.TOKEN0) {
        setCurrency0(currency)
      } else {
        setCurrency1(currency)
      }
    },
    [activeField]
  )

  const handleImportTonyWnova = useCallback(() => {
    if (tonyToken) setCurrency0(tonyToken)
    if (wnovaToken) setCurrency1(wnovaToken)
  }, [tonyToken, wnovaToken])

  const handleSearchDismiss = useCallback(() => {
    setShowSearch(false)
  }, [setShowSearch])

  useEffect(() => {
    if (!debugEnabled) return
    emitDebug({
      lastAction: {
        name: 'IMPORT_POOL_LOOKUP',
        time: new Date().toISOString(),
        meta: { status: pairLookup.status }
      },
      lastPositionState: {
        name: positionViewState,
        time: new Date().toISOString(),
        meta: { lpBalanceRaw: lpBalanceRaw?.toString() ?? null }
      }
    })
  }, [debugEnabled, pairLookup.status, positionViewState, lpBalanceRaw])

  const prerequisiteMessage = (
    <LightCard padding="45px 10px">
      <Text textAlign="center">
        {!account ? 'Connect to a wallet to find pools' : 'Select a token to find your liquidity.'}
      </Text>
    </LightCard>
  )

  return (
    <AppBody>
      <FindPoolTabs />
      <AutoColumn gap="md">
        <ButtonDropdownLight
          onClick={() => {
            setShowSearch(true)
            setActiveField(Fields.TOKEN0)
          }}
        >
          {currency0 ? (
            <Row>
              <CurrencyLogo currency={currency0} />
              <Text fontWeight={500} fontSize={20} marginLeft={'12px'}>
                {currency0Symbol}
              </Text>
            </Row>
          ) : (
            <Text fontWeight={500} fontSize={20} marginLeft={'12px'}>
              Select a Token
            </Text>
          )}
        </ButtonDropdownLight>

        <ColumnCenter>
          <Plus size="16" color="#888D9B" />
        </ColumnCenter>

        <ButtonDropdownLight
          onClick={() => {
            setShowSearch(true)
            setActiveField(Fields.TOKEN1)
          }}
        >
          {currency1 ? (
            <Row>
              <CurrencyLogo currency={currency1} />
              <Text fontWeight={500} fontSize={20} marginLeft={'12px'}>
                {currency1Symbol}
              </Text>
            </Row>
          ) : (
            <Text fontWeight={500} fontSize={20} marginLeft={'12px'}>
              Select a Token
            </Text>
          )}
        </ButtonDropdownLight>

        {hasPosition && (
          <ColumnCenter
            style={{ justifyItems: 'center', backgroundColor: '', padding: '12px 0px', borderRadius: '12px' }}
          >
            <Text textAlign="center" fontWeight={500}>
              Pool Found!
            </Text>
          </ColumnCenter>
        )}

        {currency0 && currency1 ? (
          !account ? (
            <LightCard padding="45px 10px">
              <Text textAlign="center">Connect wallet to view your liquidity.</Text>
            </LightCard>
          ) : (
          isNativeWrappedPair ? (
            <LightCard padding="45px 10px">
              <AutoColumn gap="sm" justify="center">
                <Text textAlign="center" fontWeight={500}>
                  NOVA is native; pools use WNOVA. Try TONY/WNOVA.
                </Text>
                <ButtonPrimary padding="12px" onClick={handleImportTonyWnova}>
                  Import TONY/WNOVA pool
                </ButtonPrimary>
              </AutoColumn>
            </LightCard>
          ) : pairLookup.status === 'exists' ? (
            positionViewState === 'found' ? (
              <>
                {effectivePair ? (
                  <MinimalPositionCard
                    pair={effectivePair}
                    border="1px solid #CED0D9"
                    liquidityTokenOverride={lpTokenOverride}
                  />
                ) : (
                  <LightCard padding="45px 10px">
                    <Text textAlign="center">Pool found. Loading position details…</Text>
                  </LightCard>
                )}
                {pairExplorerLink && pairAddress && (
                  <LightCard padding="12px 10px">
                    <AutoColumn gap="xs" justify="center">
                      <Text textAlign="center" fontSize={14}>
                        Pair address
                      </Text>
                      <ExternalLink href={pairExplorerLink}>{shortenAddress(pairAddress)}</ExternalLink>
                    </AutoColumn>
                  </LightCard>
                )}
                {debugEnabled && (
                  <LightCard padding="12px 10px">
                    <AutoColumn gap="xs" justify="center">
                      <Text textAlign="center" fontSize={12}>
                        ChainId: {chainId ?? '—'} Account: {account ? shortenAddress(account) : '—'}
                      </Text>
                      <Text textAlign="center" fontSize={12}>
                        Pair: {pairAddress ? shortenAddress(pairAddress) : '—'}
                      </Text>
                      <Text textAlign="center" fontSize={12}>
                        Reserves: {position.reserves?.reserve0?.toString() ?? '—'} /{' '}
                        {position.reserves?.reserve1?.toString() ?? '—'}
                      </Text>
                      <Text textAlign="center" fontSize={12}>
                        LP: {lpBalanceFormatted ?? '—'} (raw {lpBalanceRaw?.toString() ?? '—'})
                      </Text>
                      <Text textAlign="center" fontSize={12}>
                        Read path: {position.source}
                      </Text>
                      {position.error && (
                        <Text textAlign="center" fontSize={12}>
                          Error: {position.error}
                        </Text>
                      )}
                    </AutoColumn>
                  </LightCard>
                )}
              </>
            ) : positionViewState === 'error' ? (
              <LightCard padding="45px 10px">
                <AutoColumn gap="sm" justify="center">
                  <Text textAlign="center">RPC unstable — unable to read LP balance.</Text>
                  <ButtonPrimary padding="12px" onClick={position.retry}>
                    Retry
                  </ButtonPrimary>
                </AutoColumn>
              </LightCard>
            ) : positionViewState === 'loading' ? (
              <LightCard padding="45px 10px">
                <AutoColumn gap="sm" justify="center">
                  <Text textAlign="center">
                    Checking position
                    <Dots />
                  </Text>
                </AutoColumn>
              </LightCard>
            ) : (
              <LightCard padding="45px 10px">
                <AutoColumn gap="sm" justify="center">
                  <Text textAlign="center">Pool exists, but you have no liquidity yet.</Text>
                  <StyledInternalLink to={`/add/${currencyId(currency0)}/${currencyId(currency1)}`}>
                    <Text textAlign="center">Add liquidity.</Text>
                  </StyledInternalLink>
                  {pairExplorerLink && pairAddress && (
                    <ExternalLink href={pairExplorerLink}>Pair: {shortenAddress(pairAddress)}</ExternalLink>
                  )}
                </AutoColumn>
              </LightCard>
            )
          ) : pairLookup.status === 'not_exists' ? (
            <LightCard padding="45px 10px">
              <AutoColumn gap="sm" justify="center">
                <Text textAlign="center">Pool not found.</Text>
                <StyledInternalLink to={`/add/${currencyId(currency0)}/${currencyId(currency1)}`}>
                  Create pool (add liquidity).
                </StyledInternalLink>
              </AutoColumn>
            </LightCard>
          ) : pairLookup.status === 'error' ? (
            <LightCard padding="45px 10px">
              <AutoColumn gap="sm" justify="center">
                <Text textAlign="center" fontWeight={500}>
                  Pool lookup failed (RPC unstable).
                </Text>
                <ButtonPrimary padding="12px" onClick={pairLookup.retry}>
                  Retry
                </ButtonPrimary>
              </AutoColumn>
            </LightCard>
          ) : pairState === PairState.INVALID ? (
            <LightCard padding="45px 10px">
              <AutoColumn gap="sm" justify="center">
                <Text textAlign="center" fontWeight={500}>
                  Invalid pair.
                </Text>
              </AutoColumn>
            </LightCard>
          ) : pairLookup.status === 'loading' ? (
            <LightCard padding="45px 10px">
              <AutoColumn gap="sm" justify="center">
                <Text textAlign="center">
                  Loading
                  <Dots />
                </Text>
              </AutoColumn>
            </LightCard>
          ) : null
          )
        ) : (
          prerequisiteMessage
        )}
      </AutoColumn>

      <CurrencySearchModal
        isOpen={showSearch}
        onCurrencySelect={handleCurrencySelect}
        onDismiss={handleSearchDismiss}
        showCommonBases
        selectedCurrency={(activeField === Fields.TOKEN0 ? currency1 : currency0) ?? undefined}
      />
    </AppBody>
  )
}
