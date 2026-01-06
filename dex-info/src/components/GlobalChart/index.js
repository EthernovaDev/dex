import React, { useState, useMemo, useEffect, useRef } from 'react'
import styled from 'styled-components'
import { ResponsiveContainer } from 'recharts'
import { timeframeOptions } from '../../constants'
import { useGlobalChartData } from '../../contexts/GlobalData'
import { useMedia } from 'react-use'
import DropdownSelect from '../DropdownSelect'
import TradingViewChart, { CHART_TYPES } from '../TradingviewChart'
import { OptionButton } from '../ButtonStyled'
import { formattedNum, getTimeframe } from '../../utils'
import { TYPE } from '../../Theme'

const CHART_VIEW = {
  VOLUME: 'Volume',
  LIQUIDITY: 'Liquidity',
}

const VOLUME_WINDOW = {
  WEEKLY: 'WEEKLY',
  DAYS: 'DAYS',
}
const ChartShell = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
`

const ChartHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  min-height: 52px;
`

const ChartMeta = styled.div`
  display: grid;
  gap: 6px;
`

const ChartTitle = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
`

const ChartValue = styled.div`
  font-size: 20px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.95);
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-variant-numeric: tabular-nums;
`

const ChartChange = styled.span`
  font-size: 12px;
  color: ${({ $positive }) => ($positive ? '#22c55e' : '#ef4444')};
`

const ChartControls = styled.div`
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
`

const ChartBody = styled.div`
  height: 260px;
  min-height: 260px;
  position: relative;
  overflow: hidden;
`

const EmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.65);
`

