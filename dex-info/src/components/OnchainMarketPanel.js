import React, { useEffect, useMemo, useRef, useState } from 'react'
import styled from 'styled-components'
import SimpleSeriesChart from './SimpleSeriesChart'
import LocalLoader from './LocalLoader'
import Panel from './Panel'
import { TYPE } from '../Theme'
import { formattedNum, formatPrice, formatTime, isFiniteNum, normAddr, isAddrEq } from '../utils'
import { useOnchainSwapHistory } from '../hooks/useOnchainSwapHistory'
import BigNumber from 'bignumber.js'

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
`

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 12px;

  @media screen and (max-width: 640px) {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }
`

const StatCard = styled.div`
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.03);
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  line-height: 1.3;
  min-height: 86px;
`

const StatLabel = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
`

const StatSubLabel = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
`

const StatValue = styled.div`
  font-size: 16px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  line-height: 1.25;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
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

const TradeHeaderRow = styled.div`
  display: grid;
  grid-template-columns: minmax(150px, 200px) minmax(120px, 1fr) minmax(120px, 1fr) minmax(90px, 120px);
  gap: 8px;
  font-size: 11px;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.55);
  margin-bottom: 4px;

  @media screen and (max-width: 640px) {
    grid-template-columns: 1fr 1fr;
    row-gap: 6px;
  }
`

const TradeRow = styled.div`
  display: grid;
  grid-template-columns: minmax(150px, 200px) minmax(120px, 1fr) minmax(120px, 1fr) minmax(90px, 120px);
  gap: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  align-items: center;
  font-variant-numeric: tabular-nums;

  @media screen and (max-width: 640px) {
    grid-template-columns: 1fr 1fr;
    row-gap: 6px;
  }
`

const TradeCell = styled.span`
  text-align: right;
  white-space: nowrap;

  &:first-child {
    text-align: left;
  }
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
  padding: 6px 0 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
`

const ChartShell = styled.div`
  margin-top: 12px;
  min-height: 260px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  overflow: hidden;
`

const ChartControlsRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 10px;
`

const ChartTabs = styled.div`
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
`

const CHART_HEIGHT = 260

const TIMEFRAMES = [
  { label: '1H', intervalSec: 3600, lookbackBlocks: 60000 },
  { label: '1D', intervalSec: 86400, lookbackBlocks: 140000 },
  { label: '1W', intervalSec: 604800, lookbackBlocks: 500000 },
  { label: '1M', intervalSec: 2592000, lookbackBlocks: 1800000 },
  { label: '1Y', intervalSec: 31536000, lookbackBlocks: 6000000 },
]

const CHART_TABS = [
  { key: 'price', label: 'Price' },
  { key: 'volume', label: 'Volume' },
  { key: 'liquidity', label: 'Liquidity' },
]

