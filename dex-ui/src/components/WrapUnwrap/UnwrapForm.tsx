import { BigNumber } from '@ethersproject/bignumber'
import { Contract } from '@ethersproject/contracts'
import { Interface } from '@ethersproject/abi'
import { formatUnits, parseUnits } from '@ethersproject/units'
import React, { useContext, useMemo, useState } from 'react'
import styled, { ThemeContext } from 'styled-components'
import { useActiveWeb3React } from '../../hooks'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { useTransactionAdder } from '../../state/transactions/hooks'
import { isAddress } from '../../utils'
import { getEtherscanLink } from '../../utils'
import { switchToEthernova } from '../../utils/switchNetwork'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import { useWalletModalToggle } from '../../state/application/hooks'
import { ButtonLight, ButtonPrimary } from '../Button'
import Input from '../NumericalInput'
import { AutoColumn } from '../Column'
import { RowBetween } from '../Row'
import { ExternalLink, TYPE, LinkStyledButton } from '../../theme'
import { useBalances } from './useBalances'

const WNOVA_ABI = ['function deposit() payable', 'function withdraw(uint256)', 'function balanceOf(address) view returns (uint256)']
const WNOVA_IFACE = new Interface(WNOVA_ABI)

const FormCard = styled.div`
  background: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg4};
  border-radius: 16px;
  padding: 16px;
  width: 100%;
  box-sizing: border-box;
`

const AmountRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
  background: ${({ theme }) => theme.bg1};
  border: 1px solid ${({ theme }) => theme.bg4};
  border-radius: 14px;
  padding: 12px;
  width: 100%;
  min-width: 0;
`

const MaxButton = styled.button`
  border: 1px solid ${({ theme }) => theme.primary1};
  background: ${({ theme }) => theme.primary5};
  color: ${({ theme }) => theme.text1};
  padding: 6px 10px;
  border-radius: 10px;
  font-weight: 600;
  cursor: pointer;
`

const StatusText = styled(TYPE.main)`
  font-size: 14px;
`

const DebugPanel = styled.div`
  margin-top: 12px;
  padding: 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);
  word-break: break-word;
`

const DebugRow = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
`

const DebugLabel = styled.span`
  color: rgba(255, 255, 255, 0.55);
`

const DebugValue = styled.span`
  text-align: right;
`

const DebugButton = styled.button`
  border: 1px solid ${({ theme }) => theme.primary1};
  background: ${({ theme }) => theme.primary5};
  color: ${({ theme }) => theme.text1};
  padding: 4px 8px;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
`

type TxError = {
  message?: string
  code?: string | number
  data?: string
}

function formatBalance(balance: BigNumber): string {
  const raw = formatUnits(balance, 18)
  const [whole, frac = ''] = raw.split('.')
  const trimmed = frac.slice(0, 6)
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole
}

function shortenHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`
}

function getDebugEnabled(): boolean {
  if (typeof window === 'undefined') return false
  return new URLSearchParams(window.location.search).get('debug') === '1'
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // fallback below
  }
  try {
    const textarea = document.createElement('textarea')
    textarea.value = text
    textarea.style.position = 'fixed'
    textarea.style.opacity = '0'
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    return true
  } catch {
    return false
  }
}

export default function UnwrapForm() {
  const { account, chainId, library } = useActiveWeb3React()
  const { config } = useEthernovaConfig()
  const theme = useContext(ThemeContext)
  const toggleWalletModal = useWalletModalToggle()
  const addTransaction = useTransactionAdder()
  const { wnovaBalance, refreshBalances, status, error: balanceError } = useBalances()

  const [amount, setAmount] = useState('')
  const [pending, setPending] = useState(false)
  const [txHash, setTxHash] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugError, setDebugError] = useState<TxError | null>(null)
  const [copyStatus, setCopyStatus] = useState<string | null>(null)
  const debugEnabled = getDebugEnabled()

  const expectedChainId = config.chainId || 121525
  const wnovaAddress = isAddress(config.tokens.WNOVA.address)
  const wrongNetwork = Boolean(account && chainId && chainId !== expectedChainId) || status === 'wrong_network'
  const gasPriceWei = process.env.REACT_APP_GAS_PRICE_WEI
  const providerType = (library as any)?.provider?.constructor?.name || 'unknown'

  const wnovaContract = useMemo(() => {
    if (!library || !account || !wnovaAddress) return null
    return new Contract(wnovaAddress, WNOVA_ABI, library.getSigner(account))
  }, [account, library, wnovaAddress])

  const parsedAmount = useMemo(() => {
    if (!amount) return null
    try {
      return parseUnits(amount, 18)
    } catch {
      return null
    }
  }, [amount])

  const inputError = useMemo(() => {
    if (!wnovaAddress) return 'WNOVA address missing in config.'
    if (!account) return 'Connect wallet to unwrap.'
    if (wrongNetwork) return 'Wrong network.'
    if (status === 'unavailable') return 'Balance unavailable (RPC).'
    if (!parsedAmount || parsedAmount.lte(0)) return 'Enter an amount.'
    if (parsedAmount.gt(wnovaBalance)) return 'Insufficient WNOVA balance.'
    return null
  }, [account, parsedAmount, status, wnovaAddress, wrongNetwork, wnovaBalance])

  const handleMax = () => {
    setAmount(formatBalance(wnovaBalance))
  }

  const handleSwitch = () => {
    if (!account) {
      toggleWalletModal()
      return
    }
    switchToEthernova().catch(err => setError(err?.message || 'Switch failed'))
  }

  const handleUnwrap = async () => {
    if (!wnovaContract || !parsedAmount || !account) return
    setError(null)
    setDebugError(null)
    setPending(true)
    setConfirmed(false)
    setTxHash(null)
    try {
      if (debugEnabled) {
        console.debug('[unwrap] start', {
          chainId,
          account,
          providerType,
          method: 'withdraw',
          amountWei: parsedAmount.toString()
        })
      }
      const estimatedGas = await wnovaContract.estimateGas.withdraw(parsedAmount)
      const gasLimit = estimatedGas.mul(120).div(100)
      const overrides: Record<string, any> = { gasLimit }

      if (gasPriceWei) {
        overrides.gasPrice = BigNumber.from(gasPriceWei)
      } else if ((library as any)?.getFeeData) {
        try {
          const feeData = await (library as any).getFeeData()
          if (feeData?.maxFeePerGas && feeData?.maxPriorityFeePerGas) {
            overrides.maxFeePerGas = feeData.maxFeePerGas
            overrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
          }
        } catch {
          // let the wallet fill fees if feeData fails
        }
      }

      const tx = await wnovaContract.withdraw(parsedAmount, overrides)
      setTxHash(tx.hash)
      addTransaction(tx, { summary: `Unwrap ${amount} WNOVA to ${NATIVE_SYMBOL}` })
      await tx.wait(1)
      setConfirmed(true)
      setAmount('')
      await refreshBalances()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Transaction failed'
      const anyErr = err as any
      setDebugError({
        message,
        code: anyErr?.code,
        data: anyErr?.data
      })
      setError(message)
    } finally {
      setPending(false)
    }
  }

  const txLink = txHash && chainId ? getEtherscanLink(chainId, txHash, 'transaction') : null
  const withdrawCalldata = useMemo(() => {
    if (!parsedAmount) return WNOVA_IFACE.encodeFunctionData('withdraw', [BigNumber.from(0)])
    return WNOVA_IFACE.encodeFunctionData('withdraw', [parsedAmount])
  }, [parsedAmount])

  return (
    <FormCard>
      <AutoColumn gap="sm">
        <RowBetween>
          <TYPE.main>Unwrap WNOVA to {NATIVE_SYMBOL}</TYPE.main>
          <TYPE.main color={theme.text2}>
            Balance:{' '}
            {account
              ? status === 'wrong_network'
                ? 'Wrong network'
                : status === 'unavailable'
                ? 'Balance unavailable'
                : status === 'loading'
                ? 'Loading…'
                : `${formatBalance(wnovaBalance)} WNOVA`
              : '-'}
          </TYPE.main>
        </RowBetween>
        <AmountRow>
          <Input value={amount} onUserInput={setAmount} placeholder="0.0" fontSize="20px" />
          <MaxButton onClick={handleMax} disabled={status !== 'ready'}>
            Max
          </MaxButton>
        </AmountRow>

        {!account ? (
          <ButtonLight onClick={toggleWalletModal}>Connect wallet to unwrap</ButtonLight>
        ) : wrongNetwork ? (
          <ButtonPrimary onClick={handleSwitch}>Switch to Ethernova</ButtonPrimary>
        ) : (
          <ButtonPrimary disabled={Boolean(inputError) || pending} onClick={handleUnwrap}>
            {pending ? 'Waiting for confirmation…' : `Unwrap WNOVA → ${NATIVE_SYMBOL}`}
          </ButtonPrimary>
        )}

        {inputError && account && !wrongNetwork && <StatusText color={theme.red1}>{inputError}</StatusText>}
        {balanceError && status === 'unavailable' && (
          <StatusText color={theme.red1}>
            {balanceError} <LinkStyledButton onClick={refreshBalances}>Retry</LinkStyledButton>
          </StatusText>
        )}
        {error && <StatusText color={theme.red1}>{error}</StatusText>}
        {txHash && (
          <StatusText>
            Transaction submitted:{' '}
            {txLink ? <ExternalLink href={txLink}>{shortenHash(txHash)}</ExternalLink> : shortenHash(txHash)}
          </StatusText>
        )}
        {confirmed && <StatusText color={theme.green1}>Confirmed!</StatusText>}
        {debugEnabled && (
          <DebugPanel>
            <DebugRow>
              <DebugLabel>Chain / Account</DebugLabel>
              <DebugValue>
                {chainId ?? '—'} / {account ?? '—'}
              </DebugValue>
            </DebugRow>
            <DebugRow>
              <DebugLabel>Provider</DebugLabel>
              <DebugValue>{providerType}</DebugValue>
            </DebugRow>
            <DebugRow>
              <DebugLabel>Method</DebugLabel>
              <DebugValue>withdraw(uint256)</DebugValue>
            </DebugRow>
            <DebugRow>
              <DebugLabel>Calldata</DebugLabel>
              <DebugValue>{withdrawCalldata}</DebugValue>
            </DebugRow>
            <DebugRow>
              <DebugLabel>Copy calldata</DebugLabel>
              <DebugButton
                onClick={async () => {
                  const ok = await copyToClipboard(withdrawCalldata)
                  setCopyStatus(ok ? 'Copied' : 'Copy failed')
                  setTimeout(() => setCopyStatus(null), 1500)
                }}
              >
                Copy
              </DebugButton>
            </DebugRow>
            {copyStatus && <StatusText>{copyStatus}</StatusText>}
            {debugError && (
              <>
                <DebugRow>
                  <DebugLabel>Error</DebugLabel>
                  <DebugValue>{debugError.message}</DebugValue>
                </DebugRow>
                <DebugRow>
                  <DebugLabel>Code</DebugLabel>
                  <DebugValue>{debugError.code ?? '—'}</DebugValue>
                </DebugRow>
                <DebugRow>
                  <DebugLabel>Data</DebugLabel>
                  <DebugValue>{debugError.data ?? '—'}</DebugValue>
                </DebugRow>
              </>
            )}
          </DebugPanel>
        )}
      </AutoColumn>
    </FormCard>
  )
}
