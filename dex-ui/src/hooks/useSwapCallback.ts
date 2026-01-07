import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { Interface } from '@ethersproject/abi'
import { JSBI, Percent, Router, SwapParameters, Trade, TradeType } from '@im33357/uniswap-v2-sdk'
import { useMemo } from 'react'
import { BIPS_BASE, DEFAULT_DEADLINE_FROM_NOW, INITIAL_ALLOWED_SLIPPAGE, TREASURY_FEE_BPS } from '../constants'
import { getTradeVersion, useV1TradeExchangeAddress } from '../data/V1'
import { useTransactionAdder } from '../state/transactions/hooks'
import { calculateGasMargin, getRouterContract, isAddress, shortenAddress } from '../utils'
import isZero from '../utils/isZero'
import v1SwapArguments from '../utils/v1SwapArguments'
import { useActiveWeb3React } from './index'
import { useV1ExchangeContract } from './useContract'
import useENS from './useENS'
import { Version } from './useToggledVersion'
import { useSwapRouterAddress } from './useSwapRouterAddress'
import { computeSwapSlippageAmounts } from '../utils/prices'
import { Field } from '../state/swap/actions'
import { emitDebug } from '../utils/debugEvents'
import { isWnovaCurrency } from '../utils/treasuryFee'

export enum SwapCallbackState {
  INVALID,
  LOADING,
  VALID
}

interface SwapCall {
  contract: Contract
  parameters: SwapParameters
}

interface SuccessfulCall {
  call: SwapCall
  gasEstimate: BigNumber
}

interface FailedCall {
  call: SwapCall
  error: Error
}

type EstimatedSwapCall = SuccessfulCall | FailedCall

function refreshSwapCallDeadline(call: SwapCall, deadlineSeconds: number, nowTs?: number): SwapCall {
  const timestamp = typeof nowTs === 'number' ? nowTs : Math.floor(Date.now() / 1000)
  const args = [...call.parameters.args]
  if (args.length > 0) {
    args[args.length - 1] = String(timestamp + deadlineSeconds)
  }
  return {
    ...call,
    parameters: {
      ...call.parameters,
      args
    }
  }
}

async function refreshSwapCallMinOut(
  call: SwapCall,
  trade: Trade,
  allowedSlippage: number
): Promise<SwapCall> {
  const {
    parameters: { methodName, args },
    contract
  } = call

  if (trade.tradeType !== TradeType.EXACT_INPUT) return call
  if (!methodName.startsWith('swapExactTokens')) return call
  if (!args || args.length < 3) return call

  const path = args[2]
  if (!Array.isArray(path) || path.length < 2) return call

  let amountIn: BigNumber
  try {
    amountIn = BigNumber.from(args[0].toString())
  } catch {
    return call
  }

  let amountInForQuote = amountIn
  if (isWnovaCurrency(trade.inputAmount.currency)) {
    amountInForQuote = amountIn.mul(10000 - TREASURY_FEE_BPS).div(10000)
  }

  let amountsOut: BigNumber[] | null = null
  try {
    const out = await contract.getAmountsOut(amountInForQuote.toString(), path)
    amountsOut = out ? (Array.isArray(out) ? out.map(value => BigNumber.from(value)) : null) : null
  } catch {
    return call
  }

  if (!amountsOut || amountsOut.length === 0) return call
  const rawOut = amountsOut[amountsOut.length - 1]
  let minOut = rawOut.mul(10000 - allowedSlippage).div(10000)
  if (isWnovaCurrency(trade.outputAmount.currency)) {
    minOut = minOut.mul(10000 - TREASURY_FEE_BPS).div(10000)
  }

  const updatedArgs = [...args]
  updatedArgs[1] = minOut.toString()
  return {
    ...call,
    parameters: {
      ...call.parameters,
      args: updatedArgs
    }
  }
}

function extractRevertData(error: any): string | null {
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
}

function decodeRevertReason(data: string | null): string | null {
  if (!data || data === '0x') return null
  if (data.startsWith('0x08c379a0')) {
    try {
      const iface = new Interface(['function Error(string)'])
      const [reason] = iface.decodeFunctionData('Error', data)
      return String(reason)
    } catch {
      return null
    }
  }
  if (data.startsWith('0x4e487b71')) {
    return 'Panic'
  }
  return null
}

