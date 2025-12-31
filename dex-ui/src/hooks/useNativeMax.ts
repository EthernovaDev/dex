import { BigNumber } from '@ethersproject/bignumber'
import { CurrencyAmount, JSBI } from '@im33357/uniswap-v2-sdk'
import { useEffect, useMemo, useState } from 'react'
import { useActiveWeb3React } from './index'
import { useNativeBalance } from '../state/wallet/hooks'
import { MIN_ETH } from '../constants'

type UseNativeMaxOptions = {
  gasLimit?: BigNumber
  extraBufferWei?: BigNumber
}

const DEFAULT_GAS_LIMIT = BigNumber.from(200000)
const DEFAULT_GAS_PRICE = BigNumber.from(process.env.REACT_APP_GAS_PRICE_WEI ?? '5000000000')

function jsbiToBigNumber(value: JSBI): BigNumber {
  return BigNumber.from(value.toString())
}

export function useNativeMax(
  account?: string,
  options: UseNativeMaxOptions = {}
): {
  maxAmount?: CurrencyAmount
  status: 'idle' | 'ok' | 'wrong_network' | 'unavailable'
  error: string | null
  refresh: () => Promise<void>
} {
  const { library } = useActiveWeb3React()
  const { balance, status, error, refresh } = useNativeBalance(account)
  const [feePerGas, setFeePerGas] = useState<BigNumber | null>(null)

  useEffect(() => {
    if (!library) return
    let stale = false
    const load = async () => {
      try {
        const feeData = await (library as any)?.getFeeData?.()
        if (stale) return
        if (feeData?.maxFeePerGas) {
          setFeePerGas(feeData.maxFeePerGas)
        } else if (feeData?.gasPrice) {
          setFeePerGas(feeData.gasPrice)
        } else if ((library as any)?.getGasPrice) {
          const gasPrice = await (library as any).getGasPrice()
          if (!stale) setFeePerGas(gasPrice)
        } else {
          setFeePerGas(DEFAULT_GAS_PRICE)
        }
      } catch {
        if (!stale) setFeePerGas(DEFAULT_GAS_PRICE)
      }
    }
    load()
    return () => {
      stale = true
    }
  }, [library])

  const maxAmount = useMemo(() => {
    if (!balance || status !== 'ok') return undefined
    const rawBalance = jsbiToBigNumber(balance.raw)
    const gasLimit = options.gasLimit ?? DEFAULT_GAS_LIMIT
    const fee = feePerGas ?? DEFAULT_GAS_PRICE
    const safetyGasCost = fee.mul(gasLimit).mul(12).div(10)
    const buffer = options.extraBufferWei ?? jsbiToBigNumber(MIN_ETH)
    const totalBuffer = safetyGasCost.gt(buffer) ? safetyGasCost : buffer
    const spendable = rawBalance.gt(totalBuffer) ? rawBalance.sub(totalBuffer) : BigNumber.from(0)
    return CurrencyAmount.ether(JSBI.BigInt(spendable.toString()))
  }, [balance, feePerGas, options.gasLimit, options.extraBufferWei, status])

  return { maxAmount, status, error, refresh }
}
