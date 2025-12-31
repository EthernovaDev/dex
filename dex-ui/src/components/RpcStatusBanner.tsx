import React, { useMemo, useState } from 'react'
import styled from 'styled-components'
import { rpcCallWithFallback } from '../utils/ethernovaRpc'
import { useRpcStats } from '../hooks/useRpcStats'

const Banner = styled.div<{ $severity: 'warning' | 'error' }>`
  width: min(880px, 92vw);
  margin: 0 auto 12px;
  padding: 10px 14px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
  background: ${({ $severity }) =>
    $severity === 'error' ? 'rgba(248, 113, 113, 0.18)' : 'rgba(251, 191, 36, 0.16)'};
  border: 1px solid ${({ $severity }) => ($severity === 'error' ? 'rgba(248, 113, 113, 0.6)' : 'rgba(251, 191, 36, 0.5)')};
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
`

const BannerText = styled.span`
  color: rgba(255, 255, 255, 0.92);
`

const BannerButton = styled.button`
  border: 1px solid rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.9);
  padding: 6px 10px;
  border-radius: 10px;
  cursor: pointer;
`

export default function RpcStatusBanner() {
  const rpcStats = useRpcStats()
  const [retrying, setRetrying] = useState(false)

  const status = rpcStats?.status
  const lastSuccessAt = rpcStats?.lastSuccessAt ? Date.parse(rpcStats.lastSuccessAt) : null
  const recentSuccess = lastSuccessAt ? Date.now() - lastSuccessAt < 30000 : false

  const severity = useMemo(() => {
    if (status === 'down' && !recentSuccess) return 'error'
    if (status === 'degraded' || (status === 'down' && recentSuccess)) return 'warning'
    return null
  }, [status, recentSuccess])

  if (!severity) return null

  const message =
    severity === 'error'
      ? 'RPC unstable — using last known data. Try again.'
      : 'RPC degraded — showing cached data while network recovers.'

  const handleRetry = async () => {
    setRetrying(true)
    try {
      await rpcCallWithFallback('eth_chainId', [], 2)
    } catch {
      // ignore
    } finally {
      setRetrying(false)
    }
  }

  return (
    <Banner $severity={severity}>
      <BannerText>{message}</BannerText>
      <BannerButton onClick={handleRetry} disabled={retrying}>
        {retrying ? 'Retrying…' : 'Retry'}
      </BannerButton>
    </Banner>
  )
}
