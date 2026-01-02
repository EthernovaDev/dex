import React, { useEffect, useMemo, useState } from 'react'
import styled from 'styled-components'
import { useWeb3React } from '@web3-react/core'
import {
  injected,
  walletconnect,
  INJECTED_SUPPORTED_CHAIN_IDS,
  WALLETCONNECT_SUPPORTED_CHAIN_IDS,
  NETWORK_DEFAULT_CHAIN_ID
} from '../../connectors'
import { NetworkContextName } from '../../constants'
import { DebugEventDetail } from '../../utils/debugEvents'

const Wrapper = styled.div`
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 11000;
  width: min(92vw, 360px);
  background: rgba(10, 12, 20, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  padding: 12px 14px;
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  line-height: 1.35;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.55);
  pointer-events: none;
`

const Title = styled.div`
  font-weight: 700;
  font-size: 12px;
  margin-bottom: 8px;
  letter-spacing: 0.02em;
  text-transform: uppercase;
`

const Row = styled.div`
  display: flex;
  justify-content: space-between;
  gap: 8px;
  margin: 4px 0;
`

const Label = styled.span`
  color: rgba(255, 255, 255, 0.6);
`

const Value = styled.span`
  text-align: right;
  word-break: break-all;
`

function parseChainId(raw?: string | number): number | null {
  if (raw === undefined || raw === null) return null
  if (typeof raw === 'number') return Number.isNaN(raw) ? null : raw
  const trimmed = raw.trim()
  if (!trimmed) return null
  const parsed = trimmed.startsWith('0x') ? parseInt(trimmed, 16) : parseInt(trimmed, 10)
  return Number.isNaN(parsed) ? null : parsed
}

function connectorName(connector: any): string {
  if (!connector) return 'none'
  if (connector === injected) return 'Injected'
  if (connector === walletconnect) return 'WalletConnect'
  return connector?.constructor?.name || 'Unknown'
}

