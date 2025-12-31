import { BigNumber } from '@ethersproject/bignumber'
import { TransactionResponse } from '@ethersproject/providers'
import { Currency, CurrencyAmount, currencyEquals, ETHER, JSBI, Token } from '@im33357/uniswap-v2-sdk'
import React, { useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { Plus } from 'react-feather'
import ReactGA from 'react-ga'
import { RouteComponentProps } from 'react-router-dom'
import { Text } from 'rebass'
import { ThemeContext } from 'styled-components'
import { ButtonError, ButtonLight, ButtonPrimary } from '../../components/Button'
import { BlueCard, GreyCard, LightCard } from '../../components/Card'
import { AutoColumn, ColumnCenter } from '../../components/Column'
import TransactionConfirmationModal, { ConfirmationModalContent } from '../../components/TransactionConfirmationModal'
import CurrencyInputPanel from '../../components/CurrencyInputPanel'
import DoubleCurrencyLogo from '../../components/DoubleLogo'
import { AddRemoveTabs } from '../../components/NavigationTabs'
import { MinimalPositionCard } from '../../components/PositionCard'
import Row, { RowBetween, RowFlat } from '../../components/Row'

import { ROUTER_ADDRESS } from '../../constants'
import { PairState } from '../../data/Reserves'
import { useActiveWeb3React } from '../../hooks'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { useCurrency } from '../../hooks/Tokens'
import { ApprovalState, useApproveCallback } from '../../hooks/useApproveCallback'
import { usePairLookup } from '../../hooks/usePairLookup'
import { useWalletModalToggle } from '../../state/application/hooks'
import { Field } from '../../state/mint/actions'
import { useDerivedMintInfo, useMintActionHandlers, useMintState } from '../../state/mint/hooks'

import { useTransactionAdder } from '../../state/transactions/hooks'
import { useIsExpertMode, useUserDeadline, useUserSlippageTolerance } from '../../state/user/hooks'
import { TYPE } from '../../theme'
import { calculateGasMargin, calculateSlippageAmount, getRouterContract } from '../../utils'
import { maxAmountSpend } from '../../utils/maxAmountSpend'
import { useNativeMax } from '../../hooks/useNativeMax'
import { wrappedCurrency } from '../../utils/wrappedCurrency'
import { computeMaxPairAmounts, toInputString } from '../../utils/liquidityMax'
import AppBody from '../AppBody'
import { Dots, Wrapper } from '../Pool/styleds'
import { ConfirmAddModalBottom } from './ConfirmAddModalBottom'
import { currencyId } from '../../utils/currencyId'
import { PoolPriceBar } from './PoolPriceBar'
import { WRAPPED_NATIVE } from '../../constants/native'
import WrapUnwrapModal from '../../components/WrapUnwrap/WrapUnwrapModal'
import { emitDebug } from '../../utils/debugEvents'
import { useCurrencyBalanceState } from '../../state/wallet/hooks'

export default function AddLiquidity({
  match: {
    params: { currencyIdA, currencyIdB }
  },
  history
}: RouteComponentProps<{ currencyIdA?: string; currencyIdB?: string }>) {
  const { account, chainId, library } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const theme = useContext(ThemeContext)

  const currencyA = useCurrency(currencyIdA)
  const currencyB = useCurrency(currencyIdB)

  const wrapped = chainId ? WRAPPED_NATIVE[chainId] : undefined
  const oneCurrencyIsWETH = Boolean(
    wrapped && ((currencyA && currencyEquals(currencyA, wrapped)) || (currencyB && currencyEquals(currencyB, wrapped)))
  )
  const requiresWrapped = currencyA === ETHER || currencyB === ETHER
  const [wrapModalOpen, setWrapModalOpen] = useState(false)
  const [wrapModalTab, setWrapModalTab] = useState<'wrap' | 'unwrap'>('wrap')

  const toggleWalletModal = useWalletModalToggle() // toggle wallet when disconnected

  const expertMode = useIsExpertMode()

  // mint state
  const { independentField, typedValue, otherTypedValue } = useMintState()
  const {
    dependentField,
    currencies,
    pair,
    pairState,
    currencyBalances,
    parsedAmounts,
    price,
    noLiquidity,
    liquidityMinted,
    poolTokenPercentage,
    error
  } = useDerivedMintInfo(currencyA ?? undefined, currencyB ?? undefined)
  const { onFieldAInput, onFieldBInput } = useMintActionHandlers(noLiquidity)

  const pairLookup = usePairLookup(currencyA ?? undefined, currencyB ?? undefined)
  const rpcWarning = pairLookup.status === 'error' || Boolean(pairLookup.error)
  const poolChecking = pairLookup.status === 'loading' && (typedValue || otherTypedValue)
  const liquidityError = requiresWrapped ? 'Use WNOVA for pools (wrap NOVA first).' : error
  const isValid = !liquidityError

  const [addGasLimit, setAddGasLimit] = useState<BigNumber | undefined>(undefined)

  const debugEnabled = typeof window !== 'undefined' && window.location.search.includes('debug=1')
  useEffect(() => {
    if (!debugEnabled) return
    const decimalsA = currencyA instanceof Token ? currencyA.decimals : undefined
    const decimalsB = currencyB instanceof Token ? currencyB.decimals : undefined
    console.debug('[LP debug]', {
      typedValue,
      otherTypedValue,
      independentField,
      parsedAmounts,
      currencyA: currencyA ? currencyA.symbol : null,
      currencyB: currencyB ? currencyB.symbol : null,
      decimalsA,
      decimalsB,
      pairState,
      pairLookupStatus: pairLookup.status,
      pairAddress: pairLookup.pairAddress,
      token0: pairLookup.token0,
      token1: pairLookup.token1,
      reserveA: pairLookup.reserveA?.toString(),
      reserveB: pairLookup.reserveB?.toString()
    })
    emitDebug({
      lastLiquidityContext: {
        chainId: chainId ?? null,
        chainIdRaw: typeof window !== 'undefined' ? (window as any)?.ethereum?.chainId ?? null : null,
        account: account ?? null,
        currencyA:
          currencyA instanceof Token
            ? { symbol: currencyA.symbol, address: currencyA.address }
            : currencyA
            ? { symbol: currencyA.symbol, address: null }
            : undefined,
        currencyB:
          currencyB instanceof Token
            ? { symbol: currencyB.symbol, address: currencyB.address }
            : currencyB
            ? { symbol: currencyB.symbol, address: null }
            : undefined,
        pairAddress: pairLookup.pairAddress ?? null,
        token0: pairLookup.token0 ?? null,
        token1: pairLookup.token1 ?? null,
        reserve0: pairLookup.reserves?.reserve0?.toString() ?? null,
        reserve1: pairLookup.reserves?.reserve1?.toString() ?? null,
        reserveForA: pairLookup.reserveA?.toString() ?? null,
        reserveForB: pairLookup.reserveB?.toString() ?? null,
        provider: (library as any)?.provider?.constructor?.name ?? null,
        rpcUrl: config.rpcUrl ?? null
      }
    })
  }, [
    debugEnabled,
    typedValue,
    otherTypedValue,
    independentField,
    parsedAmounts,
    currencyA,
    currencyB,
    pairState,
    pairLookup.status,
    pairLookup.pairAddress,
    pairLookup.token0,
    pairLookup.token1,
    pairLookup.reserveA,
    pairLookup.reserveB,
    pairLookup.reserves,
    chainId,
    account,
    library,
    config.rpcUrl
  ])

  // modal and loading
  const [showConfirm, setShowConfirm] = useState<boolean>(false)
  const [attemptingTxn, setAttemptingTxn] = useState<boolean>(false) // clicked confirm

  // txn values
  const [deadline] = useUserDeadline() // custom from users settings
  const [allowedSlippage] = useUserSlippageTolerance() // custom from users
  const [txHash, setTxHash] = useState<string>('')

  useEffect(() => {
    let stale = false
    if (!library || !account || !chainId) {
      setAddGasLimit(undefined)
      return
    }
    const amountA = parsedAmounts[Field.CURRENCY_A]
    const amountB = parsedAmounts[Field.CURRENCY_B]
    if (!amountA || !amountB || !currencyA || !currencyB) {
      setAddGasLimit(undefined)
      return
    }
    const router = getRouterContract(chainId, library, account)
    if (!router) {
      setAddGasLimit(undefined)
      return
    }
    const deadlineFromNow = Math.ceil(Date.now() / 1000) + deadline
    const amountsMin = {
      [Field.CURRENCY_A]: calculateSlippageAmount(amountA, noLiquidity ? 0 : allowedSlippage)[0],
      [Field.CURRENCY_B]: calculateSlippageAmount(amountB, noLiquidity ? 0 : allowedSlippage)[0]
    }
    let estimateFn: (...args: any[]) => Promise<BigNumber>
    let args: Array<string | string[] | number>
    let value: BigNumber | null
    if (currencyA === ETHER || currencyB === ETHER) {
      const tokenBIsETH = currencyB === ETHER
      estimateFn = router.estimateGas.addLiquidityETH
      args = [
        wrappedCurrency(tokenBIsETH ? currencyA : currencyB, chainId)?.address ?? '',
        (tokenBIsETH ? amountA : amountB).raw.toString(),
        amountsMin[tokenBIsETH ? Field.CURRENCY_A : Field.CURRENCY_B].toString(),
        amountsMin[tokenBIsETH ? Field.CURRENCY_B : Field.CURRENCY_A].toString(),
        account,
        deadlineFromNow
      ]
      value = BigNumber.from((tokenBIsETH ? amountB : amountA).raw.toString())
    } else {
      estimateFn = router.estimateGas.addLiquidity
      args = [
        wrappedCurrency(currencyA, chainId)?.address ?? '',
        wrappedCurrency(currencyB, chainId)?.address ?? '',
        amountA.raw.toString(),
        amountB.raw.toString(),
        amountsMin[Field.CURRENCY_A].toString(),
        amountsMin[Field.CURRENCY_B].toString(),
        account,
        deadlineFromNow
      ]
      value = null
    }
    estimateFn(...args, value ? { value } : {})
      .then(estimate => {
        if (!stale) setAddGasLimit(estimate)
      })
      .catch(() => {
        if (!stale) setAddGasLimit(undefined)
      })
    return () => {
      stale = true
    }
  }, [library, account, chainId, parsedAmounts, currencyA, currencyB, allowedSlippage, deadline, noLiquidity])

  // get formatted amounts
  const formattedAmounts = {
    [independentField]: typedValue,
    [dependentField]: noLiquidity ? otherTypedValue : parsedAmounts[dependentField]?.toSignificant(6) ?? ''
  }

  const nativeMax = useNativeMax(account ?? undefined, { gasLimit: addGasLimit })
  const currencyABalance = useCurrencyBalanceState(account ?? undefined, currencies[Field.CURRENCY_A])
  const currencyBBalance = useCurrencyBalanceState(account ?? undefined, currencies[Field.CURRENCY_B])

  // get the max amounts user can add (ratio-aware when pool exists)
  const maxAmounts: { [field in Field]?: CurrencyAmount } = useMemo(() => {
    const balanceA =
      currencies[Field.CURRENCY_A] === ETHER
        ? nativeMax.maxAmount
        : maxAmountSpend(currencyABalance.balance ?? currencyBalances[Field.CURRENCY_A])
    const balanceB =
      currencies[Field.CURRENCY_B] === ETHER
        ? nativeMax.maxAmount
        : maxAmountSpend(currencyBBalance.balance ?? currencyBalances[Field.CURRENCY_B])

    if (!balanceA || !balanceB) {
      return {
        [Field.CURRENCY_A]: balanceA,
        [Field.CURRENCY_B]: balanceB
      }
    }

    const reserveA = pairLookup.reserveA ? JSBI.BigInt(pairLookup.reserveA.toString()) : undefined
    const reserveB = pairLookup.reserveB ? JSBI.BigInt(pairLookup.reserveB.toString()) : undefined

    const maxFromA = computeMaxPairAmounts({
      currencyA: currencies[Field.CURRENCY_A],
      currencyB: currencies[Field.CURRENCY_B],
      balanceA,
      balanceB,
      reserveA,
      reserveB,
      whichMax: 'A'
    })
    const maxFromB = computeMaxPairAmounts({
      currencyA: currencies[Field.CURRENCY_A],
      currencyB: currencies[Field.CURRENCY_B],
      balanceA,
      balanceB,
      reserveA,
      reserveB,
      whichMax: 'B'
    })

    return {
      [Field.CURRENCY_A]: maxFromA.amountA ?? balanceA,
      [Field.CURRENCY_B]: maxFromB.amountB ?? balanceB
    }
  }, [
    currencies,
    nativeMax.maxAmount,
    currencyABalance.balance,
    currencyBBalance.balance,
    currencyBalances,
    pairLookup.reserveA,
    pairLookup.reserveB
  ])

  const atMaxAmounts: { [field in Field]?: CurrencyAmount } = [Field.CURRENCY_A, Field.CURRENCY_B].reduce(
    (accumulator, field) => {
      return {
        ...accumulator,
        [field]: maxAmounts[field]?.equalTo(parsedAmounts[field] ?? '0')
      }
    },
    {}
  )

  // check whether the user has approved the router on the tokens
  const [approvalA, approveACallback] = useApproveCallback(parsedAmounts[Field.CURRENCY_A], ROUTER_ADDRESS)
  const [approvalB, approveBCallback] = useApproveCallback(parsedAmounts[Field.CURRENCY_B], ROUTER_ADDRESS)

  const addTransaction = useTransactionAdder()

  async function onAdd() {
    if (!chainId || !library || !account) return
    const router = getRouterContract(chainId, library, account)

    const { [Field.CURRENCY_A]: parsedAmountA, [Field.CURRENCY_B]: parsedAmountB } = parsedAmounts
    if (!parsedAmountA || !parsedAmountB || !currencyA || !currencyB) {
      return
    }

    const amountsMin = {
      [Field.CURRENCY_A]: calculateSlippageAmount(parsedAmountA, noLiquidity ? 0 : allowedSlippage)[0],
      [Field.CURRENCY_B]: calculateSlippageAmount(parsedAmountB, noLiquidity ? 0 : allowedSlippage)[0]
    }

    const deadlineFromNow = Math.ceil(Date.now() / 1000) + deadline

    let estimate,
      method: (...args: any) => Promise<TransactionResponse>,
      args: Array<string | string[] | number>,
      value: BigNumber | null
    if (currencyA === ETHER || currencyB === ETHER) {
      const tokenBIsETH = currencyB === ETHER
      estimate = router.estimateGas.addLiquidityETH
      method = router.addLiquidityETH
      args = [
        wrappedCurrency(tokenBIsETH ? currencyA : currencyB, chainId)?.address ?? '', // token
        (tokenBIsETH ? parsedAmountA : parsedAmountB).raw.toString(), // token desired
        amountsMin[tokenBIsETH ? Field.CURRENCY_A : Field.CURRENCY_B].toString(), // token min
        amountsMin[tokenBIsETH ? Field.CURRENCY_B : Field.CURRENCY_A].toString(), // eth min
        account,
        deadlineFromNow
      ]
      value = BigNumber.from((tokenBIsETH ? parsedAmountB : parsedAmountA).raw.toString())
    } else {
      estimate = router.estimateGas.addLiquidity
      method = router.addLiquidity
      args = [
        wrappedCurrency(currencyA, chainId)?.address ?? '',
        wrappedCurrency(currencyB, chainId)?.address ?? '',
        parsedAmountA.raw.toString(),
        parsedAmountB.raw.toString(),
        amountsMin[Field.CURRENCY_A].toString(),
        amountsMin[Field.CURRENCY_B].toString(),
        account,
        deadlineFromNow
      ]
      value = null
    }

    setAttemptingTxn(true)
    await estimate(...args, value ? { value } : {})
      .then(estimatedGasLimit =>
        method(...args, {
          ...(value ? { value } : {}),
          gasLimit: calculateGasMargin(estimatedGasLimit)
        }).then(response => {
          setAttemptingTxn(false)

          addTransaction(response, {
            summary:
              'Add ' +
              parsedAmounts[Field.CURRENCY_A]?.toSignificant(3) +
              ' ' +
              currencies[Field.CURRENCY_A]?.symbol +
              ' and ' +
              parsedAmounts[Field.CURRENCY_B]?.toSignificant(3) +
              ' ' +
              currencies[Field.CURRENCY_B]?.symbol
          })

          setTxHash(response.hash)

          ReactGA.event({
            category: 'Liquidity',
            action: 'Add',
            label: [currencies[Field.CURRENCY_A]?.symbol, currencies[Field.CURRENCY_B]?.symbol].join('/')
          })
        })
      )
      .catch(error => {
        setAttemptingTxn(false)
        // we only care if the error is something _other_ than the user rejected the tx
        if (error?.code !== 4001) {
          console.error(error)
        }
      })
  }

  const modalHeader = () => {
    return noLiquidity ? (
      <AutoColumn gap="20px">
        <LightCard mt="20px" borderRadius="20px">
          <RowFlat>
            <Text fontSize="48px" fontWeight={500} lineHeight="42px" marginRight={10}>
              {currencies[Field.CURRENCY_A]?.symbol + '/' + currencies[Field.CURRENCY_B]?.symbol}
            </Text>
            <DoubleCurrencyLogo
              currency0={currencies[Field.CURRENCY_A]}
              currency1={currencies[Field.CURRENCY_B]}
              size={30}
            />
          </RowFlat>
        </LightCard>
      </AutoColumn>
    ) : (
      <AutoColumn gap="20px">
        <RowFlat style={{ marginTop: '20px' }}>
          <Text fontSize="48px" fontWeight={500} lineHeight="42px" marginRight={10}>
            {liquidityMinted?.toSignificant(6)}
          </Text>
          <DoubleCurrencyLogo
            currency0={currencies[Field.CURRENCY_A]}
            currency1={currencies[Field.CURRENCY_B]}
            size={30}
          />
        </RowFlat>
        <Row>
          <Text fontSize="24px">
            {currencies[Field.CURRENCY_A]?.symbol + '/' + currencies[Field.CURRENCY_B]?.symbol + ' Pool Tokens'}
          </Text>
        </Row>
        <TYPE.italic fontSize={12} textAlign="left" padding={'8px 0 0 0 '}>
          {`Output is estimated. If the price changes by more than ${allowedSlippage /
            100}% your transaction will revert.`}
        </TYPE.italic>
      </AutoColumn>
    )
  }

  const modalBottom = () => {
    return (
      <ConfirmAddModalBottom
        price={price}
        currencies={currencies}
        parsedAmounts={parsedAmounts}
        noLiquidity={noLiquidity}
        onAdd={onAdd}
        poolTokenPercentage={poolTokenPercentage}
      />
    )
  }

  const pendingText = `Supplying ${parsedAmounts[Field.CURRENCY_A]?.toSignificant(6)} ${
    currencies[Field.CURRENCY_A]?.symbol
  } and ${parsedAmounts[Field.CURRENCY_B]?.toSignificant(6)} ${currencies[Field.CURRENCY_B]?.symbol}`

  const handleCurrencyASelect = useCallback(
    (currencyA: Currency) => {
      const newCurrencyIdA = currencyId(currencyA)
      emitDebug({
        lastAction: {
          name: 'LP_SELECT_TOKEN_A',
          time: new Date().toISOString(),
          meta: { currencyId: newCurrencyIdA }
        }
      })
      if (newCurrencyIdA === currencyIdB) {
        history.push(`/add/${currencyIdB}/${currencyIdA}`)
      } else {
        history.push(`/add/${newCurrencyIdA}/${currencyIdB}`)
      }
    },
    [currencyIdB, history, currencyIdA]
  )
  const handleCurrencyBSelect = useCallback(
    (currencyB: Currency) => {
      const newCurrencyIdB = currencyId(currencyB)
      emitDebug({
        lastAction: {
          name: 'LP_SELECT_TOKEN_B',
          time: new Date().toISOString(),
          meta: { currencyId: newCurrencyIdB }
        }
      })
      if (currencyIdA === newCurrencyIdB) {
        if (currencyIdB) {
          history.push(`/add/${currencyIdB}/${newCurrencyIdB}`)
        } else {
          history.push(`/add/${newCurrencyIdB}`)
        }
      } else {
        history.push(`/add/${currencyIdA ? currencyIdA : 'ETH'}/${newCurrencyIdB}`)
      }
    },
    [currencyIdA, history, currencyIdB]
  )

  const handleDismissConfirmation = useCallback(() => {
    setShowConfirm(false)
    // if there was a tx hash, we want to clear the input
    if (txHash) {
      onFieldAInput('')
    }
    setTxHash('')
  }, [onFieldAInput, txHash])

  return (
    <>
      <AppBody>
        <AddRemoveTabs adding={true} />
        <Wrapper>
          <TransactionConfirmationModal
            isOpen={showConfirm}
            onDismiss={handleDismissConfirmation}
            attemptingTxn={attemptingTxn}
            hash={txHash}
            content={() => (
              <ConfirmationModalContent
                title={noLiquidity ? 'You are creating a pool' : 'You will receive'}
                onDismiss={handleDismissConfirmation}
                topContent={modalHeader}
                bottomContent={modalBottom}
              />
            )}
            pendingText={pendingText}
          />
          <AutoColumn gap="20px">
            {noLiquidity && (
              <ColumnCenter>
                <BlueCard>
                  <AutoColumn gap="10px">
                    <TYPE.link fontWeight={600} color={'primaryText1'}>
                      You are the first liquidity provider.
                    </TYPE.link>
                    <TYPE.link fontWeight={400} color={'primaryText1'}>
                      The ratio of tokens you add will set the price of this pool.
                    </TYPE.link>
                    <TYPE.link fontWeight={400} color={'primaryText1'}>
                      Once you are happy with the rate click supply to review.
                    </TYPE.link>
                  </AutoColumn>
                </BlueCard>
              </ColumnCenter>
            )}
            {requiresWrapped && (
              <LightCard padding="16px">
                <AutoColumn gap="sm">
                  <TYPE.body color="primaryText1">
                    Pools use WNOVA (wrapped NOVA). Please wrap NOVA before adding liquidity.
                  </TYPE.body>
                  <RowBetween>
                    <ButtonPrimary
                      onClick={() => {
                        setWrapModalTab('wrap')
                        setWrapModalOpen(true)
                      }}
                    >
                      Wrap NOVA
                    </ButtonPrimary>
                  </RowBetween>
                </AutoColumn>
              </LightCard>
            )}
            {rpcWarning && (
              <LightCard padding="16px">
                <AutoColumn gap="sm">
                  <TYPE.body color="primaryText1">RPC unstable — Retry if values don’t update.</TYPE.body>
                  <RowBetween>
                    <ButtonLight onClick={pairLookup.retry}>Retry</ButtonLight>
                  </RowBetween>
                </AutoColumn>
              </LightCard>
            )}
            {poolChecking && (
              <LightCard padding="16px">
                <AutoColumn gap="sm">
                  <TYPE.body color="primaryText1">
                    Checking pool state… you can continue if amounts are set.
                  </TYPE.body>
                </AutoColumn>
              </LightCard>
            )}
            <CurrencyInputPanel
              value={formattedAmounts[Field.CURRENCY_A]}
              onUserInput={onFieldAInput}
              onMax={() => {
                const maxValue = maxAmounts[Field.CURRENCY_A]
                if (!maxValue) {
                  currencyABalance.refresh()
                  return
                }
                if (debugEnabled) {
                  emitDebug({
                    lastAction: {
                      name: 'MAX_LIQUIDITY_A',
                      time: new Date().toISOString(),
                      meta: {
                        balanceA: currencyABalance.balance?.toExact?.() ?? null,
                        balanceB: currencyBBalance.balance?.toExact?.() ?? null,
                        reserveA: pairLookup.reserveA?.toString?.() ?? null,
                        reserveB: pairLookup.reserveB?.toString?.() ?? null,
                        maxA: maxValue.toExact()
                      }
                    }
                  })
                }
                onFieldAInput(toInputString(maxValue))
              }}
              onCurrencySelect={handleCurrencyASelect}
              showMaxButton={!atMaxAmounts[Field.CURRENCY_A]}
              currency={currencies[Field.CURRENCY_A]}
              id="add-liquidity-input-tokena"
              showCommonBases
            />
            <ColumnCenter>
              <Plus size="16" color={theme.text2} />
            </ColumnCenter>
            <CurrencyInputPanel
              value={formattedAmounts[Field.CURRENCY_B]}
              onUserInput={onFieldBInput}
              onCurrencySelect={handleCurrencyBSelect}
              onMax={() => {
                const maxValue = maxAmounts[Field.CURRENCY_B]
                if (!maxValue) {
                  currencyBBalance.refresh()
                  return
                }
                if (debugEnabled) {
                  emitDebug({
                    lastAction: {
                      name: 'MAX_LIQUIDITY_B',
                      time: new Date().toISOString(),
                      meta: {
                        balanceA: currencyABalance.balance?.toExact?.() ?? null,
                        balanceB: currencyBBalance.balance?.toExact?.() ?? null,
                        reserveA: pairLookup.reserveA?.toString?.() ?? null,
                        reserveB: pairLookup.reserveB?.toString?.() ?? null,
                        maxB: maxValue.toExact()
                      }
                    }
                  })
                }
                onFieldBInput(toInputString(maxValue))
              }}
              showMaxButton={!atMaxAmounts[Field.CURRENCY_B]}
              currency={currencies[Field.CURRENCY_B]}
              id="add-liquidity-input-tokenb"
              showCommonBases
            />
            {currencies[Field.CURRENCY_A] && currencies[Field.CURRENCY_B] && pairState !== PairState.INVALID && (
              <>
                <GreyCard padding="0px" borderRadius={'20px'}>
                  <RowBetween padding="1rem">
                    <TYPE.subHeader fontWeight={500} fontSize={14}>
                      {noLiquidity ? 'Initial prices' : 'Prices'} and pool share
                    </TYPE.subHeader>
                  </RowBetween>{' '}
                  <LightCard padding="1rem" borderRadius={'20px'}>
                    <PoolPriceBar
                      currencies={currencies}
                      poolTokenPercentage={poolTokenPercentage}
                      noLiquidity={noLiquidity}
                      price={price}
                    />
                  </LightCard>
                </GreyCard>
              </>
            )}

            {!account ? (
              <ButtonLight onClick={toggleWalletModal}>Connect Wallet</ButtonLight>
            ) : (
              <AutoColumn gap={'md'}>
                {(approvalA === ApprovalState.NOT_APPROVED ||
                  approvalA === ApprovalState.PENDING ||
                  approvalB === ApprovalState.NOT_APPROVED ||
                  approvalB === ApprovalState.PENDING) &&
                  isValid && (
                    <RowBetween>
                      {approvalA !== ApprovalState.APPROVED && (
                        <ButtonPrimary
                          onClick={approveACallback}
                          disabled={approvalA === ApprovalState.PENDING}
                          width={approvalB !== ApprovalState.APPROVED ? '48%' : '100%'}
                        >
                          {approvalA === ApprovalState.PENDING ? (
                            <Dots>Approving {currencies[Field.CURRENCY_A]?.symbol}</Dots>
                          ) : (
                            'Approve ' + currencies[Field.CURRENCY_A]?.symbol
                          )}
                        </ButtonPrimary>
                      )}
                      {approvalB !== ApprovalState.APPROVED && (
                        <ButtonPrimary
                          onClick={approveBCallback}
                          disabled={approvalB === ApprovalState.PENDING}
                          width={approvalA !== ApprovalState.APPROVED ? '48%' : '100%'}
                        >
                          {approvalB === ApprovalState.PENDING ? (
                            <Dots>Approving {currencies[Field.CURRENCY_B]?.symbol}</Dots>
                          ) : (
                            'Approve ' + currencies[Field.CURRENCY_B]?.symbol
                          )}
                        </ButtonPrimary>
                      )}
                    </RowBetween>
                  )}
                <ButtonError
                  onClick={() => {
                    expertMode ? onAdd() : setShowConfirm(true)
                  }}
                  disabled={!isValid || approvalA !== ApprovalState.APPROVED || approvalB !== ApprovalState.APPROVED}
                  error={!isValid && !!parsedAmounts[Field.CURRENCY_A] && !!parsedAmounts[Field.CURRENCY_B]}
                >
                  <Text fontSize={20} fontWeight={500}>
                    {liquidityError ?? 'Supply'}
                  </Text>
                </ButtonError>
              </AutoColumn>
            )}
          </AutoColumn>
        </Wrapper>
      </AppBody>

      <WrapUnwrapModal
        isOpen={wrapModalOpen}
        onDismiss={() => setWrapModalOpen(false)}
        initialTab={wrapModalTab}
      />

      {pair && !noLiquidity && pairState !== PairState.INVALID ? (
        <AutoColumn style={{ minWidth: '20rem', marginTop: '1rem' }}>
          <MinimalPositionCard showUnwrapped={oneCurrencyIsWETH} pair={pair} />
        </AutoColumn>
      ) : null}
    </>
  )
}