const GlobalChart = ({ display }) => {
  // chart options
  const [chartView, setChartView] = useState(display === 'volume' ? CHART_VIEW.VOLUME : CHART_VIEW.LIQUIDITY)

  // time window and window size for chart
  const timeWindow = timeframeOptions.ALL_TIME
  const [volumeWindow, setVolumeWindow] = useState(VOLUME_WINDOW.DAYS)

  // global historical data
  const [dailyData, weeklyData] = useGlobalChartData()
  const deriveBase = (dataSet, field) => {
    if (!dataSet || !dataSet.length) return { base: 0, change: null }
    const last = dataSet[dataSet.length - 1]
    const prev = dataSet.length > 1 ? dataSet[dataSet.length - 2] : null
    const base = Number(last?.[field] || 0)
    if (!prev) return { base, change: null }
    const prevValue = Number(prev?.[field] || 0)
    if (!Number.isFinite(prevValue) || prevValue <= 0) return { base, change: null }
    return { base, change: ((base - prevValue) / prevValue) * 100 }
  }

  // based on window, get starttim
  let utcStartTime = getTimeframe(timeWindow)

  const chartDataFiltered = useMemo(() => {
    let currentData = volumeWindow === VOLUME_WINDOW.DAYS ? dailyData : weeklyData
    return (
      currentData &&
      Object.keys(currentData)
        ?.map((key) => {
          let item = currentData[key]
          if (item.date > utcStartTime) {
            return item
          } else {
            return true
          }
        })
        .filter((item) => {
          return !!item
        })
    )
  }, [dailyData, utcStartTime, volumeWindow, weeklyData])
  const below800 = useMedia('(max-width: 800px)')

  // update the width on a window resize
  const ref = useRef()
  const isClient = typeof window === 'object'
  const [width, setWidth] = useState(560)
  useEffect(() => {
    if (!isClient) {
      return false
    }
    function handleResize() {
      setWidth(ref?.current?.clientWidth ?? width)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [isClient, width]) // Empty array ensures that effect is only run on mount and unmount

  const hasHistory = chartDataFiltered && chartDataFiltered.length > 1
  return chartDataFiltered ? (
    <>
      {below800 && (
        <DropdownSelect options={CHART_VIEW} active={chartView} setActive={setChartView} color={'#ff007a'} />
      )}

      <ChartShell>
        {chartDataFiltered && chartView === CHART_VIEW.LIQUIDITY && (() => {
          const { base, change } = deriveBase(chartDataFiltered, 'totalLiquidityETH')
          const changeValue = Number.isFinite(change) ? change.toFixed(2) : null
          return (
            <>
              <ChartHeader>
                <ChartMeta>
                  <ChartTitle>Liquidity (WNOVA)</ChartTitle>
                  <ChartValue>
                    {Number.isFinite(base) ? formattedNum(base, false) : '—'}
                    {changeValue ? (
                      <ChartChange $positive={Number(changeValue) >= 0}>
                        {Number(changeValue) >= 0 ? '+' : ''}
                        {changeValue}%
                      </ChartChange>
                    ) : (
                      <ChartChange $positive={true}>—</ChartChange>
                    )}
                  </ChartValue>
                </ChartMeta>
              </ChartHeader>
              <ChartBody ref={ref}>
                {hasHistory ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <TradingViewChart
                      data={dailyData}
                      base={base}
                      baseChange={change}
                      title="Liquidity (WNOVA)"
                      field="totalLiquidityETH"
                      width={width}
                      type={CHART_TYPES.AREA}
                      showOverlay={false}
                    />
                  </ResponsiveContainer>
                ) : (
                  <EmptyState>Not enough history yet.</EmptyState>
                )}
              </ChartBody>
            </>
          )
        })()}
        {chartDataFiltered && chartView === CHART_VIEW.VOLUME && (() => {
          const field = volumeWindow === VOLUME_WINDOW.WEEKLY ? 'weeklyVolumeETH' : 'dailyVolumeETH'
          const { base, change } = deriveBase(chartDataFiltered, field)
          const changeValue = Number.isFinite(change) ? change.toFixed(2) : null
          return (
            <>
              <ChartHeader>
                <ChartMeta>
                  <ChartTitle>{volumeWindow === VOLUME_WINDOW.WEEKLY ? 'Volume (7d, WNOVA)' : 'Volume (WNOVA)'}</ChartTitle>
                  <ChartValue>
                    {Number.isFinite(base) ? formattedNum(base, false) : '—'}
                    {changeValue ? (
                      <ChartChange $positive={Number(changeValue) >= 0}>
                        {Number(changeValue) >= 0 ? '+' : ''}
                        {changeValue}%
                      </ChartChange>
                    ) : (
                      <ChartChange $positive={true}>—</ChartChange>
                    )}
                  </ChartValue>
                </ChartMeta>
                {display === 'volume' && (
                  <ChartControls>
                    <OptionButton
                      active={volumeWindow === VOLUME_WINDOW.DAYS}
                      onClick={() => setVolumeWindow(VOLUME_WINDOW.DAYS)}
                    >
                      <TYPE.body>D</TYPE.body>
                    </OptionButton>
                    <OptionButton
                      active={volumeWindow === VOLUME_WINDOW.WEEKLY}
                      onClick={() => setVolumeWindow(VOLUME_WINDOW.WEEKLY)}
                    >
                      <TYPE.body>W</TYPE.body>
                    </OptionButton>
                  </ChartControls>
                )}
              </ChartHeader>
              <ChartBody ref={ref}>
                {hasHistory ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <TradingViewChart
                      data={chartDataFiltered}
                      base={base}
                      baseChange={change}
                      title={volumeWindow === VOLUME_WINDOW.WEEKLY ? 'Volume (7d, WNOVA)' : 'Volume (WNOVA)'}
                      field={field}
                      width={width}
                      type={CHART_TYPES.AREA}
                      useWeekly={volumeWindow === VOLUME_WINDOW.WEEKLY}
                      showOverlay={false}
                    />
                  </ResponsiveContainer>
                ) : (
                  <EmptyState>Not enough history yet.</EmptyState>
                )}
              </ChartBody>
            </>
          )
        })()}
      </ChartShell>
    </>
  ) : (
    ''
  )
}

export default GlobalChart