function extractSwapErrorMessage(error: any): string {
  const reason = error?.reason ?? error?.error?.reason ?? ''
  const dataMessage = error?.data?.message ?? error?.error?.data?.message ?? ''
  const message = error?.message ?? ''
  const revertData = extractRevertData(error)
  const decodedRevert = decodeRevertReason(revertData)
  const combined = [reason, dataMessage, message].find((value) => typeof value === 'string' && value.length > 0) || ''

  if (/TRANSFER_FROM_FAILED|transfer amount exceeds allowance|insufficient allowance/i.test(combined)) {
    return 'Approve WNOVA for NovaRouter (swap router) and try again.'
  }
  if (/INSUFFICIENT_OUTPUT_AMOUNT/i.test(combined)) {
    return 'Slippage or protocol fee too low. Try increasing slippage tolerance.'
  }
  if (/EXCESSIVE_INPUT_AMOUNT/i.test(combined)) {
    return 'Input amount too high for current liquidity. Try reducing the amount.'
  }
  if (/EXPIRED|deadline/i.test(combined)) {
    return 'Transaction expired. Check your deadline setting.'
  }
  if (/INVALID_PATH|PAIR_NOT_FOUND|PATH/i.test(combined) && /INVALID|NOT/i.test(combined)) {
    return 'Invalid swap path or pair not found.'
  }
  if (/INSUFFICIENT_LIQUIDITY|INSUFFICIENT_A_AMOUNT|INSUFFICIENT_B_AMOUNT/i.test(combined)) {
    return 'Not enough liquidity for this trade.'
  }

  if (decodedRevert) {
    return `Swap failed: ${decodedRevert}`
  }
  if (revertData) {
    return combined ? `Swap failed: ${combined}` : 'Swap failed: execution reverted.'
  }

  return combined ? `Swap failed: ${combined}` : 'Swap failed: unknown error.'
}

function assertSwapInvariants(
  methodName: string,
  args: any[],
  value: string | undefined,
  recipient: string | null,
  nowTs: number
) {
  const usesEthValue =
    methodName === 'swapExactETHForTokens' ||
    methodName === 'swapExactETHForTokensSupportingFeeOnTransferTokens' ||
    methodName === 'swapETHForExactTokens'
  const valueIsZero = !value || isZero(value)
  if (!usesEthValue && !valueIsZero) {
    throw new Error('Swap invariant failed: value must be 0 for ERC20 swaps.')
  }
  const toArg = args.length >= 2 ? args[args.length - 2] : null
  if (!recipient || !toArg || toArg === '0x0000000000000000000000000000000000000000') {
    throw new Error('Swap invariant failed: invalid recipient address.')
  }
  if (typeof toArg === 'string' && recipient && toArg.toLowerCase() !== recipient.toLowerCase()) {
    throw new Error('Swap invariant failed: recipient mismatch.')
  }
  const deadlineArg = args[args.length - 1]
  const parsedDeadline =
    typeof deadlineArg === 'string'
      ? Number(deadlineArg.startsWith('0x') ? parseInt(deadlineArg, 16) : Number(deadlineArg))
      : Number(deadlineArg)
  if (!Number.isFinite(parsedDeadline) || parsedDeadline <= nowTs) {
    throw new Error('Swap invariant failed: deadline is expired or invalid.')
  }
}

/**
 * Returns the swap calls that can be used to make the trade
 * @param trade trade to execute
 * @param allowedSlippage user allowed slippage
 * @param deadline the deadline for the trade
 * @param recipientAddressOrName
 */
