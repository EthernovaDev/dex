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
import { BodyWrapper } from '../AppBody'

const FormColumn = styled(AutoColumn)`
  width: 100%;
`

const PageContainer = styled.div`
  width: 100%;
  max-width: 1120px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-items: center;
  padding: 0 16px;
`

const TabsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
`

const CreateGrid = styled.div`
  width: 100%;
  display: grid;
  grid-template-columns: minmax(0, 520px) minmax(0, 360px);
  gap: 24px;
  justify-content: center;
  align-items: start;

  ${({ theme }) => theme.mediaWidth.upToLarge`
    grid-template-columns: minmax(0, 520px) minmax(0, 320px);
  `}

  ${({ theme }) => theme.mediaWidth.upToMedium`
    grid-template-columns: 1fr;
  `}
`

const CreateCard = styled(BodyWrapper)`
  max-width: 520px;
  width: 100%;
`

const InfoColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
  align-self: start;
  position: sticky;
  top: 96px;

  ${({ theme }) => theme.mediaWidth.upToMedium`
    position: static;
    display: none;
  `}
`

const InfoCard = styled.div`
  background: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 18px;
  padding: 16px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.25);
`

const InfoTitle = styled.div`
  font-size: 15px;
  font-weight: 600;
  color: ${({ theme }) => theme.text1};
  margin-bottom: 8px;
`

const InfoList = styled.ul`
  margin: 0;
  padding-left: 18px;
  color: ${({ theme }) => theme.text2};
  font-size: 13px;
  line-height: 1.5;
`

const InfoItem = styled.li`
  margin-bottom: 6px;
`

const InfoLinks = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
`

const InfoLink = styled.a`
  color: ${({ theme }) => theme.primary1};
  text-decoration: none;
  &:hover {
    text-decoration: underline;
  }
