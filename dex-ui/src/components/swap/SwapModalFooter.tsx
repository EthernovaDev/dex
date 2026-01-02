import { ETHER, Trade, TradeType } from '@im33357/uniswap-v2-sdk'
import React, { useCallback, useContext, useMemo, useState } from 'react'
import { Repeat } from 'react-feather'
import { Text } from 'rebass'
import { ThemeContext } from 'styled-components'
import { Field } from '../../state/swap/actions'
import { TYPE } from '../../theme'
import {
  computeSwapSlippageAmounts,
  computeTradePriceBreakdown,
  formatExecutionPrice,
  warningSeverity
} from '../../utils/prices'
import { ButtonError, ButtonLight } from '../Button'
import { AutoColumn } from '../Column'
import QuestionHelper from '../QuestionHelper'
import { AutoRow, RowBetween, RowFixed } from '../Row'
import FormattedPriceImpact from './FormattedPriceImpact'
import { StyledBalanceMaxMini, SwapCallbackError } from './styleds'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import { useActiveWeb3React } from '../../hooks'
import { useSwapCallArguments } from '../../hooks/useSwapCallback'
import { Interface } from '@ethersproject/abi'
import { emitDebug } from '../../utils/debugEvents'

export default function SwapModalFooter({
  trade,
  onConfirm,
  allowedSlippage,
  swapErrorMessage,
  disabledConfirm,
  recipient,
  deadline
}: {
  trade: Trade
  allowedSlippage: number
  onConfirm: () => void
  swapErrorMessage: string | undefined
  disabledConfirm: boolean
  recipient: string | null
  deadline: number
}) {
  const [showInverted, setShowInverted] = useState<boolean>(false)
  const theme = useContext(ThemeContext)
  const { account, library } = useActiveWeb3React()
  const debugEnabled =
    typeof window !== 'undefined' &&
    (window.location.search.includes('debug=1') || window.localStorage.getItem('debugSwap') === '1')
  const swapCalls = useSwapCallArguments(trade, allowedSlippage, deadline, recipient)
  const [simulateState, setSimulateState] = useState<{
    status: 'idle' | 'loading' | 'ok' | 'reverted' | 'error'
    message: string
    data?: string
  }>({ status: 'idle', message: '' })
  const slippageAdjustedAmounts = useMemo(() => computeSwapSlippageAmounts(trade, allowedSlippage), [
    allowedSlippage,
    trade
  ])
  const { priceImpactWithoutFee, realizedLPFee } = useMemo(() => computeTradePriceBreakdown(trade), [trade])
  const inputSymbol = trade.inputAmount.currency === ETHER ? NATIVE_SYMBOL : trade.inputAmount.currency.symbol
  const outputSymbol = trade.outputAmount.currency === ETHER ? NATIVE_SYMBOL : trade.outputAmount.currency.symbol
  const severity = warningSeverity(priceImpactWithoutFee)

  const decodeRevert = useCallback((error: any) => {
    const data =
      error?.data ||
      error?.error?.data ||
      error?.error?.error?.data ||
      error?.error?.data?.data ||
      error?.data?.data
    if (!data || typeof data !== 'string') {
      return { reason: error?.reason || error?.message || 'execution reverted', data: null }
    }
    if (data === '0x') return { reason: 'execution reverted (no data)', data }
    if (data.startsWith('0x08c379a0')) {
      try {
        const iface = new Interface(['function Error(string)'])
        const [reason] = iface.decodeFunctionData('Error', data)
        return { reason: String(reason), data }
      } catch {
        return { reason: 'execution reverted (Error)', data }
      }
    }
    if (data.startsWith('0x4e487b71')) {
      return { reason: 'execution reverted (Panic)', data }
    }
    return { reason: 'execution reverted (unknown)', data }
  }, [])

  const runSimulation = useCallback(async () => {
    if (!debugEnabled || !account || !library) return
    if (!swapCalls.length) {
      setSimulateState({ status: 'error', message: 'no swap call data' })
      emitDebug({ lastSwapSimulation: { status: 'error', reason: 'no swap call data', time: new Date().toISOString() } })
      return
    }
    setSimulateState({ status: 'loading', message: 'Simulating...' })
    let lastError: any = null
    for (const call of swapCalls) {
      const {
        parameters: { methodName, args, value },
        contract
      } = call
      const options = !value || value === '0x0' ? {} : { value }
      try {
        await contract.callStatic[methodName](...args, options)
        setSimulateState({ status: 'ok', message: 'simulate ok' })
        emitDebug({ lastSwapSimulation: { status: 'ok', time: new Date().toISOString() } })
        return
      } catch (err) {
        lastError = err
      }
    }
    const decoded = decodeRevert(lastError)
    setSimulateState({
      status: 'reverted',
      message: decoded.reason || 'execution reverted',
      data: decoded.data ?? undefined
    })
    emitDebug({
      lastSwapSimulation: {
        status: 'reverted',
        reason: decoded.reason || null,
        data: decoded.data ?? null,
        time: new Date().toISOString()
      }
    })
  }, [account, library, swapCalls, debugEnabled, decodeRevert])

  return (
    <>
      <AutoColumn gap="0px">
        <RowBetween align="center">
          <Text fontWeight={400} fontSize={14} color={theme.text2}>
            Price
          </Text>
          <Text
            fontWeight={500}
            fontSize={14}
            color={theme.text1}
            style={{
              justifyContent: 'center',
              alignItems: 'center',
              display: 'flex',
              textAlign: 'right',
              paddingLeft: '10px'
            }}
          >
            {formatExecutionPrice(trade, showInverted)}
            <StyledBalanceMaxMini onClick={() => setShowInverted(!showInverted)}>
              <Repeat size={14} />
            </StyledBalanceMaxMini>
          </Text>
        </RowBetween>

        <RowBetween>
          <RowFixed>
            <TYPE.black fontSize={14} fontWeight={400} color={theme.text2}>
              {trade.tradeType === TradeType.EXACT_INPUT ? 'Minimum received' : 'Maximum sold'}
            </TYPE.black>
            <QuestionHelper text="Your transaction will revert if there is a large, unfavorable price movement before it is confirmed." />
          </RowFixed>
          <RowFixed>
            <TYPE.black fontSize={14}>
              {trade.tradeType === TradeType.EXACT_INPUT
                ? slippageAdjustedAmounts[Field.OUTPUT]?.toSignificant(4) ?? '-'
                : slippageAdjustedAmounts[Field.INPUT]?.toSignificant(4) ?? '-'}
            </TYPE.black>
            <TYPE.black fontSize={14} marginLeft={'4px'}>
              {trade.tradeType === TradeType.EXACT_INPUT
                ? outputSymbol
                : inputSymbol}
            </TYPE.black>
          </RowFixed>
        </RowBetween>
        <RowBetween>
          <RowFixed>
            <TYPE.black color={theme.text2} fontSize={14} fontWeight={400}>
              Price Impact
            </TYPE.black>
            <QuestionHelper text="The difference between the market price and your price due to trade size." />
          </RowFixed>
          <FormattedPriceImpact priceImpact={priceImpactWithoutFee} />
        </RowBetween>
        <RowBetween>
          <RowFixed>
            <TYPE.black fontSize={14} fontWeight={400} color={theme.text2}>
              Liquidity Provider Fee
            </TYPE.black>
            <QuestionHelper text="A portion of each trade (0.30%) goes to liquidity providers as a protocol incentive." />
          </RowFixed>
          <TYPE.black fontSize={14}>
            {realizedLPFee ? realizedLPFee?.toSignificant(6) + ' ' + inputSymbol : '-'}
          </TYPE.black>
        </RowBetween>
      </AutoColumn>

      <AutoRow>
        <ButtonError
          onClick={onConfirm}
          disabled={disabledConfirm}
          error={severity > 2}
          style={{ margin: '10px 0 0 0' }}
          id="confirm-swap-or-send"
        >
          <Text fontSize={20} fontWeight={500}>
            {severity > 2 ? 'Swap Anyway' : 'Confirm Swap'}
          </Text>
        </ButtonError>

        {swapErrorMessage ? <SwapCallbackError error={swapErrorMessage} /> : null}
      </AutoRow>

      {debugEnabled && (
        <AutoColumn
          gap="sm"
          style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '12px', background: 'rgba(255,255,255,0.04)' }}
        >
          <TYPE.main fontSize={12} color={theme.text2}>
            Debug swap simulation
          </TYPE.main>
          <ButtonLight onClick={runSimulation} disabled={simulateState.status === 'loading'}>
            {simulateState.status === 'loading' ? 'Simulating…' : 'Simulate (eth_call)'}
          </ButtonLight>
          <TYPE.main fontSize={12} color={theme.text1}>
            {simulateState.status === 'idle' ? 'Result: —' : `Result: ${simulateState.message}`}
          </TYPE.main>
          {simulateState.data ? (
            <TYPE.main fontSize={12} color={theme.text2} style={{ wordBreak: 'break-all' }}>
              {simulateState.data}
            </TYPE.main>
          ) : null}
        </AutoColumn>
      )}
    </>
  )
}