export function useSwapCallArguments(
  trade: Trade | undefined, // trade to execute, required
  allowedSlippage: number = INITIAL_ALLOWED_SLIPPAGE, // in bips
  deadline: number = DEFAULT_DEADLINE_FROM_NOW, // in seconds from now
  recipientAddressOrName: string | null // the ENS name or address of the recipient of the trade, or null if swap should be returned to sender
): SwapCall[] {
  const { account, chainId, library } = useActiveWeb3React()
  const swapRouterAddress = useSwapRouterAddress()

  const { address: recipientAddress } = useENS(recipientAddressOrName)
  const recipient = recipientAddressOrName === null ? account : recipientAddress

  const v1Exchange = useV1ExchangeContract(useV1TradeExchangeAddress(trade), true)

  return useMemo(() => {
    const tradeVersion = getTradeVersion(trade)
    if (!trade || !recipient || !library || !account || !tradeVersion || !chainId) return []

    const swapRouter = swapRouterAddress || undefined
    const contract: Contract | null =
      tradeVersion === Version.v2 ? getRouterContract(chainId, library, account, swapRouter) : v1Exchange
    if (!contract) {
      return []
    }

    const swapMethods = []
    const effectiveSlippage = allowedSlippage

    switch (tradeVersion) {
      case Version.v2:
        swapMethods.push(
          Router.swapCallParameters(trade, {
            feeOnTransfer: false,
            allowedSlippage: new Percent(JSBI.BigInt(effectiveSlippage), BIPS_BASE),
            recipient,
            ttl: deadline
          })
        )

        if (trade.tradeType === TradeType.EXACT_INPUT) {
          swapMethods.push(
            Router.swapCallParameters(trade, {
              feeOnTransfer: true,
              allowedSlippage: new Percent(JSBI.BigInt(effectiveSlippage), BIPS_BASE),
              recipient,
              ttl: deadline
            })
          )
        }
        break
      case Version.v1:
        swapMethods.push(
          v1SwapArguments(trade, {
            allowedSlippage: new Percent(JSBI.BigInt(allowedSlippage), BIPS_BASE),
            recipient,
            ttl: deadline
          })
        )
        break
    }
    if (tradeVersion !== Version.v2 || swapMethods.length === 0 || !trade) {
      return swapMethods.map(parameters => ({ parameters, contract }))
    }

    const slippageAmounts = computeSwapSlippageAmounts(trade, allowedSlippage)

    const adjustParams = (parameters: SwapParameters): SwapParameters => {
      const args = [...parameters.args]
      let value = parameters.value
      const nowTs = Math.floor(Date.now() / 1000)
      const usesEthValue =
        parameters.methodName === 'swapExactETHForTokens' ||
        parameters.methodName === 'swapExactETHForTokensSupportingFeeOnTransferTokens' ||
        parameters.methodName === 'swapETHForExactTokens'

      if (trade.tradeType === TradeType.EXACT_INPUT) {
        const grossIn = slippageAmounts[Field.INPUT]
        const minOut = slippageAmounts[Field.OUTPUT]

        if (parameters.methodName === 'swapExactETHForTokens' || parameters.methodName === 'swapExactETHForTokensSupportingFeeOnTransferTokens') {
          if (minOut) args[0] = minOut.raw.toString()
          if (grossIn) value = grossIn.raw.toString()
        } else {
          if (grossIn) args[0] = grossIn.raw.toString()
          if (minOut) args[1] = minOut.raw.toString()
        }
      } else {
        const maxIn = slippageAmounts[Field.INPUT]
        const netOut = slippageAmounts[Field.OUTPUT]

        if (parameters.methodName === 'swapETHForExactTokens') {
          if (netOut) args[0] = netOut.raw.toString()
          if (maxIn) value = maxIn.raw.toString()
        } else {
          if (netOut) args[0] = netOut.raw.toString()
          if (maxIn) args[1] = maxIn.raw.toString()
        }
      }

      const deadlineIndex = args.length - 1
      args[deadlineIndex] = String(nowTs + deadline)
      if (!usesEthValue) {
        value = '0x0'
      }

      return { ...parameters, args, value }
    }

    return swapMethods.map(parameters => ({ parameters: adjustParams(parameters), contract }))
  }, [account, allowedSlippage, chainId, deadline, library, recipient, trade, v1Exchange, swapRouterAddress])
}

