import { CurrencyAmount, ETHER, JSBI, Percent, Router, Token, Trade } from '@im33357/uniswap-v2-sdk'
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { ArrowDown } from 'react-feather'
import ReactGA from 'react-ga'
import { Text } from 'rebass'
import { ThemeContext } from 'styled-components'
import AddressInputPanel from '../../components/AddressInputPanel'
import { ButtonError, ButtonLight, ButtonPrimary, ButtonConfirmed } from '../../components/Button'
import Card, { GreyCard } from '../../components/Card'
import { AutoColumn } from '../../components/Column'
import ConfirmSwapModal from '../../components/swap/ConfirmSwapModal'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import { SwapPoolTabs } from '../../components/NavigationTabs'
import { AutoRow, RowBetween } from '../../components/Row'
import AdvancedSwapDetailsDropdown from '../../components/swap/AdvancedSwapDetailsDropdown'
import BetterTradeLink from '../../components/swap/BetterTradeLink'
import confirmPriceImpactWithoutFee from '../../components/swap/confirmPriceImpactWithoutFee'
import { ArrowWrapper, BottomGrouping, SwapCallbackError, Wrapper } from '../../components/swap/styleds'
import TradePrice from '../../components/swap/TradePrice'
import TokenWarningModal from '../../components/TokenWarningModal'
import ProgressSteps from '../../components/ProgressSteps'
import WrapUnwrapModal from '../../components/WrapUnwrap/WrapUnwrapModal'

import { BETTER_TRADE_LINK_THRESHOLD, BIPS_BASE, INITIAL_ALLOWED_SLIPPAGE, SWAP_ROUTER_ADDRESS } from '../../constants'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import { getTradeVersion, isTradeBetter } from '../../data/V1'
import { useActiveWeb3React } from '../../hooks'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { useSwapRouterAddress } from '../../hooks/useSwapRouterAddress'
import { useCurrency } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallbackFromTrade } from '../../hooks/useApproveCallback'
import { usePairLookup } from '../../hooks/usePairLookup'
import { useTokenAllowance } from '../../data/Allowances'
import useENSAddress from '../../hooks/useENSAddress'
import { useSwapCallback } from '../../hooks/useSwapCallback'
import useToggledVersion, { Version } from '../../hooks/useToggledVersion'
import useWrapCallback, { WrapType } from '../../hooks/useWrapCallback'
import { useToggleSettingsMenu, useWalletModalToggle } from '../../state/application/hooks'
import { emitDebug } from '../../utils/debugEvents'
import { applyTreasuryFee, grossUpForTreasury, isWnovaCurrency, treasuryFeeFromGross } from '../../utils/treasuryFee'
import { computeSwapSlippageAmounts } from '../../utils/prices'
import { getRouterContract } from '../../utils'
import { Field } from '../../state/swap/actions'
import {
  useDefaultsFromURLSearch,
  useDerivedSwapInfo,
  useSwapActionHandlers,
  useSwapState
} from '../../state/swap/hooks'
import { useExpertModeManager, useUserDeadline, useUserSlippageTolerance } from '../../state/user/hooks'
import { LinkStyledButton, StyledInternalLink, TYPE } from '../../theme'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { useNativeMax } from '../../hooks/useNativeMax'
import { useCurrencyBalanceState } from '../../state/wallet/hooks'
import { BigNumber } from '@ethersproject/bignumber'
import { ETHERNOVA_CHAIN_ID } from '../../utils/ethernovaNetwork'
import { switchToEthernova } from '../../utils/switchNetwork'
import { computeTradePriceBreakdown, warningSeverity } from '../../utils/prices'
import { currencyId } from '../../utils/currencyId'
import AppBody from '../AppBody'
import { ClickableText, Dots } from '../Pool/styleds'
import Loader from '../../components/Loader'

