import React, { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import CandleStickChart from './CandleChart'
import LocalLoader from './LocalLoader'
import Panel from './Panel'
import { TYPE } from '../Theme'
import { formattedNum, formatPrice } from '../utils'
import { useOnchainSwapHistory } from '../hooks/useOnchainSwapHistory'
import BigNumber from 'bignumber.js'

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
`

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
  margin-top: 12px;
`

const StatCard = styled.div`
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
`

const StatValue = styled.div`
  margin-top: 6px;
  font-size: 15px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
`

const TimeframeRow = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const TimeframeButton = styled.button`
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.4);
  background: rgba(139, 92, 246, 0.16);
  color: white;
  font-size: 12px;
  cursor: pointer;

  &[data-active='true'] {
    background: rgba(139, 92, 246, 0.35);
    border-color: rgba(139, 92, 246, 0.7);
  }
`

const TradeList = styled.div`
  margin-top: 16px;
  display: grid;
  gap: 8px;
`

const TradeRow = styled.div`
  display: grid;
  grid-template-columns: minmax(160px, 220px) 1fr 1fr 1fr;
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
`

const Badge = styled.span`
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 11px;
  text-transform: uppercase;
  color: ${({ $side }) => ($side === 'buy' ? '#22c55e' : '#ef4444')};
  background: ${({ $side }) => ($side === 'buy' ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)')};
  border: 1px solid ${({ $side }) => ($side === 'buy' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)')};
  display: inline-flex;
  align-items: center;
  justify-content: center;
  white-space: nowrap;
`

const Warning = styled.div`
  margin-top: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
`

const RetryButton = styled.button`
  margin-top: 10px;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(139, 92, 246, 0.5);
  background: rgba(139, 92, 246, 0.2);
  color: white;
  cursor: pointer;
`

const EmptyState = styled.div`
  padding: 18px 0 6px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
`

const CHART_HEIGHT = 320

const TIMEFRAMES = [
  { label: '5m', intervalSec: 300, lookbackBlocks: 20000 },
  { label: '1h', intervalSec: 3600, lookbackBlocks: 60000 },
  { label: '1d', intervalSec: 86400, lookbackBlocks: 140000 },
]

export default function OnchainMarketPanel({
  rpcUrl,
  factoryAddress,
  wnovaAddress,
  tonyAddress,
  pairAddress,
  swaps,
  showVolume = true,
}) {
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0])

  const wnovaLower = wnovaAddress?.toLowerCase?.() || ''
  const tonyLower = tonyAddress?.toLowerCase?.() || ''

  const subgraphSeries = useMemo(() => {
    if (!swaps || !swaps.length || !wnovaLower || !tonyLower) return null
    const candlesMap = new Map()
    const trades = []

    for (const swap of swaps) {
      const pairToken0 = swap?.pair?.token0?.id?.toLowerCase?.()
      const pairToken1 = swap?.pair?.token1?.id?.toLowerCase?.()
      if (!pairToken0 || !pairToken1) continue
      if (
        !(
          (pairToken0 === wnovaLower && pairToken1 === tonyLower) ||
          (pairToken1 === wnovaLower && pairToken0 === tonyLower)
        )
      ) {
        continue
      }

      const baseIsToken0 = pairToken0 === wnovaLower
      const amount0In = new BigNumber(swap?.amount0In || 0)
      const amount1In = new BigNumber(swap?.amount1In || 0)
      const amount0Out = new BigNumber(swap?.amount0Out || 0)
      const amount1Out = new BigNumber(swap?.amount1Out || 0)

      let baseAmount = new BigNumber(0)
      let quoteAmount = new BigNumber(0)
      let side = 'buy'
      if (baseIsToken0) {
        if (amount0In.gt(0) && amount1Out.gt(0)) {
          baseAmount = amount0In
          quoteAmount = amount1Out
          side = 'sell'
        } else if (amount1In.gt(0) && amount0Out.gt(0)) {
          baseAmount = amount0Out
          quoteAmount = amount1In
          side = 'buy'
        }
      } else {
        if (amount1In.gt(0) && amount0Out.gt(0)) {
          baseAmount = amount1In
          quoteAmount = amount0Out
          side = 'sell'
        } else if (amount0In.gt(0) && amount1Out.gt(0)) {
          baseAmount = amount1Out
          quoteAmount = amount0In
          side = 'buy'
        }
      }

      if (baseAmount.isZero() || quoteAmount.isZero()) continue
      const price = quoteAmount.div(baseAmount)
      if (!price.isFinite()) continue

      const timestamp = Number.parseInt(swap?.transaction?.timestamp || swap?.timestamp || 0, 10)
      if (!timestamp) continue
      const bucket = Math.floor(timestamp / timeframe.intervalSec) * timeframe.intervalSec

      const candle = candlesMap.get(bucket) || {
        timestamp: bucket,
        open: price.toNumber(),
        close: price.toNumber(),
        high: price.toNumber(),
        low: price.toNumber(),
        volume: new BigNumber(0),
      }
      candle.close = price.toNumber()
      candle.high = Math.max(candle.high, price.toNumber())
      candle.low = Math.min(candle.low, price.toNumber())
      candle.volume = candle.volume.plus(baseAmount)
      candlesMap.set(bucket, candle)

      const sideLabel = side === 'sell' ? 'SELL WNOVA (BUY TONY)' : 'BUY WNOVA (SELL TONY)'
      trades.push({
        timestamp,
        price: price.toNumber(),
        side,
        sideLabel,
        baseAmount: baseAmount.toNumber(),
        quoteAmount: quoteAmount.toNumber(),
        txHash: swap?.transaction?.id || swap?.id,
      })
    }

    const candles = Array.from(candlesMap.values()).sort((a, b) => a.timestamp - b.timestamp)
    const recentTrades = trades.sort((a, b) => b.timestamp - a.timestamp).slice(0, 50)

    return {
      status: candles.length ? 'ok' : recentTrades.length ? 'ok' : 'empty',
      candles,
      trades: recentTrades,
      lastPrice: candles[candles.length - 1]?.close || null,
      readPath: 'subgraph',
    }
  }, [swaps, timeframe.intervalSec, wnovaLower, tonyLower])

  const useSubgraph = Boolean(subgraphSeries && subgraphSeries.trades.length)

  const { status, candles, trades, lastPrice, refresh } = useOnchainSwapHistory({
    rpcUrl: useSubgraph ? null : rpcUrl,
    factoryAddress,
    wnovaAddress,
    tonyAddress,
    pairAddress,
    intervalSec: timeframe.intervalSec,
    lookbackBlocks: timeframe.lookbackBlocks,
  })

  const activeStatus = useSubgraph ? subgraphSeries.status : status
  const activeCandles = useSubgraph ? subgraphSeries.candles : candles
  const activeTrades = useSubgraph ? subgraphSeries.trades : trades
  const activeLastPrice = useSubgraph ? subgraphSeries.lastPrice : lastPrice

  const ref = useRef()
  const [width, setWidth] = useState(520)

  useEffect(() => {
    if (!ref.current) return
    const update = () => setWidth(ref.current.clientWidth || 520)
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  const nowSec = Math.floor(Date.now() / 1000)
  const cutoff24h = nowSec - 86400
  const candles24h = (activeCandles || []).filter((c) => c.timestamp >= cutoff24h)
  const trades24h = (activeTrades || []).filter((t) => t.timestamp >= cutoff24h)
  const first24h = candles24h[0]
  const last24h = candles24h[candles24h.length - 1]
  const change24h =
    first24h && last24h && first24h.open
      ? ((last24h.close - first24h.open) / first24h.open) * 100
      : null
  const volume24h = candles24h.reduce(
    (sum, candle) => sum + Number.parseFloat(candle.volume ? candle.volume.toString() : '0'),
    0
  )
  const isUp = change24h !== null && change24h >= 0

  return (
    <Panel style={{ marginBottom: '1.5rem' }}>
      <HeaderRow>
        <TYPE.main>Market activity (WNOVA / TONY)</TYPE.main>
        <TimeframeRow>
          {TIMEFRAMES.map((tf) => (
            <TimeframeButton
              key={tf.label}
              data-active={tf.label === timeframe.label}
              onClick={() => setTimeframe(tf)}
            >
              {tf.label}
            </TimeframeButton>
          ))}
        </TimeframeRow>
      </HeaderRow>
      <StatsRow>
        <StatCard>
          Current price
          <StatValue>{activeLastPrice ? `${formatPrice(activeLastPrice)} TONY/WNOVA` : '—'}</StatValue>
        </StatCard>
        <StatCard>
          24h change
          <StatValue style={{ color: change24h === null ? undefined : isUp ? '#22c55e' : '#ef4444' }}>
            {change24h === null ? '—' : `${change24h.toFixed(2)}%`}
          </StatValue>
        </StatCard>
        <StatCard>
          24h volume
          <StatValue>{volume24h ? `${formattedNum(volume24h, false)} WNOVA` : '—'}</StatValue>
        </StatCard>
        <StatCard>
          24h trades
          <StatValue>{trades24h.length || '—'}</StatValue>
        </StatCard>
      </StatsRow>
      <div id="novadex-candle-chart" ref={ref} style={{ marginTop: '12px' }}>
        {activeStatus === 'loading' && !activeCandles?.length ? (
          <LocalLoader />
        ) : activeCandles && activeCandles.length ? (
          <CandleStickChart
            data={activeCandles}
            base={activeLastPrice || 0}
            width={width}
            height={CHART_HEIGHT}
            showVolume={showVolume}
          />
        ) : (
          <EmptyState>No on-chain swaps yet.</EmptyState>
        )}
      </div>
      {activeStatus === 'error' && !useSubgraph ? (
        <>
          <Warning>On-chain data unavailable (RPC unstable).</Warning>
          <RetryButton onClick={refresh}>Retry</RetryButton>
        </>
      ) : null}
      <TradeList>
        <TYPE.main fontSize={'0.95rem'}>Recent trades</TYPE.main>
        {activeTrades && activeTrades.length ? (
          activeTrades.map((trade) => (
            <TradeRow key={`${trade.txHash}-${trade.timestamp}`}>
              <Badge $side={trade.side}>{trade.sideLabel || trade.side}</Badge>
              <span>{formattedNum(trade.baseAmount)} WNOVA</span>
              <span>{formattedNum(trade.quoteAmount)} TONY</span>
              <span>{formattedNum(trade.price)} TONY/WNOVA</span>
            </TradeRow>
          ))
        ) : (
          <EmptyState>No trades yet.</EmptyState>
        )}
      </TradeList>
    </Panel>
  )
}
