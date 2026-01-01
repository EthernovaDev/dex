import React, { useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { Contract } from '@ethersproject/contracts'
import { parseUnits } from '@ethersproject/units'
import { SwapPoolTabs } from '../../components/NavigationTabs'
import { ButtonPrimary, ButtonLight } from '../../components/Button'
import { AutoColumn } from '../../components/Column'
import { RowBetween } from '../../components/Row'
import { TYPE } from '../../theme'
import { useActiveWeb3React } from '../../hooks'
import { switchToEthernova } from '../../utils/switchNetwork'
import { useEthernovaConfig } from '../../hooks/useEthernovaConfig'
import { NATIVE_SYMBOL } from '../../constants/ethernova'
import AppBody from '../AppBody'

const FormColumn = styled(AutoColumn)`
  width: 100%;
`

const SplitRow = styled(RowBetween)`
  gap: 12px;

  ${({ theme }) => theme.mediaWidth.upToSmall`
    flex-direction: column;
    align-items: stretch;
  `}
`

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
`

const Label = styled.label`
  font-size: 13px;
  color: ${({ theme }) => theme.text2};
`

const TextInput = styled.input`
  background: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 12px;
  padding: 12px 14px;
  color: ${({ theme }) => theme.text1};
  outline: none;
  font-size: 16px;
  width: 100%;

  ::placeholder {
    color: ${({ theme }) => theme.text3};
  }
`

const ToggleRow = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0 12px;

  ${({ theme }) => theme.mediaWidth.upToSmall`
    align-items: flex-start;
  `}
`

const Divider = styled.div`
  height: 1px;
  background: ${({ theme }) => theme.bg3};
  margin: 12px 0;
`

const TOKEN_FACTORY_ABI = [
  'function createToken(string name,string symbol,uint8 decimals,uint256 totalSupply) returns (address)',
  'function createTokenAndLaunch(string name,string symbol,uint8 decimals,uint256 totalSupply,uint256 tokenAmount,uint256 wnovaAmount,address to,uint256 deadline) returns (address token,address pair,uint256 liquidity)',
  'event TokenCreated(address indexed creator,address indexed token,string name,string symbol,uint8 decimals,uint256 totalSupply)',
  'event TokenLaunched(address indexed creator,address indexed token,address indexed pair,uint256 wnovaAmount,uint256 tokenAmount)'
]

const ERC20_ABI = [
  'function approve(address spender,uint256 amount) returns (bool)',
  'function allowance(address owner,address spender) view returns (uint256)'
]

export default function CreateToken() {
  const { account, chainId, library } = useActiveWeb3React()
  const { config } = useEthernovaConfig()

  const tokenFactoryAddress = config.contracts.tokenFactory ?? ''
  const wnovaAddress = config.tokens.WNOVA.address

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [decimals, setDecimals] = useState('18')
  const [totalSupply, setTotalSupply] = useState('')
  const [autoList, setAutoList] = useState(false)
  const [tokenAmount, setTokenAmount] = useState('')
  const [wnovaAmount, setWnovaAmount] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [createdPair, setCreatedPair] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [allowance, setAllowance] = useState('0')
  const [approvePending, setApprovePending] = useState(false)

  const signer = useMemo(() => (account && library ? library.getSigner(account) : null), [account, library])

  useEffect(() => {
    let stale = false
    if (!autoList || !account || !signer || !tokenFactoryAddress || !wnovaAddress) return
    const contract = new Contract(wnovaAddress, ERC20_ABI, signer)
    contract
      .allowance(account, tokenFactoryAddress)
      .then((value: any) => {
        if (!stale) setAllowance(value.toString())
      })
      .catch(() => {
        if (!stale) setAllowance('0')
      })
    return () => {
      stale = true
    }
  }, [autoList, account, signer, tokenFactoryAddress, wnovaAddress])

  const parsedDecimals = useMemo(() => {
    const n = Number(decimals)
    return Number.isFinite(n) && n >= 0 && n <= 18 ? n : null
  }, [decimals])

  const supplyRaw = useMemo(() => {
    if (!parsedDecimals || !totalSupply) return null
    try {
      return parseUnits(totalSupply, parsedDecimals)
    } catch {
      return null
    }
  }, [totalSupply, parsedDecimals])

  const tokenAmountRaw = useMemo(() => {
    if (!parsedDecimals || !tokenAmount) return null
    try {
      return parseUnits(tokenAmount, parsedDecimals)
    } catch {
      return null
    }
  }, [tokenAmount, parsedDecimals])

  const wnovaAmountRaw = useMemo(() => {
    if (!wnovaAmount) return null
    try {
      return parseUnits(wnovaAmount, 18)
    } catch {
      return null
    }
  }, [wnovaAmount])

  const needsApproval = useMemo(() => {
    if (!autoList || !wnovaAmountRaw) return false
    try {
      return BigInt(allowance) < BigInt(wnovaAmountRaw.toString())
    } catch {
      return true
    }
  }, [autoList, allowance, wnovaAmountRaw])

  const onApprove = useCallback(async () => {
    if (!signer || !account || !wnovaAddress || !tokenFactoryAddress) return
    if (!wnovaAmountRaw) return
    setApprovePending(true)
    setError(null)
    try {
      const contract = new Contract(wnovaAddress, ERC20_ABI, signer)
      const tx = await contract.approve(tokenFactoryAddress, wnovaAmountRaw)
      await tx.wait(1)
      setAllowance(wnovaAmountRaw.toString())
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Approve failed'
      setError(message)
    } finally {
      setApprovePending(false)
    }
  }, [signer, account, wnovaAddress, tokenFactoryAddress, wnovaAmountRaw])

  const onDeploy = useCallback(async () => {
    if (!signer || !account) return
    if (!tokenFactoryAddress) {
      setError('TokenFactory not configured')
      return
    }
    if (!name.trim() || !symbol.trim()) {
      setError('Name and symbol are required')
      return
    }
    if (!parsedDecimals || !supplyRaw) {
      setError('Invalid decimals or supply')
      return
    }
    if (autoList) {
      if (!tokenAmountRaw || !wnovaAmountRaw) {
        setError('Initial liquidity amounts are required')
        return
      }
      if (tokenAmountRaw.gt(supplyRaw)) {
        setError('Token amount exceeds total supply')
        return
      }
      if (needsApproval) {
        setError(`Approve ${NATIVE_SYMBOL} (WNOVA) first`)
        return
      }
    }

    setPending(true)
    setError(null)
    setTxHash(null)
    setCreatedToken(null)
    setCreatedPair(null)

    try {
      const factory = new Contract(tokenFactoryAddress, TOKEN_FACTORY_ABI, signer)
      let tx
      if (autoList) {
        tx = await factory.createTokenAndLaunch(
          name.trim(),
          symbol.trim().toUpperCase(),
          parsedDecimals,
          supplyRaw,
          tokenAmountRaw,
          wnovaAmountRaw,
          account,
          Math.floor(Date.now() / 1000) + 60 * 20
        )
      } else {
        tx = await factory.createToken(name.trim(), symbol.trim().toUpperCase(), parsedDecimals, supplyRaw)
      }
      setTxHash(tx.hash)
      const receipt = await tx.wait(1)
      for (const log of receipt.logs) {
        try {
          const parsed = factory.interface.parseLog(log)
          if (parsed?.name === 'TokenCreated') {
            setCreatedToken(parsed.args.token)
          }
          if (parsed?.name === 'TokenLaunched') {
            setCreatedPair(parsed.args.pair)
          }
        } catch {
          // ignore unrelated logs
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed'
      setError(message)
    } finally {
      setPending(false)
    }
  }, [account, autoList, name, symbol, parsedDecimals, supplyRaw, tokenAmountRaw, wnovaAmountRaw, tokenFactoryAddress, signer, needsApproval])

  const onAddToMetaMask = useCallback(async () => {
    if (!createdToken || !symbol || !parsedDecimals) return
    const eth = (window as any).ethereum
    if (!eth?.request) return
    try {
      await eth.request({
        method: 'wallet_watchAsset',
        params: {
          type: 'ERC20',
          options: {
            address: createdToken,
            symbol: symbol.trim().toUpperCase().slice(0, 11),
            decimals: parsedDecimals
          }
        }
      })
    } catch {
      // ignore
    }
  }, [createdToken, symbol, parsedDecimals])

  if (chainId && chainId !== 77777) {
    return (
      <AppBody>
        <SwapPoolTabs active={'create'} />
        <FormColumn gap="lg">
          <TYPE.largeHeader>Wrong network</TYPE.largeHeader>
          <TYPE.body style={{ marginTop: 8 }}>Switch to Ethernova (77777) to create tokens.</TYPE.body>
          <ButtonPrimary
            style={{ marginTop: 16, width: '100%' }}
            onClick={() => switchToEthernova().catch(() => undefined)}
          >
            Switch to Ethernova
          </ButtonPrimary>
        </FormColumn>
      </AppBody>
    )
  }

  return (
    <AppBody>
      <SwapPoolTabs active={'create'} />
      <FormColumn gap="lg">
        <TYPE.largeHeader>Create your own token</TYPE.largeHeader>
        <TYPE.body color="#9CA3AF" style={{ marginTop: 6 }}>
          Deploy a permissionless ERC-20 on Ethernova. This action is irreversible.
        </TYPE.body>

        <Divider />

        <Field>
          <Label>Name</Label>
          <TextInput placeholder="Nova Meme" value={name} onChange={e => setName(e.target.value)} />
        </Field>
        <Field>
          <Label>Symbol</Label>
          <TextInput placeholder="NOVA" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} />
        </Field>
        <SplitRow>
          <Field style={{ flex: 1 }}>
            <Label>Decimals</Label>
            <TextInput
              placeholder="18"
              value={decimals}
              onChange={e => setDecimals(e.target.value)}
              inputMode="numeric"
            />
          </Field>
          <Field style={{ flex: 1 }}>
            <Label>Total supply</Label>
            <TextInput
              placeholder="1000000"
              value={totalSupply}
              onChange={e => setTotalSupply(e.target.value)}
              inputMode="decimal"
            />
          </Field>
        </SplitRow>

        <ToggleRow>
          <input type="checkbox" checked={autoList} onChange={e => setAutoList(e.target.checked)} />
          <TYPE.body>Auto-list with initial liquidity (WNOVA pool)</TYPE.body>
        </ToggleRow>

        {autoList && (
          <>
            <SplitRow>
              <Field style={{ flex: 1 }}>
                <Label>Token amount</Label>
                <TextInput
                  placeholder="100000"
                  value={tokenAmount}
                  onChange={e => setTokenAmount(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
              <Field style={{ flex: 1 }}>
                <Label>{NATIVE_SYMBOL} amount</Label>
                <TextInput
                  placeholder="10"
                  value={wnovaAmount}
                  onChange={e => setWnovaAmount(e.target.value)}
                  inputMode="decimal"
                />
              </Field>
            </SplitRow>
            {needsApproval && (
              <ButtonLight disabled={approvePending} onClick={onApprove} style={{ marginTop: 8, width: '100%' }}>
                {approvePending ? `Approving ${NATIVE_SYMBOL}...` : `Approve ${NATIVE_SYMBOL}`}
              </ButtonLight>
            )}
          </>
        )}

        {error && (
          <TYPE.body color="#FCA5A5" style={{ marginTop: 12 }}>
            {error}
          </TYPE.body>
        )}

        <ButtonPrimary
          style={{ marginTop: 16, width: '100%' }}
          disabled={pending || !account || !tokenFactoryAddress}
          onClick={onDeploy}
        >
          {pending ? 'Deploying...' : autoList ? 'Deploy + Add Liquidity' : 'Deploy Token'}
        </ButtonPrimary>

        {(txHash || createdToken || createdPair) && (
          <AutoColumn gap="sm" style={{ marginTop: 16, width: '100%' }}>
            {txHash && (
              <TYPE.body>
                Tx:{' '}
                <a href={`https://explorer.ethnova.net/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                  {txHash}
                </a>
              </TYPE.body>
            )}
            {createdToken && (
              <TYPE.body>
                Token:{' '}
                <a
                  href={`https://explorer.ethnova.net/token/${createdToken}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {createdToken}
                </a>
              </TYPE.body>
            )}
            {createdPair && (
              <TYPE.body>
                Pair:{' '}
                <a
                  href={`https://explorer.ethnova.net/token/${createdPair}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {createdPair}
                </a>
              </TYPE.body>
            )}
            {createdToken && (
              <ButtonLight onClick={onAddToMetaMask} style={{ width: '100%' }}>
                Add token to MetaMask
              </ButtonLight>
            )}
          </AutoColumn>
        )}
      </FormColumn>
    </AppBody>
  )
}
