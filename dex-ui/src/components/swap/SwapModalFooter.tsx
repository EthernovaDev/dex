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
import { BigNumber } from '@ethersproject/bignumber'
import { calculateGasMargin } from '../../utils'
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
    (window.location.search.includes('debug=1') ||
      window.location.hash.includes('debug=1') ||
      window.localStorage.getItem('debugSwap') === '1')
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

  const extractRevertData = useCallback((error: any) => {
    const rawBody = typeof error?.body === 'string' ? error.body : null
    const parsedBody = rawBody
      ? (() => {
          try {
            return JSON.parse(rawBody)
          } catch {
            return null
          }
        })()
      : null
    const dataCandidates = [
      error?.data,
      error?.error?.data,
      error?.error?.error?.data,
      error?.error?.data?.data,
      error?.data?.data,
      error?.cause?.data,
      error?.info?.data,
      error?.info?.error?.data,
      error?.info?.error?.error?.data,
      parsedBody?.error?.data,
      parsedBody?.error?.error?.data
    ]
    const found = dataCandidates.find((candidate) => typeof candidate === 'string' && candidate.startsWith('0x'))
    return found || null
  }, [])

  const decodeRevert = useCallback((error: any) => {
    const data = extractRevertData(error)
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
  }, [extractRevertData])

  const runSimulation = useCallback(
    async (blockOnRevert: boolean = false) => {
      if (!debugEnabled || !account || !library) {
        setSimulateState({ status: 'error', message: 'missing dependencies' })
        emitDebug({
          lastSwapSimulation: { status: 'error', reason: 'missing dependencies', time: new Date().toISOString() }
        })
        return { status: 'error', reason: 'missing dependencies' }
      }
      if (!swapCalls.length) {
        setSimulateState({ status: 'error', message: 'no swap call data' })
        emitDebug({
          lastSwapSimulation: { status: 'error', reason: 'no swap call data', time: new Date().toISOString() }
        })
        return { status: 'error', reason: 'no swap call data' }
      }
      setSimulateState({ status: 'loading', message: 'Simulating...' })
      const nowTs = Math.floor(Date.now() / 1000)
      const withFreshDeadline = (rawArgs: any[]) => {
        if (!rawArgs || rawArgs.length === 0) return rawArgs
        const freshArgs = [...rawArgs]
        const deadlineIndex = freshArgs.length - 1
        freshArgs[deadlineIndex] = String(nowTs + deadline)
        return freshArgs
      }
      const callsWithFreshDeadline = swapCalls.map(call => ({
        ...call,
        parameters: {
          ...call.parameters,
          args: withFreshDeadline(call.parameters.args)
        }
      }))

      let lastError: any = null
      let selectedCall: any = null
      let gasEstimate: BigNumber | null = null
      const nowTs = Math.floor(Date.now() / 1000)
      const withFreshDeadline = (rawArgs: any[]) => {
        if (!rawArgs || rawArgs.length === 0) return rawArgs
        const freshArgs = [...rawArgs]
        const deadlineIndex = freshArgs.length - 1
        freshArgs[deadlineIndex] = String(nowTs + deadline)
        return freshArgs
      }
      const estimatedCalls = await Promise.all(
        callsWithFreshDeadline.map(async call => {
          const {
            parameters: { methodName, args, value },
            contract
          } = call
          const freshArgs = withFreshDeadline(args)
          const options = value && value !== '0x0' ? { value } : {}
          try {
            const estimate = await contract.estimateGas[methodName](...freshArgs, options)
            return { call, gasEstimate: estimate }
          } catch (err) {
            return { call, error: err }
          }
        })
      )
      const successfulEstimation = estimatedCalls.find(
        (el, ix, list) =>
          'gasEstimate' in el && (ix === list.length - 1 || 'gasEstimate' in list[ix + 1])
      )
      if (successfulEstimation && 'gasEstimate' in successfulEstimation) {
        selectedCall = successfulEstimation.call
        gasEstimate = successfulEstimation.gasEstimate ?? null
      } else {
        const fallbackSuccess = estimatedCalls.find(el => 'gasEstimate' in el)
        if (fallbackSuccess && 'gasEstimate' in fallbackSuccess) {
          selectedCall = fallbackSuccess.call
          gasEstimate = fallbackSuccess.gasEstimate ?? null
        }
      }
      if (!selectedCall) {
        const errorCall = estimatedCalls.slice().reverse().find(el => 'error' in el)
        lastError = errorCall && 'error' in errorCall ? errorCall.error : null
      }

      const callToUse = selectedCall || callsWithFreshDeadline[0]
      if (!callToUse) {
        setSimulateState({ status: 'error', message: 'no swap call data' })
        return { status: 'error', reason: 'no swap call data' }
      }

      const {
        parameters: { methodName, args, value },
        contract
      } = callToUse
      const freshArgs = withFreshDeadline(args)
      const deadlineArg = freshArgs[freshArgs.length - 1]
      const deadlineRaw =
        typeof deadlineArg === 'string'
          ? deadlineArg
          : deadlineArg?.toString?.()
          ? String(deadlineArg.toString())
          : null
      const deadlineTs = deadlineRaw
        ? Number(deadlineRaw.startsWith('0x') ? parseInt(deadlineRaw, 16) : Number(deadlineRaw))
        : null
      const argsSummary = (() => {
        const toArg = freshArgs.length >= 2 ? freshArgs[freshArgs.length - 2] : null
        const pathArg =
          freshArgs.length >= 3 && Array.isArray(freshArgs[freshArgs.length - 3]) ? freshArgs[freshArgs.length - 3] : null
        return {
          amount0: freshArgs[0]?.toString?.() ?? String(freshArgs[0]),
          amount1: freshArgs[1]?.toString?.() ?? String(freshArgs[1]),
          path: pathArg ?? null,
          to: toArg?.toString?.() ?? String(toArg),
          deadline: freshArgs[freshArgs.length - 1]?.toString?.() ?? String(freshArgs[freshArgs.length - 1])
        }
      })()
      const calldata = (() => {
        try {
          return contract.interface.encodeFunctionData(methodName, freshArgs)
        } catch {
          return null
        }
      })()
      const valueBn = (() => {
        try {
          return value ? BigNumber.from(value) : BigNumber.from(0)
        } catch {
          return BigNumber.from(0)
        }
      })()
      const valueHex = valueBn.isZero() ? '0x0' : valueBn.toHexString()
      const feeData =
        typeof (library as any)?.getFeeData === 'function'
          ? await (library as any).getFeeData().catch(() => null)
          : null
      const networkChainId = await library.getNetwork().then((net) => net.chainId).catch(() => null)
      const nonce = await library.getTransactionCount(account, 'pending').catch(() => null)
      const txRequest: any = {
        to: contract.address,
        from: account,
        data: calldata || undefined,
        value: valueHex
      }
      if (networkChainId) {
        txRequest.chainId = networkChainId
      }
      if (gasEstimate) {
        txRequest.gasLimit = calculateGasMargin(gasEstimate).toHexString()
      }
      if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
        txRequest.maxFeePerGas = feeData.maxFeePerGas.toHexString()
        txRequest.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas.toHexString()
      } else if (feeData?.gasPrice) {
        txRequest.gasPrice = feeData.gasPrice.toHexString()
      }
      const previousSwapContext =
        typeof window !== 'undefined' ? (window as any).__NOVADEX_DEBUG__?.lastSwapContext || {} : {}
      emitDebug({
        lastSwapContext: {
          ...previousSwapContext,
          methodName,
          calldata,
          calldataTruncated: calldata ? `${calldata.slice(0, 42)}…` : null,
          deadlineTs: Number.isFinite(deadlineTs) ? deadlineTs : null,
          deadlineArgRaw: deadlineRaw,
          argsSummary,
          txTo: contract.address,
          txFrom: account,
          txValue: valueHex,
          gasLimit: txRequest.gasLimit ?? null,
          gasEstimate: gasEstimate ? gasEstimate.toHexString() : null,
          gasPrice: txRequest.gasPrice ?? null,
          maxFeePerGas: txRequest.maxFeePerGas ?? null,
          maxPriorityFeePerGas: txRequest.maxPriorityFeePerGas ?? null,
          nonce: typeof nonce === 'number' ? nonce : null,
          txRequestJson: JSON.stringify(txRequest)
        }
      })

      try {
        await library.call(txRequest, 'pending')
        setSimulateState({ status: 'ok', message: 'simulate ok' })
        emitDebug({ lastSwapSimulation: { status: 'ok', time: new Date().toISOString() } })
        return { status: 'ok' }
      } catch (err) {
        lastError = err
      }

      let decoded = decodeRevert(lastError)
      const revertData = decoded.data
      if (revertData && typeof (contract as any)?.interface?.parseError === 'function') {
        try {
          const parsed = (contract as any).interface.parseError(revertData)
          const args = parsed?.args ? Array.from(parsed.args).map((arg: any) => arg?.toString?.() ?? String(arg)) : []
          decoded = { reason: `${parsed?.name || 'CustomError'}(${args.join(',')})`, data: revertData }
        } catch {
          // ignore custom error parse
        }
      }
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
      return { status: 'reverted', reason: decoded.reason || 'execution reverted' }
    },
    [account, library, swapCalls, debugEnabled, decodeRevert]
  )

  const handleConfirm = useCallback(async () => {
    if (!debugEnabled) {
      onConfirm()
      return
    }
    const result = await runSimulation(true)
    if (result?.status === 'ok') {
      onConfirm()
    }
  }, [debugEnabled, onConfirm, runSimulation])

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
          onClick={handleConfirm}
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
          <ButtonLight onClick={() => runSimulation(false)} disabled={simulateState.status === 'loading'}>
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