export default function Swap() {
  const loadedUrlParams = useDefaultsFromURLSearch()

  // token warning stuff
  const [loadedInputCurrency, loadedOutputCurrency] = [
    useCurrency(loadedUrlParams?.inputCurrencyId),
    useCurrency(loadedUrlParams?.outputCurrencyId)
  ]
  const [dismissTokenWarning, setDismissTokenWarning] = useState<boolean>(false)
  const urlLoadedTokens: Token[] = useMemo(
    () => [loadedInputCurrency, loadedOutputCurrency]?.filter((c): c is Token => c instanceof Token) ?? [],
    [loadedInputCurrency, loadedOutputCurrency]
  )
  const handleConfirmTokenWarning = useCallback(() => {
    setDismissTokenWarning(true)
  }, [])

  const { account, chainId, library } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const swapRouterAddress = useSwapRouterAddress()
  const isConnected = Boolean(account && library)
  const isWrongNetwork = isConnected && chainId !== ETHERNOVA_CHAIN_ID
  const theme = useContext(ThemeContext)

  // toggle wallet when disconnected
  const toggleWalletModal = useWalletModalToggle()

  // for expert mode
  const toggleSettings = useToggleSettingsMenu()
  const [isExpertMode] = useExpertModeManager()
  const [wrapModalOpen, setWrapModalOpen] = useState(false)
  const [wrapModalTab, setWrapModalTab] = useState<'wrap' | 'unwrap'>('wrap')

  // get custom setting values for user
  const [deadline] = useUserDeadline()
  const [allowedSlippage] = useUserSlippageTolerance()

  // swap state
  const { independentField, typedValue, recipient } = useSwapState()
  const {
    v1Trade,
    v2Trade,
    currencyBalances,
    parsedAmount,
    currencies,
    inputError: swapInputError
  } = useDerivedSwapInfo()
  const inputCurrency = currencies[Field.INPUT]
  const outputCurrency = currencies[Field.OUTPUT]
  const { wrapType } = useWrapCallback(inputCurrency, outputCurrency, typedValue)
  const showWrap: boolean = wrapType !== WrapType.NOT_APPLICABLE
  const { address: recipientAddress } = useENSAddress(recipient)
  const toggledVersion = useToggledVersion()
  const trade = showWrap
    ? undefined
    : {
        [Version.v1]: v1Trade,
        [Version.v2]: v2Trade
      }[toggledVersion]

  const [swapGasLimit, setSwapGasLimit] = useState<BigNumber | undefined>(undefined)

  useEffect(() => {
    let stale = false
    if (!trade || !library || !account || !chainId) {
      setSwapGasLimit(undefined)
      return
    }
    if (getTradeVersion(trade) !== Version.v2) {
      setSwapGasLimit(undefined)
      return
    }
    const router = getRouterContract(chainId, library, account, swapRouterAddress || undefined)
    if (!router) {
      setSwapGasLimit(undefined)
      return
    }
    const recipientForSwap = recipient === null ? account : recipientAddress ?? recipient
    if (!recipientForSwap) {
      setSwapGasLimit(undefined)
      return
    }
    const params = Router.swapCallParameters(trade, {
      feeOnTransfer: false,
      allowedSlippage: new Percent(JSBI.BigInt(allowedSlippage), BIPS_BASE),
      recipient: recipientForSwap,
      ttl: deadline
    })
    const { methodName, args, value } = params
    const options = !value || value === '0x0' ? {} : { value }
    router.estimateGas[methodName](...args, options)
      .then(estimate => {
        if (!stale) setSwapGasLimit(estimate)
      })
      .catch(() => {
        if (!stale) setSwapGasLimit(undefined)
      })
    return () => {
      stale = true
    }
  }, [trade, library, account, chainId, recipient, recipientAddress, allowedSlippage, deadline])

  const betterTradeLinkVersion: Version | undefined =
    toggledVersion === Version.v2 && isTradeBetter(v2Trade, v1Trade, BETTER_TRADE_LINK_THRESHOLD)
      ? Version.v1
      : toggledVersion === Version.v1 && isTradeBetter(v1Trade, v2Trade)
      ? Version.v2
      : undefined

  const inputIsWnova = isWnovaCurrency(inputCurrency)
  const outputIsWnova = isWnovaCurrency(outputCurrency)

  const displayInputAmount = useMemo(() => {
    if (showWrap) return parsedAmount
    if (independentField === Field.INPUT) return parsedAmount
    if (!trade?.inputAmount) return undefined
    if (!inputIsWnova) return trade.inputAmount
    return grossUpForTreasury(trade.inputAmount)
  }, [showWrap, parsedAmount, independentField, trade, inputIsWnova])

  const displayOutputAmount = useMemo(() => {
    if (showWrap) return parsedAmount
    if (independentField === Field.OUTPUT) return parsedAmount
    if (!trade?.outputAmount) return undefined
    if (!outputIsWnova) return trade.outputAmount
    return applyTreasuryFee(trade.outputAmount)
  }, [showWrap, parsedAmount, independentField, trade, outputIsWnova])

  const parsedAmounts = showWrap
    ? {
        [Field.INPUT]: parsedAmount,
        [Field.OUTPUT]: parsedAmount
      }
    : {
        [Field.INPUT]: displayInputAmount,
        [Field.OUTPUT]: displayOutputAmount
      }

  const { onSwitchTokens, onCurrencySelection, onUserInput, onChangeRecipient } = useSwapActionHandlers()
  const isValid = !swapInputError
  const dependentField: Field = independentField === Field.INPUT ? Field.OUTPUT : Field.INPUT

  const handleTypeInput = useCallback(
    (value: string) => {
      onUserInput(Field.INPUT, value)
    },
    [onUserInput]
  )
  const handleTypeOutput = useCallback(
    (value: string) => {
      onUserInput(Field.OUTPUT, value)
    },
    [onUserInput]
  )

  const handleSwitchEthernova = useCallback(() => {
    if (!isConnected) {
      toggleWalletModal()
      return
    }
    switchToEthernova().catch(() => undefined)
  }, [isConnected, toggleWalletModal])

  // modal and loading
  const [{ showConfirm, tradeToConfirm, swapErrorMessage, attemptingTxn, txHash }, setSwapState] = useState<{
    showConfirm: boolean
    tradeToConfirm: Trade | undefined
    attemptingTxn: boolean
    swapErrorMessage: string | undefined
    txHash: string | undefined
  }>({
    showConfirm: false,
    tradeToConfirm: undefined,
    attemptingTxn: false,
    swapErrorMessage: undefined,
    txHash: undefined
  })

  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: showWrap
      ? parsedAmounts[independentField]?.toExact() ?? ''
      : parsedAmounts[dependentField]?.toSignificant(6) ?? ''
  }

  const route = trade?.route
  const userHasSpecifiedInputOutput = Boolean(
    inputCurrency && outputCurrency && parsedAmounts[independentField]?.greaterThan(JSBI.BigInt(0))
  )
  const noRoute = !route
  const pairLookup = usePairLookup(inputCurrency, outputCurrency)
  const poolMissing = pairLookup.status === 'not_exists'
  const poolLookupError = pairLookup.status === 'error' || Boolean(pairLookup.error)
  const poolLoading = pairLookup.status === 'loading'
  const poolReserves = pairLookup.reserves
  const poolEmpty =
    pairLookup.status === 'exists' &&
    poolReserves &&
    BigNumber.from(poolReserves.reserve0).isZero() &&
    BigNumber.from(poolReserves.reserve1).isZero()

  const debugEnabled = typeof window !== 'undefined' && window.location.search.includes('debug=1')
  const swapAllowance = useTokenAllowance(
    inputCurrency instanceof Token ? inputCurrency : undefined,
    account ?? undefined,
    swapRouterAddress || SWAP_ROUTER_ADDRESS
  )
  useEffect(() => {
    if (!debugEnabled) return
    const slippageAmounts = trade ? computeSwapSlippageAmounts(trade, allowedSlippage) : undefined
    const outputNet = trade?.outputAmount
      ? outputIsWnova
        ? applyTreasuryFee(trade.outputAmount)
        : trade.outputAmount
      : null
    const inputGross = displayInputAmount
    const inputNet = trade?.inputAmount ?? null
    const treasuryFee =
      inputIsWnova && inputGross ? treasuryFeeFromGross(inputGross) : outputIsWnova && trade?.outputAmount
        ? treasuryFeeFromGross(trade.outputAmount)
        : null
    console.debug('[Swap debug]', {
      typedValue,
      independentField,
      parsedAmounts,
      inputCurrency: inputCurrency?.symbol,
      outputCurrency: outputCurrency?.symbol,
      tradeType: trade?.tradeType,
      inputGross: inputGross?.toExact?.() ?? null,
      inputNet: inputNet?.toExact?.() ?? null,
      treasuryFee: treasuryFee?.toExact?.() ?? null,
      outputGross: trade?.outputAmount?.toExact?.() ?? null,
      outputNet: outputNet?.toExact?.() ?? null,
      minOut: slippageAmounts?.[Field.OUTPUT]?.toExact?.() ?? null,
      maxIn: slippageAmounts?.[Field.INPUT]?.toExact?.() ?? null,
      pairLookupStatus: pairLookup.status,
      pairAddress: pairLookup.pairAddress,
      token0: pairLookup.token0,
      token1: pairLookup.token1,
      reserveA: pairLookup.reserveA?.toString(),
      reserveB: pairLookup.reserveB?.toString(),
      swapRouter: swapRouterAddress || SWAP_ROUTER_ADDRESS,
      allowance: swapAllowance?.toExact?.() ?? null,
      amountIn: parsedAmounts?.[Field.INPUT]?.toExact?.() ?? null
    })
    emitDebug({
      lastLiquidityContext: {
        chainId: chainId ?? null,
        chainIdRaw: typeof window !== 'undefined' ? (window as any)?.ethereum?.chainId ?? null : null,
        account: account ?? null,
        currencyA:
          inputCurrency instanceof Token ? { symbol: inputCurrency.symbol, address: inputCurrency.address } : undefined,
        currencyB:
          outputCurrency instanceof Token ? { symbol: outputCurrency.symbol, address: outputCurrency.address } : undefined,
        pairAddress: pairLookup.pairAddress ?? null,
        token0: pairLookup.token0 ?? null,
        token1: pairLookup.token1 ?? null,
        reserve0: pairLookup.reserves?.reserve0?.toString() ?? null,
        reserve1: pairLookup.reserves?.reserve1?.toString() ?? null,
        reserveForA: pairLookup.reserveA?.toString() ?? null,
        reserveForB: pairLookup.reserveB?.toString() ?? null,
        lpReadPath: pairLookup.status,
        provider: (library as any)?.provider?.constructor?.name ?? null,
        rpcUrl: config.rpcUrl ?? null
      }
    })
    emitDebug({
      lastAction: {
        name: 'swap.spender.check',
        time: new Date().toISOString(),
        meta: {
          swapRouter: swapRouterAddress || SWAP_ROUTER_ADDRESS,
          allowance: swapAllowance?.toExact?.() ?? null,
          amountIn: parsedAmounts?.[Field.INPUT]?.toExact?.() ?? null
        }
      }
    })
    const grossInput = slippageAmounts?.[Field.INPUT] ?? null
    const netInput = inputIsWnova && grossInput ? applyTreasuryFee(grossInput) : trade?.inputAmount ?? null
    const feeWnovaAmount =
      inputIsWnova && grossInput ? treasuryFeeFromGross(grossInput) : outputIsWnova && trade?.outputAmount
        ? treasuryFeeFromGross(trade.outputAmount)
        : null
    const nowTs = Math.floor(Date.now() / 1000)
    const deadlineTs = typeof deadline === 'number' ? nowTs + deadline : null
    const recipientForDebug = recipient === null ? account : recipientAddress ?? recipient
    const previousSwapContext =
      typeof window !== 'undefined' ? (window as any).__NOVADEX_DEBUG__?.lastSwapContext || {} : {}
    emitDebug({
      lastSwapContext: {
        ...previousSwapContext,
        router: swapRouterAddress || SWAP_ROUTER_ADDRESS,
        spender: swapRouterAddress || SWAP_ROUTER_ADDRESS,
        tokenIn: inputCurrency instanceof Token ? inputCurrency.address : inputCurrency === ETHER ? 'NATIVE' : null,
        tokenOut: outputCurrency instanceof Token ? outputCurrency.address : outputCurrency === ETHER ? 'NATIVE' : null,
        amountInUser: typedValue || null,
        amountInGross: grossInput?.toExact?.() ?? null,
        amountInNet: netInput?.toExact?.() ?? null,
        feeWnova: feeWnovaAmount?.toExact?.() ?? null,
        minOut: slippageAmounts?.[Field.OUTPUT]?.toExact?.() ?? null,
        slippageBps: allowedSlippage ?? null,
        deadlineSeconds: deadline ?? null,
        deadlineTs,
        nowTs,
        recipient: recipientForDebug ?? null,
        path: trade?.route?.path?.map(token => token.address) ?? null,
        allowance: swapAllowance?.toExact?.() ?? null,
        balance: currencyBalances?.[Field.INPUT]?.toExact?.() ?? null,
        willTransferFromTotal: grossInput?.toExact?.() ?? null
      }
    })
  }, [
    debugEnabled,
    typedValue,
    independentField,
    parsedAmounts,
    inputCurrency,
    outputCurrency,
    pairLookup.status,
    pairLookup.pairAddress,
    pairLookup.token0,
    pairLookup.token1,
    pairLookup.reserveA,
    pairLookup.reserveB,
    pairLookup.reserves,
    swapRouterAddress,
    swapAllowance,
    chainId,
    account,
    library,
    config.rpcUrl,
    trade,
    allowedSlippage,
    outputIsWnova,
    displayInputAmount,
    inputIsWnova,
    currencyBalances,
    deadline,
    recipient,
    recipientAddress
  ])

  // check whether the user has approved the router on the input token
  const [approval, approveCallback] = useApproveCallbackFromTrade(trade, allowedSlippage)

  // check if user has gone through approval process, used to show two step buttons, reset on token change
  const [approvalSubmitted, setApprovalSubmitted] = useState<boolean>(false)

  // mark when a user has submitted an approval, reset onTokenSelection for input field
  useEffect(() => {
    if (approval === ApprovalState.PENDING) {
      setApprovalSubmitted(true)
    }
  }, [approval, approvalSubmitted])

  const nativeMax = useNativeMax(account ?? undefined, { gasLimit: swapGasLimit })
  const inputBalanceState = useCurrencyBalanceState(account ?? undefined, inputCurrency)
  const maxAmountInput: CurrencyAmount | undefined =
    inputCurrency === ETHER
      ? nativeMax.maxAmount
      : maxAmountSpend(inputBalanceState.balance ?? currencyBalances[Field.INPUT])
  const atMaxAmountInput = Boolean(maxAmountInput && parsedAmounts[Field.INPUT]?.equalTo(maxAmountInput))

  // the callback to execute the swap
  const { callback: swapCallback, error: swapCallbackError } = useSwapCallback(
    trade,
    allowedSlippage,
    deadline,
    recipient
  )

  const { priceImpactWithoutFee } = computeTradePriceBreakdown(trade)

  const handleSwap = useCallback(() => {
    if (priceImpactWithoutFee && !confirmPriceImpactWithoutFee(priceImpactWithoutFee)) {
      return
    }
    if (!swapCallback) {
      return
    }
    setSwapState({ attemptingTxn: true, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: undefined })
    swapCallback()
      .then(hash => {
        setSwapState({ attemptingTxn: false, tradeToConfirm, showConfirm, swapErrorMessage: undefined, txHash: hash })

        ReactGA.event({
          category: 'Swap',
          action:
            recipient === null
              ? 'Swap w/o Send'
              : (recipientAddress ?? recipient) === account
              ? 'Swap w/o Send + recipient'
              : 'Swap w/ Send',
          label: [
            trade?.inputAmount?.currency?.symbol,
            trade?.outputAmount?.currency?.symbol,
            getTradeVersion(trade)
          ].join('/')
        })
      })
      .catch(error => {
        setSwapState({
          attemptingTxn: false,
          tradeToConfirm,
          showConfirm,
          swapErrorMessage: error.message,
          txHash: undefined
        })
      })
  }, [tradeToConfirm, account, priceImpactWithoutFee, recipient, recipientAddress, showConfirm, swapCallback, trade])

  // errors
  const [showInverted, setShowInverted] = useState<boolean>(false)

  // warnings on slippage
  const priceImpactSeverity = warningSeverity(priceImpactWithoutFee)

  // show approve flow when: no error on inputs, not approved or pending, or approved in current session
  // never show if price impact is above threshold in non expert mode
  const showApproveFlow =
    !swapInputError &&
    (approval === ApprovalState.NOT_APPROVED ||
      approval === ApprovalState.PENDING ||
      (approvalSubmitted && approval === ApprovalState.APPROVED)) &&
    !(priceImpactSeverity > 3 && !isExpertMode)

  const handleConfirmDismiss = useCallback(() => {
    setSwapState({ showConfirm: false, tradeToConfirm, attemptingTxn, swapErrorMessage, txHash })
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onUserInput(Field.INPUT, '')
    }
  }, [attemptingTxn, onUserInput, swapErrorMessage, tradeToConfirm, txHash])

  const handleAcceptChanges = useCallback(() => {
    setSwapState({ tradeToConfirm: trade, swapErrorMessage, txHash, attemptingTxn, showConfirm })
  }, [attemptingTxn, showConfirm, swapErrorMessage, trade, txHash])

  const handleInputSelect = useCallback(
    inputCurrency => {
      setApprovalSubmitted(false) // reset 2 step UI for approvals
      onCurrencySelection(Field.INPUT, inputCurrency)
    },
    [onCurrencySelection]
  )

  const handleMaxInput = useCallback(() => {
    if (!maxAmountInput) {
      inputBalanceState.refresh()
      return
    }
    onUserInput(Field.INPUT, maxAmountInput.toExact())
  }, [maxAmountInput, onUserInput, inputBalanceState])

  const handleOutputSelect = useCallback(outputCurrency => onCurrencySelection(Field.OUTPUT, outputCurrency), [
    onCurrencySelection
  ])

  return (
    <>
      <TokenWarningModal
        isOpen={urlLoadedTokens.length > 0 && !dismissTokenWarning}
        tokens={urlLoadedTokens}
        onConfirm={handleConfirmTokenWarning}
      />
      <AppBody>
        <SwapPoolTabs active={'swap'} />
        <Wrapper id="swap-page">
          <ConfirmSwapModal
            isOpen={showConfirm}
            trade={trade}
            originalTrade={tradeToConfirm}
            onAcceptChanges={handleAcceptChanges}
            attemptingTxn={attemptingTxn}
            txHash={txHash}
            recipient={recipient}
            allowedSlippage={allowedSlippage}
            deadline={deadline}
            onConfirm={handleSwap}
            swapErrorMessage={swapErrorMessage}
            onDismiss={handleConfirmDismiss}
          />

          <AutoColumn gap={'md'}>
            <CurrencyInputPanel
              label={independentField === Field.OUTPUT && !showWrap && trade ? 'From (estimated)' : 'From'}
              value={formattedAmounts[Field.INPUT]}
              showMaxButton={!atMaxAmountInput}
              currency={currencies[Field.INPUT]}
              onUserInput={handleTypeInput}
              onMax={handleMaxInput}
              onCurrencySelect={handleInputSelect}
              otherCurrency={currencies[Field.OUTPUT]}
              id="swap-currency-input"
            />
            <AutoColumn justify="space-between">
              <AutoRow justify={isExpertMode ? 'space-between' : 'center'} style={{ padding: '0 1rem' }}>
                <ArrowWrapper clickable>
                  <ArrowDown
                    size="16"
                    onClick={() => {
                      setApprovalSubmitted(false) // reset 2 step UI for approvals
                      onSwitchTokens()
                    }}
                    color={currencies[Field.INPUT] && currencies[Field.OUTPUT] ? theme.primary1 : theme.text2}
                  />
                </ArrowWrapper>
                {recipient === null && !showWrap && isExpertMode ? (
                  <LinkStyledButton id="add-recipient-button" onClick={() => onChangeRecipient('')}>
                    + Add a send (optional)
                  </LinkStyledButton>
                ) : null}
              </AutoRow>
            </AutoColumn>
            <CurrencyInputPanel
              value={formattedAmounts[Field.OUTPUT]}
              onUserInput={handleTypeOutput}
              label={independentField === Field.INPUT && !showWrap && trade ? 'To (estimated)' : 'To'}
              showMaxButton={false}
              currency={currencies[Field.OUTPUT]}
              onCurrencySelect={handleOutputSelect}
              otherCurrency={currencies[Field.INPUT]}
              id="swap-currency-output"
            />

            {recipient !== null && !showWrap ? (
              <>
                <AutoRow justify="space-between" style={{ padding: '0 1rem' }}>
                  <ArrowWrapper clickable={false}>
                    <ArrowDown size="16" color={theme.text2} />
                  </ArrowWrapper>
                  <LinkStyledButton id="remove-recipient-button" onClick={() => onChangeRecipient(null)}>
                    - Remove send
                  </LinkStyledButton>
                </AutoRow>
                <AddressInputPanel id="recipient" value={recipient} onChange={onChangeRecipient} />
              </>
            ) : null}

            {showWrap ? null : (
              <Card padding={'.25rem .75rem 0 .75rem'} borderRadius={'20px'}>
                <AutoColumn gap="4px">
                  {Boolean(trade) && (
                    <RowBetween align="center">
                      <Text fontWeight={500} fontSize={14} color={theme.text2}>
                        Price
                      </Text>
                      <TradePrice
                        price={trade?.executionPrice}
                        showInverted={showInverted}
                        setShowInverted={setShowInverted}
                      />
                    </RowBetween>
                  )}
                  {allowedSlippage !== INITIAL_ALLOWED_SLIPPAGE && (
                    <RowBetween align="center">
                      <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                        Slippage Tolerance
                      </ClickableText>
                      <ClickableText fontWeight={500} fontSize={14} color={theme.text2} onClick={toggleSettings}>
                        {allowedSlippage / 100}%
                      </ClickableText>
                    </RowBetween>
                  )}
                </AutoColumn>
              </Card>
            )}
          </AutoColumn>
          <BottomGrouping>
            {showWrap ? (
              <>
                {!account ? (
                  <ButtonLight onClick={toggleWalletModal}>Connect Wallet</ButtonLight>
                ) : isWrongNetwork ? (
                  <ButtonPrimary onClick={handleSwitchEthernova}>
                    Switch to Ethernova (121525)
                  </ButtonPrimary>
                ) : (
                  <RowBetween>
                    <ButtonPrimary
                      width="48%"
                      onClick={() => {
                        setWrapModalTab('wrap')
                        setWrapModalOpen(true)
                      }}
                    >
                      Wrap {NATIVE_SYMBOL}
                    </ButtonPrimary>
                    <ButtonLight
                      width="48%"
                      onClick={() => {
                        setWrapModalTab('unwrap')
                        setWrapModalOpen(true)
                      }}
                    >
                      Unwrap WNOVA
                    </ButtonLight>
                  </RowBetween>
                )}
              </>
            ) : !account ? (
              <ButtonLight onClick={toggleWalletModal}>Connect Wallet</ButtonLight>
            ) : isWrongNetwork ? (
              <ButtonPrimary onClick={handleSwitchEthernova}>
                Switch to Ethernova (121525)
              </ButtonPrimary>
            ) : noRoute && userHasSpecifiedInputOutput ? (
              <GreyCard style={{ textAlign: 'center' }}>
                {poolLoading ? (
                  <TYPE.main mb="4px">
                    Checking pool
                    <Dots />
                  </TYPE.main>
                ) : poolLookupError ? (
                  <>
                    <TYPE.main mb="4px">Pool lookup failed (RPC unstable).</TYPE.main>
                    <ButtonLight onClick={pairLookup.retry}>Retry</ButtonLight>
                  </>
                ) : poolMissing ? (
                  <>
                    <TYPE.main mb="4px">No pool exists for this pair.</TYPE.main>
                    <StyledInternalLink to={`/add/${currencyId(inputCurrency!)}/${currencyId(outputCurrency!)}`}>
                      Create pool (add liquidity)
                    </StyledInternalLink>
                  </>
                ) : poolEmpty ? (
                  <>
                    <TYPE.main mb="4px">No liquidity yet for this pool.</TYPE.main>
                    <StyledInternalLink to={`/add/${currencyId(inputCurrency!)}/${currencyId(outputCurrency!)}`}>
                      Add liquidity
                    </StyledInternalLink>
                  </>
                ) : pairLookup.status === 'exists' ? (
                  <>
                    <TYPE.main mb="4px">Pool exists but quote is unavailable. Retry.</TYPE.main>
                    <ButtonLight onClick={pairLookup.retry}>Retry</ButtonLight>
                  </>
                ) : (
                  <TYPE.main mb="4px">Insufficient liquidity for this trade.</TYPE.main>
                )}
              </GreyCard>
            ) : showApproveFlow ? (
              <RowBetween>
                <ButtonConfirmed
                  onClick={approveCallback}
                  disabled={approval !== ApprovalState.NOT_APPROVED || approvalSubmitted}
                  width="48%"
                  altDisabledStyle={approval === ApprovalState.PENDING} // show solid button while waiting
                  confirmed={approval === ApprovalState.APPROVED}
                >
                  {approval === ApprovalState.PENDING ? (
                    <AutoRow gap="6px" justify="center">
                      Approving <Loader stroke="white" />
                    </AutoRow>
                  ) : approvalSubmitted && approval === ApprovalState.APPROVED ? (
                    'Approved'
                  ) : (
                    'Approve ' + currencies[Field.INPUT]?.symbol
                  )}
                </ButtonConfirmed>
                <ButtonError
                  onClick={() => {
                    if (isExpertMode) {
                      handleSwap()
                    } else {
                      setSwapState({
                        tradeToConfirm: trade,
                        attemptingTxn: false,
                        swapErrorMessage: undefined,
                        showConfirm: true,
                        txHash: undefined
                      })
                    }
                  }}
                  width="48%"
                  id="swap-button"
                  disabled={
                    !isValid || approval !== ApprovalState.APPROVED || (priceImpactSeverity > 3 && !isExpertMode)
                  }
                  error={isValid && priceImpactSeverity > 2}
                >
                  <Text fontSize={16} fontWeight={500}>
                    {priceImpactSeverity > 3 && !isExpertMode
                      ? `Price Impact High`
                      : `Swap${priceImpactSeverity > 2 ? ' Anyway' : ''}`}
                  </Text>
                </ButtonError>
              </RowBetween>
            ) : (
              <ButtonError
                onClick={() => {
                  if (isExpertMode) {
                    handleSwap()
                  } else {
                    setSwapState({
                      tradeToConfirm: trade,
                      attemptingTxn: false,
                      swapErrorMessage: undefined,
                      showConfirm: true,
                      txHash: undefined
                    })
                  }
                }}
                id="swap-button"
                disabled={!isValid || (priceImpactSeverity > 3 && !isExpertMode) || !!swapCallbackError}
                error={isValid && priceImpactSeverity > 2 && !swapCallbackError}
              >
                <Text fontSize={20} fontWeight={500}>
                  {swapInputError
                    ? swapInputError
                    : priceImpactSeverity > 3 && !isExpertMode
                    ? `Price Impact Too High`
                    : `Swap${priceImpactSeverity > 2 ? ' Anyway' : ''}`}
                </Text>
              </ButtonError>
            )}
            {showApproveFlow && <ProgressSteps steps={[approval === ApprovalState.APPROVED]} />}
            {isExpertMode && swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
            {betterTradeLinkVersion && <BetterTradeLink version={betterTradeLinkVersion} />}
            {!showWrap && (
              <RowBetween style={{ marginTop: '8px' }}>
                <Text fontSize={12} color={theme.text2}>
                  Need to convert NOVA to WNOVA?
                </Text>
                <LinkStyledButton
                  onClick={() => {
                    setWrapModalTab('wrap')
                    setWrapModalOpen(true)
                  }}
                >
                  Wrap / Unwrap
                </LinkStyledButton>
              </RowBetween>
            )}
          </BottomGrouping>
        </Wrapper>
      </AppBody>
      <AdvancedSwapDetailsDropdown trade={trade} />
      <WrapUnwrapModal
        isOpen={wrapModalOpen}
        onDismiss={() => setWrapModalOpen(false)}
        initialTab={wrapModalTab}
      />
    </>
  )
}
