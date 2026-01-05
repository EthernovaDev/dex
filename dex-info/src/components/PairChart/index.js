import React, { useState, useRef, useEffect } from 'react'
import styled from 'styled-components'
import { Area, XAxis, YAxis, ResponsiveContainer, Tooltip, AreaChart, BarChart, Bar } from 'recharts'
import { RowBetween, AutoRow } from '../Row'

import { toK, toNiceDate, toNiceDateYear, formattedNum, formatPrice, getTimeframe } from '../../utils'
import BigNumber from 'bignumber.js'
import { OptionButton } from '../ButtonStyled'
import { darken } from 'polished'
import { usePairChartData, useHourlyRateData, usePairData } from '../../contexts/PairData'
import { timeframeOptions } from '../../constants'
import { useMedia } from 'react-use'
import { EmptyCard } from '..'
import DropdownSelect from '../DropdownSelect'
import SimpleSeriesChart from '../SimpleSeriesChart'
import LocalLoader from '../LocalLoader'
import { useDarkModeManager } from '../../contexts/LocalStorage'
import { WRAPPED_NATIVE_ADDRESS } from '../../constants/urls'

const ChartWrapper = styled.div`
  height: 100%;
  max-height: 340px;

  @media screen and (max-width: 600px) {
    min-height: 200px;
  }
`

const OptionsRow = styled.div`
  display: flex;
  flex-direction: row;
  width: 100%;
  margin-bottom: 20px;
`

const CHART_VIEW = {
  VOLUME: 'Volume',
  LIQUIDITY: 'Liquidity',
  RATE0: 'Rate 0',
  RATE1: 'Rate 1',
}

