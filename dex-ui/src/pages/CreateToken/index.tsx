import React, { useCallback, useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { Contract } from '@ethersproject/contracts'
import { parseUnits } from '@ethersproject/units'
import { AddressZero, HashZero } from '@ethersproject/constants'
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

const SuccessBlock = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 12px;
  padding: 10px 12px;
  width: 100%;
`

const SuccessGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 12px;
  width: 100%;
`

const SuccessActions = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 10px;
  width: 100%;
`

const SuccessLabel = styled.div`
  font-size: 12px;
  color: ${({ theme }) => theme.text2};
  text-transform: uppercase;
  letter-spacing: 0.02em;
`

const SuccessValue = styled.div`
  font-size: 13px;
  color: ${({ theme }) => theme.text1};
  word-break: break-all;
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

const TextArea = styled.textarea`
  background: ${({ theme }) => theme.bg2};
  border: 1px solid ${({ theme }) => theme.bg3};
  border-radius: 12px;
  padding: 12px 14px;
  color: ${({ theme }) => theme.text1};
  outline: none;
  font-size: 14px;
  width: 100%;
  min-height: 90px;
  resize: vertical;

  ::placeholder {
    color: ${({ theme }) => theme.text3};
  }
`

const FileInput = styled.input`
  color: ${({ theme }) => theme.text2};
  font-size: 13px;
`

const PreviewRow = styled.div`
  display: flex;
  align-items: center;
  gap: 12px;
`

const LogoPreview = styled.img`
  width: 44px;
  height: 44px;
  border-radius: 12px;
  object-fit: cover;
  border: 1px solid ${({ theme }) => theme.bg3};
  background: ${({ theme }) => theme.bg2};
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

const METADATA_REGISTRY_ABI = [
  'function setTokenURI(address token,string uri,bytes32 contentHash)',
  'function setPairURI(address pair,string uri,bytes32 contentHash)'
]

const FACTORY_ABI = [
  'function getPair(address tokenA,address tokenB) view returns (address pair)'
]

const PAIR_ABI = [
  'function getReserves() view returns (uint112,uint112,uint32)'
]

const TOKEN_METADATA_KEY = 'novadex:token-metadata'
const PAIR_METADATA_KEY = 'novadex:pair-metadata'
const METADATA_BASE = '/api/metadata'
const FALLBACK_IPFS_GATEWAY = 'https://dex.ethnova.net/ipfs/'

const toGatewayUrl = (uri: string) => {
  if (!uri) return ''
  const base = typeof window !== 'undefined' ? `${window.location.origin}/ipfs/` : FALLBACK_IPFS_GATEWAY
  return uri.startsWith('ipfs://') ? `${base}${uri.slice(7)}` : uri
}

const saveMetadataLocal = (tokenAddress: string, pairAddress: string | null, payload: Record<string, any>) => {
  if (typeof window === 'undefined' || !tokenAddress) return
  try {
    const tokenKey = tokenAddress.toLowerCase()
    const existingRaw = window.localStorage.getItem(TOKEN_METADATA_KEY)
    const existing = existingRaw ? JSON.parse(existingRaw) : {}
    existing[tokenKey] = { ...(existing[tokenKey] || {}), ...payload }
    window.localStorage.setItem(TOKEN_METADATA_KEY, JSON.stringify(existing))
  } catch {
    // ignore storage errors
  }

  if (pairAddress) {
    try {
      const pairKey = pairAddress.toLowerCase()
      const pairRaw = window.localStorage.getItem(PAIR_METADATA_KEY)
      const pairMap = pairRaw ? JSON.parse(pairRaw) : {}
      pairMap[pairKey] = {
        ...(pairMap[pairKey] || {}),
        ...payload.pairMeta,
      }
      window.localStorage.setItem(PAIR_METADATA_KEY, JSON.stringify(pairMap))
    } catch {
      // ignore storage errors
    }
  }
}

const fetchSignatureHeaders = async (account: string, signer: any) => {
  const challengeResp = await fetch(`${METADATA_BASE}/challenge`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: account })
  })
  const challenge = await challengeResp.json()
  if (!challenge?.message) {
    throw new Error('Metadata signature challenge failed')
  }
  const signature = await signer.signMessage(challenge.message)
  return {
    'x-address': account,
    'x-signature': signature
  }
}

const saveMetadataRemote = async (
  tokenAddress: string,
  pairAddress: string | null,
  payload: Record<string, any>,
  txHash: string,
  account: string,
  signer: any,
  logoFile: File | null,
  logoUrl: string
) => {
  if (!tokenAddress || !txHash) throw new Error('Missing token address or tx hash')
  if (!account || !signer) throw new Error('Wallet signature required')

  const tokenHeaders = await fetchSignatureHeaders(account, signer)
  const form = new FormData()
  form.append('tokenAddress', tokenAddress)
  form.append('txHash', txHash)
  form.append('name', payload.name || '')
  form.append('symbol', payload.symbol || '')
  form.append('description', payload.description || '')
  form.append('website', payload.website || '')
  form.append('twitter', payload.twitter || '')
  form.append('telegram', payload.telegram || '')
  form.append('discord', payload.discord || '')
  if (pairAddress) form.append('pairAddress', pairAddress)
  if (logoFile) {
    form.append('logo', logoFile)
  } else if (logoUrl) {
    form.append('logoUrl', logoUrl)
  }

  const tokenResp = await fetch(`${METADATA_BASE}/token`, {
    method: 'POST',
    headers: tokenHeaders,
    body: form
  })
  if (!tokenResp.ok) {
    const text = await tokenResp.text()
    throw new Error(text || 'Token metadata save failed')
  }
  const tokenJson = await tokenResp.json()
  const tokenMetadataUri = tokenJson?.metadataUri || tokenJson?.data?.metadata_uri || ''
  const tokenContentHash = tokenJson?.contentHash || tokenJson?.data?.content_hash || ''
  const tokenImageUri = tokenJson?.imageUri || tokenJson?.data?.image_uri || ''

  let pairJson: any = null
  if (pairAddress && payload?.pairMeta) {
    const pairHeaders = await fetchSignatureHeaders(account, signer)
    const pairResp = await fetch(`${METADATA_BASE}/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...pairHeaders },
      body: JSON.stringify({
        ...payload.pairMeta,
        pairAddress,
        txHash,
        metadataUri: tokenMetadataUri,
        contentHash: tokenContentHash
      })
    })
    if (!pairResp.ok) {
      const text = await pairResp.text()
      throw new Error(text || 'Pair metadata save failed')
    }
    pairJson = await pairResp.json()
  }
  return { tokenMetadataUri, tokenContentHash, tokenImageUri, pairJson }
}