// returns a function that will execute a swap, if the parameters are all valid
// and the user has approved the slippage adjusted input amount for the trade
export function useSwapCallback(
  trade: Trade | undefined, // trade to execute, required
  allowedSlippage: number = INITIAL_ALLOWED_SLIPPAGE, // in bips
  deadline: number = DEFAULT_DEADLINE_FROM_NOW, // in seconds from now
  recipientAddressOrName: string | null // the ENS name or address of the recipient of the trade, or null if swap should be returned to sender
): { state: SwapCallbackState; callback: null | (() => Promise<string>); error: string | null } {
  const { account, chainId, library } = useActiveWeb3React()

  const swapCalls = useSwapCallArguments(trade, allowedSlippage, deadline, recipientAddressOrName)

  const addTransaction = useTransactionAdder()

  const { address: recipientAddress } = useENS(recipientAddressOrName)
  const recipient = recipientAddressOrName === null ? account : recipientAddress

  return useMemo(() => {
    if (!trade || !library || !account || !chainId) {
      return { state: SwapCallbackState.INVALID, callback: null, error: 'Missing dependencies' }
    }
    if (!recipient) {
      if (recipientAddressOrName !== null) {
        return { state: SwapCallbackState.INVALID, callback: null, error: 'Invalid recipient' }
      } else {
        return { state: SwapCallbackState.LOADING, callback: null, error: null }
      }
    }

    const tradeVersion = getTradeVersion(trade)

    return {
      state: SwapCallbackState.VALID,
      callback: async function onSwap(): Promise<string> {
        const nowTs = Math.floor(Date.now() / 1000)
        const freshSwapCalls = swapCalls.map(call => refreshSwapCallDeadline(call, deadline, nowTs))
        const refreshedSwapCalls = await Promise.all(
          freshSwapCalls.map(call => refreshSwapCallMinOut(call, trade, allowedSlippage))
        )
        const estimatedCalls: EstimatedSwapCall[] = await Promise.all(
          refreshedSwapCalls.map(call => {
            const {
              parameters: { methodName, args, value },
              contract
            } = call
            const options = !value || isZero(value) ? {} : { value }

            return contract.estimateGas[methodName](...args, options)
              .then(gasEstimate => {
                return {
                  call,
                  gasEstimate
                }
              })
              .catch(gasError => {
                console.debug('Gas estimate failed, trying eth_call to extract error', call)

                return contract.callStatic[methodName](...args, options)
                  .then(result => {
                    console.debug('Unexpected successful call after failed estimate gas', call, gasError, result)
                    return { call, error: new Error('Unexpected issue with estimating the gas. Please try again.') }
                  })
                  .catch(callError => {
                    console.debug('Call threw error', call, callError)
                    return { call, error: new Error(extractSwapErrorMessage(callError)) }
                  })
              })
          })
        )

        // a successful estimation is a bignumber gas estimate and the next call is also a bignumber gas estimate
        const successfulEstimation = estimatedCalls.find(
          (el, ix, list): el is SuccessfulCall =>
            'gasEstimate' in el && (ix === list.length - 1 || 'gasEstimate' in list[ix + 1])
        )

        if (!successfulEstimation) {
          const errorCalls = estimatedCalls.filter((call): call is FailedCall => 'error' in call)
          if (errorCalls.length > 0) throw errorCalls[errorCalls.length - 1].error
          throw new Error('Unexpected error. Please contact support: none of the calls threw an error')
        }

        const {
          call: {
            contract,
            parameters: { methodName, args, value }
          },
          gasEstimate
        } = successfulEstimation

        assertSwapInvariants(methodName, args, value, recipient, nowTs)

        const txRequest: any = {
          to: contract.address,
          from: account,
          data: contract.interface.encodeFunctionData(methodName, args),
          value: value && !isZero(value) ? value : '0x0',
          gasLimit: calculateGasMargin(gasEstimate).toHexString()
        }
        const debugEnabled =
          typeof window !== 'undefined' &&
          (window.location.search.includes('debug=1') ||
            window.location.hash.includes('debug=1') ||
            window.localStorage.getItem('debugSwap') === '1')
        if (debugEnabled) {
          emitDebug({
            lastSwapContext: {
              txRequestJson: JSON.stringify(txRequest),
              txTo: txRequest.to,
              txFrom: txRequest.from,
              txValue: txRequest.value,
              gasLimit: txRequest.gasLimit,
              methodName,
              argsSummary: {
                amount0: args[0]?.toString?.() ?? String(args[0]),
                amount1: args[1]?.toString?.() ?? String(args[1]),
                path: Array.isArray(args[args.length - 3]) ? args[args.length - 3] : null,
                to: args[args.length - 2]?.toString?.() ?? String(args[args.length - 2]),
                deadline: args[args.length - 1]?.toString?.() ?? String(args[args.length - 1])
              }
            }
          })
        }

        return contract[methodName](...args, {
          gasLimit: calculateGasMargin(gasEstimate),
          ...(value && !isZero(value) ? { value, from: account } : { from: account })
        })
          .then((response: any) => {
            const inputSymbol = trade.inputAmount.currency.symbol
            const outputSymbol = trade.outputAmount.currency.symbol
            const inputAmount = trade.inputAmount.toSignificant(3)
            const outputAmount = trade.outputAmount.toSignificant(3)

            const base = `Swap ${inputAmount} ${inputSymbol} for ${outputAmount} ${outputSymbol}`
            const withRecipient =
              recipient === account
                ? base
                : `${base} to ${
                    recipientAddressOrName && isAddress(recipientAddressOrName)
                      ? shortenAddress(recipientAddressOrName)
                      : recipientAddressOrName
                  }`

            const withVersion =
              tradeVersion === Version.v2 ? withRecipient : `${withRecipient} on ${(tradeVersion as any).toUpperCase()}`

            addTransaction(response, {
              summary: withVersion
            })

            return response.hash
          })
          .catch((error: any) => {
            if (error?.code === 4001) {
              throw new Error('Transaction rejected.')
            }
            console.error(`Swap failed`, error, methodName, args, value)
            throw new Error(extractSwapErrorMessage(error))
          })
      },
      error: null
    }
  }, [trade, library, account, chainId, recipient, recipientAddressOrName, swapCalls, addTransaction])
}