export default function OnchainMarketPanel({
  rpcUrl,
  factoryAddress,
  baseTokenAddress,
  quoteTokenAddress,
  baseSymbol = 'WNOVA',
  quoteSymbol = 'TOKEN',
  pairAddress,
  reserveBase,
  reserveQuote,
  liquiditySeries,
  swaps,
  showVolume = true,
  allowOnchain = true,
  testIdPrefix = 'market',
  recentTradesTestId,
  recentTradesEmptyTestId,
  dataDelayed = false,
  onRetry,
}) {
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0])
  const [chartTab, setChartTab] = useState(CHART_TABS[0].key)
  const [allowOnchainDelayed, setAllowOnchainDelayed] = useState(false)

  const baseLower = normAddr(baseTokenAddress)
  const quoteLower = normAddr(quoteTokenAddress)

  const subgraphSeries = useMemo(() => {
    if (!swaps || !swaps.length || !baseLower || !quoteLower) return null
    const candlesMap = new Map()
    const trades = []

    for (const swap of swaps) {
      const pairToken0 = normAddr(swap?.pair?.token0?.id)
      const pairToken1 = normAddr(swap?.pair?.token1?.id)
      if (!pairToken0 || !pairToken1) continue

      const isToken0Base = isAddrEq(pairToken0, baseLower)
      const isToken1Base = isAddrEq(pairToken1, baseLower)
      const isToken0Quote = isAddrEq(pairToken0, quoteLower)
      const isToken1Quote = isAddrEq(pairToken1, quoteLower)
      if (!((isToken0Base && isToken1Quote) || (isToken1Base && isToken0Quote))) continue

      const amount0In = new BigNumber(swap?.amount0In || 0)
      const amount1In = new BigNumber(swap?.amount1In || 0)
      const amount0Out = new BigNumber(swap?.amount0Out || 0)
      const amount1Out = new BigNumber(swap?.amount1Out || 0)

      let amountBaseIn = new BigNumber(0)
      let amountBaseOut = new BigNumber(0)
      let amountQuoteIn = new BigNumber(0)
      let amountQuoteOut = new BigNumber(0)

      if (isToken0Base) {
        amountBaseIn = amount0In
        amountBaseOut = amount0Out
      } else if (isToken1Base) {
        amountBaseIn = amount1In
        amountBaseOut = amount1Out
      }

      if (isToken0Quote) {
        amountQuoteIn = amount0In
        amountQuoteOut = amount0Out
      } else if (isToken1Quote) {
        amountQuoteIn = amount1In
        amountQuoteOut = amount1Out
      }

      let side = null
      let baseAmount = new BigNumber(0)
      let quoteAmount = new BigNumber(0)
      if (amountBaseIn.gt(0) && amountQuoteOut.gt(0)) {
        side = 'buy'
        baseAmount = amountBaseIn
        quoteAmount = amountQuoteOut
      } else if (amountQuoteIn.gt(0) && amountBaseOut.gt(0)) {
        side = 'sell'
        baseAmount = amountBaseOut
        quoteAmount = amountQuoteIn
      }

      if (!side || baseAmount.isZero() || quoteAmount.isZero()) continue
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

      const sideLabel = side === 'sell' ? `SELL ${quoteSymbol}` : `BUY ${quoteSymbol}`
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
  }, [swaps, timeframe.intervalSec, baseLower, quoteLower, quoteSymbol])

  const useSubgraph = Boolean(subgraphSeries && subgraphSeries.trades.length)

  useEffect(() => {
    if (!allowOnchain) {
      setAllowOnchainDelayed(false)
      return
    }
    const timer = setTimeout(() => setAllowOnchainDelayed(true), 15000)
    return () => clearTimeout(timer)
  }, [allowOnchain])

  const useOnchain = allowOnchainDelayed && !useSubgraph
  const { status, candles, trades, lastPrice, refresh } = useOnchainSwapHistory({
    rpcUrl: useOnchain ? rpcUrl : null,
    factoryAddress,
    baseTokenAddress,
    quoteTokenAddress,
    pairAddress,
    intervalSec: timeframe.intervalSec,
    lookbackBlocks: timeframe.lookbackBlocks,
  })

  const activeStatus = useSubgraph ? subgraphSeries.status : useOnchain ? status : 'empty'
  const activeCandles = useSubgraph ? subgraphSeries.candles : useOnchain ? candles : []
  const activeTrades = useSubgraph ? subgraphSeries.trades : useOnchain ? trades : []
  const activeLastPrice = useSubgraph ? subgraphSeries.lastPrice : useOnchain ? lastPrice : null
  const rpcWarning = dataDelayed || activeStatus === 'error'
  const rpcWarningLabel = activeStatus === 'error' ? 'RPC busy, retrying…' : dataDelayed ? 'Data delayed, retrying…' : ''

  const priceSeries = useMemo(() => {
    if (!activeCandles || !activeCandles.length) return []
    return activeCandles
      .map((candle) => ({
        time: Number(candle.timestamp),
        value: Number(candle.close ?? candle.open ?? 0),
      }))
      .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
  }, [activeCandles])

  const fallbackPriceSeries = useMemo(() => {
    if (activeTrades && activeTrades.length) {
      return activeTrades
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((trade) => ({
          time: Number(trade.timestamp),
          value: Number(trade.price || 0),
        }))
        .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
    }
    if (Number.isFinite(reserveBase) && Number.isFinite(reserveQuote) && reserveBase > 0 && reserveQuote > 0) {
      const now = Math.floor(Date.now() / 1000)
      const price = reserveQuote / reserveBase
      return [
        { time: now - 3600, value: price },
        { time: now, value: price },
      ]
    }
    if (isFiniteNum(activeLastPrice)) {
      const now = Math.floor(Date.now() / 1000)
      return [
        { time: now - 3600, value: Number(activeLastPrice) },
        { time: now, value: Number(activeLastPrice) },
      ]
    }
    return []
  }, [activeTrades, reserveBase, reserveQuote, activeLastPrice])

  const priceSeriesFinal = priceSeries.length ? priceSeries : fallbackPriceSeries

  const volumeSeries = useMemo(() => {
    if (!activeCandles || !activeCandles.length) return []
    return activeCandles.map((candle) => {
      const isUp = Number(candle.close) >= Number(candle.open)
      return {
        time: Number(candle.timestamp),
        value: Number(candle.volume || 0),
        color: isUp ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
      }
    })
  }, [activeCandles])

  const volumeSeriesFinal = useMemo(() => {
    if (volumeSeries.length) return volumeSeries
    if (!activeTrades || !activeTrades.length) return []
    return activeTrades.map((trade) => ({
      time: Number(trade.timestamp),
      value: Number(trade.baseAmount || 0),
      color: trade.side === 'buy' ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)',
    }))
  }, [activeTrades, volumeSeries])

  const liquiditySeriesFinal = useMemo(() => {
    if (liquiditySeries && liquiditySeries.length) return liquiditySeries
    if (Number.isFinite(reserveBase) && reserveBase > 0) {
      const now = Math.floor(Date.now() / 1000)
      if (activeCandles && activeCandles.length) {
        return activeCandles.map((c) => ({ time: Number(c.timestamp), value: Number(reserveBase) }))
      }
      return [{ time: now, value: Number(reserveBase) }]
    }
    return []
  }, [liquiditySeries, reserveBase, activeCandles])

  const ref = useRef()
  const idPrefix = testIdPrefix || 'market'
  const chartTestId = `${idPrefix}-chart`
  const emptyTestId = `${idPrefix}-empty`
  const hasDataTestId = `${idPrefix}-has-data`
  const tradesTestId = recentTradesTestId || `${idPrefix}-recent-trades`
  const tradesEmptyTestId = recentTradesEmptyTestId || `${idPrefix}-recent-trades-empty`
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
  const priceValue = isFiniteNum(activeLastPrice) ? formatPrice(activeLastPrice) : '—'
  const changeValue = isFiniteNum(change24h) ? `${change24h.toFixed(2)}%` : '—'
  const volumeValue = isFiniteNum(volume24h) ? `${formattedNum(volume24h, false)} ${baseSymbol}` : '—'
  const tradesValue = Number.isFinite(trades24h.length) ? trades24h.length : '—'


  const hasMarketData = Boolean(
    (priceSeriesFinal && priceSeriesFinal.length) ||
      (volumeSeriesFinal && volumeSeriesFinal.length) ||
      (liquiditySeriesFinal && liquiditySeriesFinal.length)
  )

  const handleRetry = () => {
    if (onRetry) onRetry()
    if (refresh) refresh()
  }

  return (
    <Panel style={{ marginBottom: '1.5rem' }}>
      <HeaderRow>
        <TYPE.main data-testid="market-activity-title">{`Market activity (${quoteSymbol} / ${baseSymbol})`}</TYPE.main>
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
        <StatCard data-testid="market-pool-price">
          <StatLabel data-testid="market-pool-price-label">Pool price</StatLabel>
          <StatValue data-testid="market-pool-price-value">{priceValue}</StatValue>
          <StatSubLabel>{`${quoteSymbol}/${baseSymbol}`}</StatSubLabel>
        </StatCard>
        <StatCard data-testid="market-24h-change">
          <StatLabel data-testid="market-24h-change-label">24h change</StatLabel>
          <StatValue
            data-testid="market-24h-change-value"
            style={{ color: !isFiniteNum(change24h) ? undefined : isUp ? '#22c55e' : '#ef4444' }}
          >
            {changeValue}
          </StatValue>
        </StatCard>
        <StatCard data-testid="market-24h-volume">
          <StatLabel data-testid="market-24h-volume-label">24h volume</StatLabel>
          <StatValue data-testid="market-24h-volume-value">{volumeValue}</StatValue>
        </StatCard>
        <StatCard data-testid="market-24h-trades">
          <StatLabel data-testid="market-24h-trades-label">24h trades</StatLabel>
          <StatValue data-testid="market-24h-trades-value">{tradesValue}</StatValue>
        </StatCard>
      </StatsRow>
      {rpcWarning && (
        <Warning data-testid={`${idPrefix}-rpc-warning`}>
          {rpcWarningLabel}
          <RetryButton onClick={handleRetry}>Retry</RetryButton>
          {pairAddress && (
            <span style={{ marginLeft: '0.5rem', display: 'inline-flex', alignItems: 'center' }}>
              <span style={{ marginRight: 4 }}>{pairAddress.slice(0, 6)}…{pairAddress.slice(-4)}</span>
              <button
                onClick={() => navigator.clipboard?.writeText(pairAddress)}
                style={{
                  border: 'none',
                  background: 'transparent',
                  color: 'rgba(255,255,255,0.7)',
                  cursor: 'pointer',
                }}
              >
                Copy
              </button>
            </span>
          )}
        </Warning>
      )}
      <ChartControlsRow>
        <ChartTabs>
          {CHART_TABS.map((tab) => (
            <TimeframeButton
              key={tab.key}
              data-active={tab.key === chartTab}
              onClick={() => setChartTab(tab.key)}
            >
              {tab.label}
            </TimeframeButton>
          ))}
        </ChartTabs>
      </ChartControlsRow>
      <ChartShell id="novadex-candle-chart" ref={ref} data-testid={chartTestId}>
        {activeStatus === 'loading' && !activeCandles?.length ? (
          <LocalLoader />
        ) : chartTab === 'price' && priceSeriesFinal.length > 1 ? (
          <SimpleSeriesChart
            data={priceSeriesFinal}
            width={width}
            height={CHART_HEIGHT}
            type="area"
            valueFormatter={(val) => formatPrice(val)}
          />
        ) : chartTab === 'volume' && volumeSeriesFinal.length > 1 ? (
          <SimpleSeriesChart
            data={volumeSeriesFinal}
            width={width}
            height={CHART_HEIGHT}
            type="histogram"
            valueFormatter={(val) => formattedNum(val, false)}
          />
        ) : chartTab === 'liquidity' && liquiditySeriesFinal.length > 1 ? (
          <SimpleSeriesChart
            data={liquiditySeriesFinal}
            width={width}
            height={CHART_HEIGHT}
            type="area"
            valueFormatter={(val) => formattedNum(val, false)}
          />
        ) : (
          <EmptyState data-testid={emptyTestId}>
            {rpcWarning ? 'Data delayed — retrying…' : 'Not enough history yet.'}
          </EmptyState>
        )}
        {hasMarketData ? <span data-testid={hasDataTestId} style={{ display: 'none' }} /> : null}
      </ChartShell>
      <TradeList data-testid={tradesTestId}>
        <TYPE.main fontSize={'0.95rem'}>Recent trades</TYPE.main>
        <TradeHeaderRow>
          <span>Action</span>
          <span style={{ textAlign: 'right' }}>{baseSymbol}</span>
          <span style={{ textAlign: 'right' }}>{quoteSymbol}</span>
          <span style={{ textAlign: 'right' }}>Time</span>
        </TradeHeaderRow>
        {activeTrades && activeTrades.length ? (
          activeTrades.map((trade) => {
            const baseAmount = `${formattedNum(trade.baseAmount)} ${baseSymbol}`
            const quoteAmount = `${formattedNum(trade.quoteAmount)} ${quoteSymbol}`
            return (
              <TradeRow key={`${trade.txHash}-${trade.timestamp}`} data-testid="recent-trade-row">
                <Badge $side={trade.side}>
                  {trade.sideLabel || (trade.side === 'sell' ? `SELL ${quoteSymbol}` : `BUY ${quoteSymbol}`)}
                </Badge>
                <TradeCell>{baseAmount}</TradeCell>
                <TradeCell>{quoteAmount}</TradeCell>
                <TradeCell>{formatTime(trade.timestamp)}</TradeCell>
              </TradeRow>
            )
          })
        ) : (
          <EmptyState data-testid={tradesEmptyTestId}>No trades yet.</EmptyState>
        )}
      </TradeList>
    </Panel>
  )
}