const setRegistryUris = async (
  registryAddress: string,
  tokenAddress: string,
  pairAddress: string | null,
  metadataUri: string,
  contentHash: string,
  signer: any
) => {
  if (!registryAddress || !metadataUri || !signer) return
  const registry = new Contract(registryAddress, METADATA_REGISTRY_ABI, signer)
  const hash = contentHash && contentHash !== '' ? contentHash : HashZero
  await registry.setTokenURI(tokenAddress, metadataUri, hash)
  if (pairAddress) {
    await registry.setPairURI(pairAddress, metadataUri, hash)
  }
}

export default function CreateToken() {
  const { account, chainId, library } = useActiveWeb3React()
  const { config } = useEthernovaConfig()

  const tokenFactoryAddress = config.contracts.tokenFactory ?? ''
  const factoryAddress = config.contracts.factory ?? ''
  const wnovaAddress = config.tokens.WNOVA.address
  const metadataRegistryAddress = config.contracts.metadataRegistry ?? ''

  const isValidUrl = useCallback((value: string) => {
    if (!value) return true
    try {
      const url = new URL(value)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch (err) {
      return false
    }
  }, [])

  const [name, setName] = useState('')
  const [symbol, setSymbol] = useState('')
  const [decimals, setDecimals] = useState('18')
  const [totalSupply, setTotalSupply] = useState('')
  const [description, setDescription] = useState('')
  const [logoUrl, setLogoUrl] = useState('')
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState('')
  const [website, setWebsite] = useState('')
  const [twitter, setTwitter] = useState('')
  const [telegram, setTelegram] = useState('')
  const [discord, setDiscord] = useState('')
  const [autoList, setAutoList] = useState(false)
  const [tokenAmount, setTokenAmount] = useState('')
  const [wnovaAmount, setWnovaAmount] = useState('')
  const [txHash, setTxHash] = useState<string | null>(null)
  const [createdToken, setCreatedToken] = useState<string | null>(null)
  const [createdPair, setCreatedPair] = useState<string | null>(null)
  const [debugInjected, setDebugInjected] = useState(false)
  const [pairLiquidityReady, setPairLiquidityReady] = useState<boolean | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [metaStatus, setMetaStatus] = useState<{ state: string; error?: string } | null>(null)
  const [metadataUri, setMetadataUri] = useState<string | null>(null)
  const [metadataImageUri, setMetadataImageUri] = useState<string | null>(null)
  const [allowance, setAllowance] = useState('0')
  const [approvePending, setApprovePending] = useState(false)

  const isValidSymbol = useMemo(() => {
    if (!symbol) return false
    if (symbol.length < 2 || symbol.length > 11) return false
    return /^[A-Z0-9]+$/.test(symbol)
  }, [symbol])

  const isValidName = useMemo(() => name.trim().length > 1, [name])
  const isValidSupply = useMemo(() => {
    const parsed = Number(totalSupply)
    return Number.isFinite(parsed) && parsed > 0
  }, [totalSupply])

  const metadataProfile = useMemo(() => {
    const profile: Record<string, string> = {}
    if (description) profile.description = description
    if (logoPreview) profile.logo = logoPreview
    if (website) profile.website = website
    if (twitter) profile.twitter = twitter
    if (telegram) profile.telegram = telegram
    if (discord) profile.discord = discord
    return profile
  }, [description, logoPreview, website, twitter, telegram, discord])

  const isFormValid =
    Boolean(account) &&
    Boolean(tokenFactoryAddress) &&
    isValidName &&
    isValidSymbol &&
    isValidSupply &&
    isValidUrl(website) &&
    isValidUrl(twitter) &&
    isValidUrl(telegram) &&
    isValidUrl(discord) &&
    isValidUrl(logoUrl)

  const signer = useMemo(() => (account && library ? library.getSigner(account) : null), [account, library])

  useEffect(() => {
    if (debugInjected || typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    if (params.get('debug') !== '1' || params.get('success') !== '1') return
    const token = params.get('token')
    const pair = params.get('pair')
    const tx = params.get('tx')
    const metadataUriParam = params.get('metadataUri')
    const logoUriParam = params.get('logoUri')
    const pairStatus = params.get('pairStatus')
    if (tx) setTxHash(tx)
    if (token) setCreatedToken(token)
    if (pair) setCreatedPair(pair)
    if (metadataUriParam) setMetadataUri(decodeURIComponent(metadataUriParam))
    if (logoUriParam) setMetadataImageUri(decodeURIComponent(logoUriParam))
    if (pairStatus === 'confirmed') setPairLiquidityReady(true)
    if (pairStatus === 'pending') setPairLiquidityReady(false)
    if (metadataUriParam) setMetaStatus({ state: 'saved' })
    setDebugInjected(true)
  }, [debugInjected])

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

  useEffect(() => {
    if (!logoFile) return
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === 'string') setLogoPreview(result)
    }
    reader.readAsDataURL(logoFile)
  }, [logoFile])

  useEffect(() => {
    if (logoUrl) {
      setLogoPreview(logoUrl)
    } else if (!logoFile) {
      setLogoPreview('')
    }
  }, [logoUrl, logoFile])

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
    if (!isValidName || !isValidSymbol) {
      setError('Name and ticker are required (2–11 uppercase letters/numbers).')
      return
    }
    if (!isValidSupply || !parsedDecimals || !supplyRaw) {
      setError('Invalid decimals or supply')
      return
    }
    if (!isValidUrl(website) || !isValidUrl(twitter) || !isValidUrl(telegram) || !isValidUrl(discord) || !isValidUrl(logoUrl)) {
      setError('Please enter valid URLs for optional metadata fields.')
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
    setMetaStatus(null)
    setTxHash(null)
    setCreatedToken(null)
    setCreatedPair(null)
    setPairLiquidityReady(null)

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
      let tokenAddress: string | null = null
      let pairAddress: string | null = null
      for (const log of receipt.logs) {
        try {
          const parsed = factory.interface.parseLog(log)
          if (parsed?.name === 'TokenCreated') {
            tokenAddress = parsed.args.token
            setCreatedToken(parsed.args.token)
          }
          if (parsed?.name === 'TokenLaunched') {
            pairAddress = parsed.args.pair
            setCreatedPair(parsed.args.pair)
          }
        } catch {
          // ignore unrelated logs
        }
      }
      if (tokenAddress) {
        let verifiedPair = pairAddress
        if (autoList && factoryAddress && wnovaAddress) {
          try {
            const pairFactory = new Contract(factoryAddress, FACTORY_ABI, signer)
            const resolvedPair = await pairFactory.getPair(tokenAddress, wnovaAddress)
            if (resolvedPair && resolvedPair !== AddressZero) {
              const pairContract = new Contract(resolvedPair, PAIR_ABI, signer)
              const reserves = await pairContract.getReserves()
              verifiedPair = resolvedPair
              setCreatedPair(resolvedPair)
              if (reserves[0].gt(0) && reserves[1].gt(0)) {
                setPairLiquidityReady(true)
              } else {
                setError('Pool created but has no liquidity yet')
                setPairLiquidityReady(false)
              }
            } else if (verifiedPair) {
              setError('Pool created but has no liquidity yet')
              setPairLiquidityReady(false)
            } else {
              setError('Pool creation failed (pair not found)')
            }
          } catch {
            setError('Pool creation could not be verified')
            setPairLiquidityReady(null)
          }
        }

        const tokenLower = tokenAddress.toLowerCase()
        const wnovaLower = wnovaAddress?.toLowerCase?.()
        const pairMeta =
          verifiedPair && wnovaLower
            ? {
                token0: tokenLower < wnovaLower ? tokenLower : wnovaLower,
                token1: tokenLower < wnovaLower ? wnovaLower : tokenLower,
                symbol0: tokenLower < wnovaLower ? symbol.trim().toUpperCase() : NATIVE_SYMBOL,
                symbol1: tokenLower < wnovaLower ? NATIVE_SYMBOL : symbol.trim().toUpperCase(),
                createdAt: Date.now(),
              }
            : null

        const payload = {
          name: name.trim(),
          symbol: symbol.trim().toUpperCase(),
          decimals: parsedDecimals,
          totalSupply,
          description: description || '',
          logo: logoPreview || '',
          website: website || '',
          twitter: twitter || '',
          telegram: telegram || '',
          discord: discord || '',
          createdAt: Date.now(),
          pair: verifiedPair || undefined,
          pairMeta: pairMeta || undefined,
        }

        try {
          setMetaStatus({ state: 'saving' })
          const metaResult = await saveMetadataRemote(
            tokenAddress,
            verifiedPair || null,
            payload,
            tx.hash,
            account,
            signer,
            logoFile,
            logoUrl
          )
          if (metaResult?.tokenMetadataUri) {
            setMetadataUri(metaResult.tokenMetadataUri)
            if (metaResult?.tokenImageUri) {
              setMetadataImageUri(metaResult.tokenImageUri)
            }
            if (metadataRegistryAddress) {
              try {
                await setRegistryUris(
                  metadataRegistryAddress,
                  tokenAddress,
                  verifiedPair || null,
                  metaResult.tokenMetadataUri,
                  metaResult.tokenContentHash || '',
                  signer
                )
              } catch (registryErr) {
                console.warn('Registry set failed', registryErr)
              }
            }
          }
          setMetaStatus({ state: 'saved' })
        } catch (metaErr) {
          const message = metaErr instanceof Error ? metaErr.message : 'Metadata save failed'
          setMetaStatus({ state: 'error', error: message })
          saveMetadataLocal(tokenAddress, verifiedPair || null, payload)
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Deploy failed'
      setError(message)
    } finally {
      setPending(false)
    }
  }, [
    account,
    autoList,
    description,
    discord,
    factoryAddress,
    logoFile,
    logoUrl,
    metadataRegistryAddress,
    name,
    needsApproval,
    parsedDecimals,
    signer,
    supplyRaw,
    symbol,
    telegram,
    tokenAmountRaw,
    tokenFactoryAddress,
    twitter,
    website,
    wnovaAddress,
    wnovaAmountRaw,
  ])

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
      <PageContainer data-testid="create-page">
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
    <PageContainer data-testid="create-page">
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
              <Label>Coin name</Label>
              <TextInput
                placeholder="Name your coin"
                value={name}
                onChange={e => setName(e.target.value)}
                data-testid="create-input-name"
              />
            </Field>
            <Field>
              <Label>Ticker</Label>
              <TextInput
                placeholder="Add a coin ticker (e.g. DOGE)"
                value={symbol}
                onChange={e =>
                  setSymbol(
                    e.target.value
                      .toUpperCase()
                      .replace(/[^A-Z0-9]/g, '')
                      .slice(0, 11)
                  )
                }
                data-testid="create-input-symbol"
              />
              {!isValidSymbol && symbol ? (
                <TYPE.body fontSize={12} color="#FCA5A5">
                  Use 2–11 uppercase letters or numbers.
                </TYPE.body>
              ) : null}
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

            <Field>
              <Label>Description (Optional)</Label>
              <TextArea
                placeholder="Write a short description"
                value={description}
                onChange={e => setDescription(e.target.value.slice(0, 200))}
                data-testid="create-input-description"
              />
              <TYPE.body fontSize={12} color="text3">
                {description.length}/200
              </TYPE.body>
            </Field>

            <Field>
              <Label>Logo / Image (Optional)</Label>
              <TextInput
                placeholder="Image URL"
                value={logoUrl}
                onChange={e => setLogoUrl(e.target.value)}
                data-testid="create-input-logo-url"
              />
              <FileInput
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={e => setLogoFile(e.target.files?.[0] || null)}
                data-testid="create-input-logo-file"
              />
              {logoPreview ? (
                <PreviewRow>
                  <LogoPreview src={logoPreview} alt="Token logo preview" />
                  <TYPE.body fontSize={12} color="text3">
                    Logo is off-chain metadata only.
                  </TYPE.body>
                </PreviewRow>
              ) : (
                <TYPE.body fontSize={12} color="text3">
                  Logo is off-chain metadata only.
                </TYPE.body>
              )}
            </Field>

            <Field>
              <Label>Website (Optional)</Label>
              <TextInput
                placeholder="Add URL"
                value={website}
                onChange={e => setWebsite(e.target.value)}
                data-testid="create-input-website"
              />
            </Field>

            <SplitRow>
              <Field style={{ flex: 1 }}>
                <Label>X (Optional)</Label>
                <TextInput
                  placeholder="Add URL"
                  value={twitter}
                  onChange={e => setTwitter(e.target.value)}
                  data-testid="create-input-x"
                />
              </Field>
              <Field style={{ flex: 1 }}>
                <Label>Telegram (Optional)</Label>
                <TextInput
                  placeholder="Add URL"
                  value={telegram}
                  onChange={e => setTelegram(e.target.value)}
                  data-testid="create-input-telegram"
                />
              </Field>
            </SplitRow>

            <Field>
              <Label>Discord (Optional)</Label>
              <TextInput
                placeholder="Add URL"
                value={discord}
                onChange={e => setDiscord(e.target.value)}
                data-testid="create-input-discord"
              />
            </Field>

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
              disabled={pending || !isFormValid}
              onClick={onDeploy}
              data-testid="create-deploy-btn"
            >
              {pending ? 'Deploying...' : autoList ? 'Deploy + Add Liquidity' : 'Deploy Token'}
            </ButtonPrimary>

            {(txHash || createdToken || createdPair) && (
              <AutoColumn gap="sm" style={{ marginTop: 16, width: '100%' }} data-testid="create-success">
                <SuccessGrid>
                  {metaStatus?.state && (
                    <SuccessBlock>
                      <SuccessLabel>Metadata</SuccessLabel>
                      <SuccessValue>
                        {metaStatus.state === 'saving' && 'Saving metadata...'}
                        {metaStatus.state === 'saved' && 'Saved ✓'}
                        {metaStatus.state === 'error' && `Saved locally (remote failed): ${metaStatus.error || ''}`}
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                  {metadataUri && (
                    <SuccessBlock>
                      <SuccessLabel>Metadata URI</SuccessLabel>
                      <SuccessValue>
                        <a href={toGatewayUrl(metadataUri)} target="_blank" rel="noopener noreferrer">
                          {metadataUri}
                        </a>
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                  {metadataImageUri && (
                    <SuccessBlock>
                      <SuccessLabel>Logo URI</SuccessLabel>
                      <SuccessValue>
                        <a href={toGatewayUrl(metadataImageUri)} target="_blank" rel="noopener noreferrer">
                          {metadataImageUri}
                        </a>
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                  {txHash && (
                    <SuccessBlock>
                      <SuccessLabel>Transaction</SuccessLabel>
                      <SuccessValue>
                        <a href={`${config.explorerUrl}/tx/${txHash}`} target="_blank" rel="noopener noreferrer">
                          {txHash}
                        </a>
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                  {createdToken && (
                    <SuccessBlock>
                      <SuccessLabel>Token Address</SuccessLabel>
                      <SuccessValue>
                        <a href={`${config.explorerUrl}/token/${createdToken}`} target="_blank" rel="noopener noreferrer">
                          {createdToken}
                        </a>
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                  {createdPair && (
                    <SuccessBlock data-testid="create-success-pair-address">
                      <SuccessLabel>Pair Address</SuccessLabel>
                      <SuccessValue>
                        <a href={`${config.explorerUrl}/token/${createdPair}`} target="_blank" rel="noopener noreferrer">
                          {createdPair}
                        </a>
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                  {createdPair && (
                    <SuccessBlock data-testid="create-success-pair-status">
                      <SuccessLabel>Pair status</SuccessLabel>
                      <SuccessValue>
                        {pairLiquidityReady === true
                          ? 'Liquidity confirmed'
                          : pairLiquidityReady === false
                          ? 'Pool created, liquidity pending'
                          : 'Pending verification'}
                      </SuccessValue>
                    </SuccessBlock>
                  )}
                </SuccessGrid>
                <SuccessActions>
                  {createdToken && (
                    <ButtonLight onClick={onAddToMetaMask} style={{ width: '100%' }}>
                      Add token to MetaMask
                    </ButtonLight>
                  )}
                  {createdToken && Object.keys(metadataProfile).length ? (
                    <ButtonLight
                      onClick={() =>
                        navigator.clipboard.writeText(
                          JSON.stringify(
                            {
                              name,
                              symbol,
                              decimals,
                              totalSupply,
                              ...metadataProfile,
                            },
                            null,
                            2
                          )
                        )
                      }
                      style={{ width: '100%' }}
                    >
                      Copy Token Profile JSON
                    </ButtonLight>
                  ) : null}
                  {createdToken && (
                    <ButtonLight as="a" href={`/#/swap?outputCurrency=${createdToken}`} style={{ width: '100%' }}>
                      Go to Swap
                    </ButtonLight>
                  )}
                  {createdToken && (
                    <ButtonLight as="a" href={`/info/#/token/${createdToken}`} style={{ width: '100%' }}>
                      View Token Analytics
                    </ButtonLight>
                  )}
                  {createdPair && (
                    <ButtonLight as="a" href={`/info/#/pair/${createdPair}`} style={{ width: '100%' }}>
                      View Pair Analytics
                    </ButtonLight>
                  )}
                  {createdPair && (
                    <ButtonLight as="a" href={`/info/#/pair/${createdPair}#boost`} style={{ width: '100%' }}>
                      Boost this pair (10 NOVA / 24h)
                    </ButtonLight>
                  )}
                </SuccessActions>
              </AutoColumn>
            )}
          </FormColumn>
        </CreateCard>

        <InfoColumn data-testid="create-info-panel">
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
        <MobileInfo data-testid="create-info-accordion">
          <summary data-testid="create-info-accordion-toggle">Info & fees</summary>
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