export default function DebugOverlay() {
  const search = typeof window !== 'undefined' ? window.location.search : ''
  const debugEnabled = useMemo(() => new URLSearchParams(search).get('debug') === '1', [search])
  const { active, account, chainId, connector, error, library } = useWeb3React()
  const { active: networkActive, chainId: networkChainId } = useWeb3React(NetworkContextName)
  const [debugState, setDebugState] = useState<DebugEventDetail>(
    typeof window !== 'undefined' && window.__NOVADEX_DEBUG__ ? window.__NOVADEX_DEBUG__ : {}
  )

  useEffect(() => {
    if (!debugEnabled || typeof window === 'undefined') return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DebugEventDetail>).detail
      if (detail) setDebugState(detail)
    }
    window.addEventListener('novadex:debug', handler as EventListener)
    return () => window.removeEventListener('novadex:debug', handler as EventListener)
  }, [debugEnabled])

  if (!debugEnabled) return null

  const injectedPresent = typeof window !== 'undefined' && Boolean((window as any).ethereum)
  const injectedChainIdRaw = typeof window !== 'undefined' ? (window as any)?.ethereum?.chainId : undefined
  const injectedChainIdNum = parseChainId(injectedChainIdRaw)
  const isConnected = Boolean(account && library)
  const lastError = debugState.lastError
  const lastRuntimeCrash = debugState.lastRuntimeCrash || (typeof window !== 'undefined' && window.__NOVADEX_RUNTIME_CRASH__)
  const rpcStats = debugState.rpcStats
  const readRpcHost = rpcStats?.lastUrl || '—'
  const readRpcWarning = typeof readRpcHost === 'string' && /infura|mainnet/i.test(readRpcHost)
  const swapContext = debugState.lastSwapContext
  const swapSim = debugState.lastSwapSimulation
  const formatAmount = (value?: string | null) => (value && value.length ? value : '—')

  return (
    <Wrapper>
      <Title>Debug (nova)</Title>
      <Row>
        <Label>Injected</Label>
        <Value>{injectedPresent ? 'yes' : 'no'}</Value>
      </Row>
      <Row>
        <Label>Injected supports</Label>
        <Value>{INJECTED_SUPPORTED_CHAIN_IDS.join(', ')} (not enforced)</Value>
      </Row>
      <Row>
        <Label>Active / Connected</Label>
        <Value>
          {active ? 'active' : 'inactive'} / {isConnected ? 'connected' : 'no'}
        </Value>
      </Row>
      <Row>
        <Label>Account</Label>
        <Value>{account || '—'}</Value>
      </Row>
      <Row>
        <Label>ChainId (raw / parsed / ctx)</Label>
        <Value>
          {injectedChainIdRaw || '—'} / {injectedChainIdNum ?? '—'} / {chainId ?? '—'}
        </Value>
      </Row>
      <Row>
        <Label>Connector</Label>
        <Value>{connectorName(connector)}</Value>
      </Row>
      <Row>
        <Label>WalletConnect supports</Label>
        <Value>{WALLETCONNECT_SUPPORTED_CHAIN_IDS.join(', ')}</Value>
      </Row>
      <Row>
        <Label>Network ctx</Label>
        <Value>{networkActive ? networkChainId ?? '—' : 'inactive'}</Value>
      </Row>
      <Row>
        <Label>Network default</Label>
        <Value>{NETWORK_DEFAULT_CHAIN_ID}</Value>
      </Row>
      <Row>
        <Label>Library</Label>
        <Value>
          {library?.network?.name || '—'} {library?.network?.chainId ?? ''}
        </Value>
      </Row>
      <Row>
        <Label>Last activation</Label>
        <Value>{debugState.lastActivationAt || '—'}</Value>
      </Row>
      <Row>
        <Label>Last error</Label>
        <Value>
          {lastError ? `${lastError.name}: ${lastError.message}` : error ? error.message : '—'}
        </Value>
      </Row>
      <Row>
        <Label>Last runtime crash</Label>
        <Value>
          {lastRuntimeCrash
            ? `${lastRuntimeCrash.source}: ${lastRuntimeCrash.message} (${lastRuntimeCrash.time})`
            : '—'}
        </Value>
      </Row>
      <Row>
        <Label>Read RPC</Label>
        <Value>{readRpcWarning ? `${readRpcHost} ⚠️` : readRpcHost}</Value>
      </Row>
      <Row>
        <Label>RPC status</Label>
        <Value>{rpcStats?.status || '—'}</Value>
      </Row>
      <Row>
        <Label>RPC last success</Label>
        <Value>{rpcStats?.lastSuccessAt || '—'}</Value>
      </Row>
      <Row>
        <Label>RPC last error</Label>
        <Value>
          {rpcStats?.lastErrorType
            ? `${rpcStats.lastErrorType}: ${rpcStats.lastError ?? ''}`
            : rpcStats?.lastError ?? '—'}
        </Value>
      </Row>
      <Row>
        <Label>RPC retries</Label>
        <Value>{rpcStats?.retryCount ?? 0}</Value>
      </Row>
      <Row>
        <Label>Last action</Label>
        <Value>
          {debugState.lastAction ? `${debugState.lastAction.name} (${debugState.lastAction.time})` : '—'}
        </Value>
      </Row>
      <Row>
        <Label>Position state</Label>
        <Value>
          {debugState.lastPositionState
            ? `${debugState.lastPositionState.name} (${debugState.lastPositionState.time})`
            : '—'}
        </Value>
      </Row>
      <Title style={{ marginTop: '10px' }}>Swap Debug</Title>
      <Row>
        <Label>Swap router</Label>
        <Value>{swapContext?.router || '—'}</Value>
      </Row>
      <Row>
        <Label>Approve spender</Label>
        <Value>{swapContext?.spender || '—'}</Value>
      </Row>
      <Row>
        <Label>Token in / out</Label>
        <Value>
          {swapContext?.tokenIn || '—'} / {swapContext?.tokenOut || '—'}
        </Value>
      </Row>
      <Row>
        <Label>Amount in (user/gross/net)</Label>
        <Value>
          {formatAmount(swapContext?.amountInUser)} / {formatAmount(swapContext?.amountInGross)} /{' '}
          {formatAmount(swapContext?.amountInNet)}
        </Value>
      </Row>
      <Row>
        <Label>Fee WNOVA</Label>
        <Value>{formatAmount(swapContext?.feeWnova)}</Value>
      </Row>
      <Row>
        <Label>MinOut</Label>
        <Value>{formatAmount(swapContext?.minOut)}</Value>
      </Row>
      <Row>
        <Label>Slippage / Deadline</Label>
        <Value>
          {swapContext?.slippageBps ?? '—'} / {swapContext?.deadline ?? '—'}
        </Value>
      </Row>
      <Row>
        <Label>Path</Label>
        <Value>{swapContext?.path?.join(' -> ') || '—'}</Value>
      </Row>
      <Row>
        <Label>Allowance / Balance</Label>
        <Value>
          {formatAmount(swapContext?.allowance)} / {formatAmount(swapContext?.balance)}
        </Value>
      </Row>
      <Row>
        <Label>TransferFrom total</Label>
        <Value>{formatAmount(swapContext?.willTransferFromTotal)}</Value>
      </Row>
      <Row>
        <Label>Simulate</Label>
        <Value>
          {swapSim?.status ? `${swapSim.status}${swapSim.reason ? `: ${swapSim.reason}` : ''}` : '—'}
        </Value>
      </Row>
    </Wrapper>
  )
}