const PairChart = ({ address, color, base0, base1 }) => {
  const [chartFilter, setChartFilter] = useState(CHART_VIEW.LIQUIDITY)

  const [timeWindow, setTimeWindow] = useState(timeframeOptions.MONTH)

  const [darkMode] = useDarkModeManager()
  const textColor = darkMode ? 'white' : 'black'

  // update the width on a window resize
  const ref = useRef()
  const isClient = typeof window === 'object'
  const [width, setWidth] = useState(ref?.current?.clientWidth)
  const [height, setHeight] = useState(ref?.current?.clientHeight)
  useEffect(() => {
    if (!isClient) {
      return false
    }
    function handleResize() {
      setWidth(ref?.current?.clientWidth ?? width)
      setHeight(ref?.current?.clientHeight ?? height)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [height, isClient, width]) // Empty array ensures that effect is only run on mount and unmount

  // get data for pair, and rates
  const pairData = usePairData(address)
  let chartData = usePairChartData(address)
  const hourlyData = useHourlyRateData(address, timeWindow)
  const hourlyRate0 = hourlyData && hourlyData[0]
  const hourlyRate1 = hourlyData && hourlyData[1]

  // formatted symbols for overflow
  const symbol0 = pairData?.token0?.symbol ?? ''
  const symbol1 = pairData?.token1?.symbol ?? ''
  const formattedSymbol0 = symbol0 && symbol0.length > 6 ? symbol0.slice(0, 5) + '...' : symbol0
  const formattedSymbol1 = symbol1 && symbol1.length > 6 ? symbol1.slice(0, 5) + '...' : symbol1

  const below1600 = useMedia('(max-width: 1600px)')
  const below1080 = useMedia('(max-width: 1080px)')
  const below600 = useMedia('(max-width: 600px)')

  let utcStartTime = getTimeframe(timeWindow)
  chartData = chartData?.filter((entry) => entry.date >= utcStartTime)

  const token0Id = pairData?.token0?.id?.toLowerCase?.() || ''
  const token1Id = pairData?.token1?.id?.toLowerCase?.() || ''
  const isWnovaPair = token0Id === WRAPPED_NATIVE_ADDRESS || token1Id === WRAPPED_NATIVE_ADDRESS

  const chartDataMapped = React.useMemo(() => {
    if (!chartData) return chartData
    const reserve0 = new BigNumber(pairData?.reserve0 ?? 0)
    const reserve1 = new BigNumber(pairData?.reserve1 ?? 0)
    let liquidityWnova = new BigNumber(0)
    if (isWnovaPair) {
      if (token0Id === WRAPPED_NATIVE_ADDRESS) {
        liquidityWnova = reserve0
      } else if (token1Id === WRAPPED_NATIVE_ADDRESS) {
        liquidityWnova = reserve1
      }
    }

    return chartData.map((entry) => {
      const volume = isWnovaPair
        ? token0Id === WRAPPED_NATIVE_ADDRESS
          ? entry.dailyVolumeToken0
          : entry.dailyVolumeToken1
        : entry.dailyVolumeETH
      const reserveWnova = isWnovaPair && liquidityWnova.gt(0) ? parseFloat(liquidityWnova.toString()) : 0
      return {
        ...entry,
        dailyVolumeETH: volume ? parseFloat(volume) : 0,
        reserveWnova,
      }
    })
  }, [chartData, isWnovaPair, token0Id, pairData, token1Id])

  const rateSeries0 = React.useMemo(() => {
    if (!hourlyRate0 || !hourlyRate0.length) return []
    return hourlyRate0
      .map((entry) => ({
        time: Number(entry.timestamp),
        value: Number(entry.close ?? entry.open ?? 0),
      }))
      .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
  }, [hourlyRate0])

  const rateSeries1 = React.useMemo(() => {
    if (!hourlyRate1 || !hourlyRate1.length) return []
    return hourlyRate1
      .map((entry) => ({
        time: Number(entry.timestamp),
        value: Number(entry.close ?? entry.open ?? 0),
      }))
      .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value))
  }, [hourlyRate1])

  const chartWidth = width || 520
  const chartHeight = height || 320

  const reserve0Num = Number(pairData?.reserve0 ?? NaN)
  const reserve1Num = Number(pairData?.reserve1 ?? NaN)
  const reserveWnovaValue = isWnovaPair
    ? token0Id === WRAPPED_NATIVE_ADDRESS
      ? reserve0Num
      : reserve1Num
    : 0

  const chartDataWithFallback = React.useMemo(() => {
    if (chartDataMapped && chartDataMapped.length) return chartDataMapped
    if (Number.isFinite(reserveWnovaValue) && reserveWnovaValue > 0) {
      const now = Math.floor(Date.now() / 1000)
      return [
        { date: now - 86400, reserveWnova: reserveWnovaValue, dailyVolumeETH: 0 },
        { date: now, reserveWnova: reserveWnovaValue, dailyVolumeETH: 0 },
      ]
    }
    return chartDataMapped
  }, [chartDataMapped, reserveWnovaValue])

  if (!chartDataMapped) {
    return (
      <ChartWrapper>
        <LocalLoader />
      </ChartWrapper>
    )
  }

  if (chartDataMapped && chartDataMapped.length === 0 && (!chartDataWithFallback || !chartDataWithFallback.length)) {
    return (
      <ChartWrapper>
        <EmptyCard height="140px">No activity yet.</EmptyCard>
      </ChartWrapper>
    )
  }

  const aspect = below1080 ? 60 / 20 : below1600 ? 60 / 28 : 60 / 22

  return (
    <ChartWrapper>
      {below600 ? (
        <RowBetween mb={40}>
          <DropdownSelect options={CHART_VIEW} active={chartFilter} setActive={setChartFilter} color={color} />
          <DropdownSelect options={timeframeOptions} active={timeWindow} setActive={setTimeWindow} color={color} />
        </RowBetween>
      ) : (
        <OptionsRow>
          <AutoRow gap="6px" style={{ flexWrap: 'nowrap' }}>
            <OptionButton
              active={chartFilter === CHART_VIEW.LIQUIDITY}
              onClick={() => {
                setTimeWindow(timeframeOptions.ALL_TIME)
                setChartFilter(CHART_VIEW.LIQUIDITY)
              }}
            >
              Liquidity
            </OptionButton>
            <OptionButton
              active={chartFilter === CHART_VIEW.VOLUME}
              onClick={() => {
                setTimeWindow(timeframeOptions.ALL_TIME)
                setChartFilter(CHART_VIEW.VOLUME)
              }}
            >
              Volume
            </OptionButton>
            <OptionButton
              active={chartFilter === CHART_VIEW.RATE0}
              onClick={() => {
                setTimeWindow(timeframeOptions.WEEK)
                setChartFilter(CHART_VIEW.RATE0)
              }}
            >
              {pairData?.token0 ? formattedSymbol1 + '/' + formattedSymbol0 : '-'}
            </OptionButton>
            <OptionButton
              active={chartFilter === CHART_VIEW.RATE1}
              onClick={() => {
                setTimeWindow(timeframeOptions.WEEK)
                setChartFilter(CHART_VIEW.RATE1)
              }}
            >
              {pairData?.token0 ? formattedSymbol0 + '/' + formattedSymbol1 : '-'}
            </OptionButton>
          </AutoRow>
          <AutoRow justify="flex-end" gap="6px">
            <OptionButton
              active={timeWindow === timeframeOptions.WEEK}
              onClick={() => setTimeWindow(timeframeOptions.WEEK)}
            >
              1W
            </OptionButton>
            <OptionButton
              active={timeWindow === timeframeOptions.MONTH}
              onClick={() => setTimeWindow(timeframeOptions.MONTH)}
            >
              1M
            </OptionButton>
            <OptionButton
              active={timeWindow === timeframeOptions.ALL_TIME}
              onClick={() => setTimeWindow(timeframeOptions.ALL_TIME)}
            >
              All
            </OptionButton>
          </AutoRow>
        </OptionsRow>
      )}
      {chartFilter === CHART_VIEW.LIQUIDITY && (
        <ResponsiveContainer aspect={aspect}>
          <AreaChart margin={{ top: 0, right: 10, bottom: 6, left: 0 }} barCategoryGap={1} data={chartDataWithFallback}>
            <defs>
              <linearGradient id="colorUv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={color} stopOpacity={0.35} />
                <stop offset="95%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              tickLine={false}
              axisLine={false}
              interval="preserveEnd"
              tickMargin={14}
              minTickGap={80}
              tickFormatter={(tick) => toNiceDate(tick)}
              dataKey="date"
              tick={{ fill: textColor }}
              type={'number'}
              domain={['dataMin', 'dataMax']}
            />
            <YAxis
              type="number"
              orientation="right"
              tickFormatter={(tick) => toK(tick)}
              axisLine={false}
              tickLine={false}
              interval="preserveEnd"
              minTickGap={80}
              yAxisId={0}
              tickMargin={16}
              tick={{ fill: textColor }}
            />
            <Tooltip
              cursor={true}
              formatter={(val) => formattedNum(val, false)}
              labelFormatter={(label) => toNiceDateYear(label)}
              labelStyle={{ paddingTop: 4 }}
              contentStyle={{
                padding: '10px 14px',
                borderRadius: 10,
                borderColor: color,
                color: 'black',
              }}
              wrapperStyle={{ top: -70, left: -10 }}
            />
            <Area
              strokeWidth={2}
              dot={false}
              type="monotone"
              name={isWnovaPair ? 'Liquidity (WNOVA)' : 'Liquidity'}
              dataKey={isWnovaPair ? 'reserveWnova' : 'reserveUSD'}
              yAxisId={0}
              stroke={darken(0.12, color)}
              fill="url(#colorUv)"
            />
          </AreaChart>
        </ResponsiveContainer>
      )}

      {chartFilter === CHART_VIEW.RATE1 &&
        (rateSeries1.length ? (
          <div ref={ref}>
            <SimpleSeriesChart
              data={rateSeries1}
              width={chartWidth}
              height={chartHeight}
              type="area"
              valueFormatter={(val) => formatPrice(val)}
            />
          </div>
        ) : (
          <LocalLoader />
        ))}

      {chartFilter === CHART_VIEW.RATE0 &&
        (rateSeries0.length ? (
          <div ref={ref}>
            <SimpleSeriesChart
              data={rateSeries0}
              width={chartWidth}
              height={chartHeight}
              type="area"
              valueFormatter={(val) => formatPrice(val)}
            />
          </div>
        ) : (
          <LocalLoader />
        ))}

      {chartFilter === CHART_VIEW.VOLUME && (
        <ResponsiveContainer aspect={aspect}>
          <BarChart
            margin={{ top: 0, right: 0, bottom: 6, left: below1080 ? 0 : 10 }}
            barCategoryGap={1}
            data={chartDataWithFallback}
          >
            <XAxis
              tickLine={false}
              axisLine={false}
              interval="preserveEnd"
              minTickGap={80}
              tickMargin={14}
              tickFormatter={(tick) => toNiceDate(tick)}
              dataKey="date"
              tick={{ fill: textColor }}
              type={'number'}
              domain={['dataMin', 'dataMax']}
            />
            <YAxis
              type="number"
              axisLine={false}
              tickMargin={16}
              tickFormatter={(tick) => toK(tick)}
              tickLine={false}
              interval="preserveEnd"
              orientation="right"
              minTickGap={80}
              yAxisId={0}
              tick={{ fill: textColor }}
            />
            <Tooltip
              cursor={{ fill: color, opacity: 0.1 }}
              formatter={(val) => formattedNum(val, false)}
              labelFormatter={(label) => toNiceDateYear(label)}
              labelStyle={{ paddingTop: 4 }}
              contentStyle={{
                padding: '10px 14px',
                borderRadius: 10,
                borderColor: color,
                color: 'black',
              }}
              wrapperStyle={{ top: -70, left: -10 }}
            />
            <Bar
              type="monotone"
              name={isWnovaPair ? 'Volume (WNOVA)' : 'Volume'}
              dataKey={isWnovaPair ? 'dailyVolumeETH' : 'dailyVolumeUSD'}
              fill={color}
              opacity={'0.4'}
              yAxisId={0}
              stroke={color}
            />
          </BarChart>
        </ResponsiveContainer>
      )}
    </ChartWrapper>
  )
}

export default PairChart