`

const MobileInfo = styled.details`
  width: 100%;
  display: none;
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 16px;
  padding: 12px 14px;
  background: ${({ theme }) => theme.bg2};
  color: ${({ theme }) => theme.text1};
  summary {
    cursor: pointer;
    font-weight: 600;
    list-style: none;
    outline: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  ${({ theme }) => theme.mediaWidth.upToMedium`
    display: block;
  `}
`

const SummaryCard = styled.div`
  border: 1px dashed ${({ theme }) => theme.bg4};
  border-radius: 14px;
  padding: 12px 14px;
  background: rgba(139, 92, 246, 0.08);
  color: ${({ theme }) => theme.text1};
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 6px;
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

const formatCompact = (value: number, maxDecimals = 6) => {
  if (!Number.isFinite(value)) return '—'
  const abs = Math.abs(value)
  if (abs === 0) return '0'
  if (abs < 1e-6) return '< 0.000001'
  const formatter = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: abs < 1 ? maxDecimals : Math.min(4, maxDecimals)
  })
  return formatter.format(value)
}

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

  const summary = useMemo(() => {
    if (!autoList) return null
    const tokenNum = Number(tokenAmount)
    const wnovaNum = Number(wnovaAmount)
    if (!Number.isFinite(tokenNum) || !Number.isFinite(wnovaNum) || wnovaNum <= 0) return null
    return {
      token: tokenNum,
      wnova: wnovaNum,
      priceTokenPerWnova: tokenNum / wnovaNum
    }
  }, [autoList, tokenAmount, wnovaAmount])

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
      <PageContainer>
        <TabsRow>
          <SwapPoolTabs active={'create'} />
        </TabsRow>
        <CreateGrid>
          <CreateCard>
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
          </CreateCard>
        </CreateGrid>
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <TabsRow>
        <SwapPoolTabs active={'create'} />
      </TabsRow>
      <CreateGrid>
        <CreateCard>
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
                {summary && (
                  <SummaryCard>
                    <TYPE.body>
                      Initial {NATIVE_SYMBOL} liquidity: {formatCompact(summary.wnova)}
                    </TYPE.body>
                    <TYPE.body>
                      Tokens allocated to pool: {formatCompact(summary.token)} {symbol || 'TOKEN'}
                    </TYPE.body>
                    <TYPE.body>
                      Implied starting price: {formatCompact(summary.priceTokenPerWnova)} {symbol || 'TOKEN'} per{' '}
                      {NATIVE_SYMBOL}
                    </TYPE.body>
                  </SummaryCard>
                )}
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
                    <a href={`${config.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                      {txHash}
                    </a>
                  </TYPE.body>
                )}
                {createdToken && (
                  <TYPE.body>
                    Token:{' '}
                    <a href={`${config.explorerUrl}/token/${createdToken}`} target="_blank" rel="noopener noreferrer">
                      {createdToken}
                    </a>
                  </TYPE.body>
                )}
                {createdPair && (
                  <TYPE.body>
                    Pair:{' '}
                    <a href={`${config.explorerUrl}/token/${createdPair}`} target="_blank" rel="noopener noreferrer">
                      {createdPair}
                    </a>
                  </TYPE.body>
                )}
                {createdToken && (
                  <ButtonLight onClick={onAddToMetaMask} style={{ width: '100%' }}>
                    Add token to MetaMask
                  </ButtonLight>
                )}
                {createdToken && (
                  <ButtonLight as="a" href={`/#/swap?outputCurrency=${createdToken}`} style={{ width: '100%' }}>
                    Go to Swap
                  </ButtonLight>
                )}
              </AutoColumn>
            )}
          </FormColumn>
        </CreateCard>

        <InfoColumn>
          <InfoCard>
            <InfoTitle>How it works</InfoTitle>
            <InfoList>
              <InfoItem>Deploy an ERC-20 via TokenFactory.</InfoItem>
              <InfoItem>The token is minted to your wallet.</InfoItem>
              <InfoItem>Optional: create WNOVA pool + seed initial liquidity.</InfoItem>
            </InfoList>
          </InfoCard>
          <InfoCard>
            <InfoTitle>Fees</InfoTitle>
            <InfoList>
              <InfoItem>LP fee (Uniswap V2): 0.30% → LPs.</InfoItem>
              <InfoItem>
                Protocol fee on swaps: 1% in WNOVA → Treasury 0x3a38…4fD.
              </InfoItem>
              <InfoItem>Deploying itself only costs gas unless the factory charges.</InfoItem>
            </InfoList>
          </InfoCard>
          <InfoCard>
            <InfoTitle>Safety</InfoTitle>
            <InfoList>
              <InfoItem>Deploy is irreversible.</InfoItem>
              <InfoItem>Test tokens only — do your own due diligence.</InfoItem>
              <InfoItem>Not audited; use at your own risk.</InfoItem>
            </InfoList>
          </InfoCard>
          <InfoCard>
            <InfoTitle>Links</InfoTitle>
            <InfoLinks>
              <InfoLink href={config.explorerUrl} target="_blank" rel="noopener noreferrer">
                Explorer
              </InfoLink>
              <InfoLink href="/#/swap" target="_blank" rel="noopener noreferrer">
                NovaDEX Swap
              </InfoLink>
            </InfoLinks>
          </InfoCard>
        </InfoColumn>
        <MobileInfo>
          <summary>Info & fees</summary>
          <AutoColumn gap="sm" style={{ marginTop: 12 }}>
            <InfoCard>
              <InfoTitle>How it works</InfoTitle>
              <InfoList>
                <InfoItem>Deploy an ERC-20 via TokenFactory.</InfoItem>
                <InfoItem>The token is minted to your wallet.</InfoItem>
                <InfoItem>Optional: create WNOVA pool + seed initial liquidity.</InfoItem>
              </InfoList>
            </InfoCard>
            <InfoCard>
              <InfoTitle>Fees</InfoTitle>
              <InfoList>
                <InfoItem>LP fee (Uniswap V2): 0.30% → LPs.</InfoItem>
                <InfoItem>
                  Protocol fee on swaps: 1% in WNOVA → Treasury 0x3a38…4fD.
                </InfoItem>
                <InfoItem>Deploying itself only costs gas unless the factory charges.</InfoItem>
              </InfoList>
            </InfoCard>
            <InfoCard>
              <InfoTitle>Safety</InfoTitle>
              <InfoList>
                <InfoItem>Deploy is irreversible.</InfoItem>
                <InfoItem>Test tokens only — do your own due diligence.</InfoItem>
                <InfoItem>Not audited; use at your own risk.</InfoItem>
              </InfoList>
            </InfoCard>
            <InfoCard>
              <InfoTitle>Links</InfoTitle>
              <InfoLinks>
                <InfoLink href={config.explorerUrl} target="_blank" rel="noopener noreferrer">
                  Explorer
                </InfoLink>
                <InfoLink href="/#/swap" target="_blank" rel="noopener noreferrer">
                  NovaDEX Swap
                </InfoLink>
              </InfoLinks>
            </InfoCard>
          </AutoColumn>
        </MobileInfo>
      </CreateGrid>
    </PageContainer>
  )
}
