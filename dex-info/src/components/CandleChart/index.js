import React, { useEffect, useMemo, useRef, useCallback } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import dayjs from 'dayjs'
import { formattedNum } from '../../utils'
import styled from 'styled-components'
import { Play } from 'react-feather'
import { useDarkModeManager } from '../../contexts/LocalStorage'

const IconWrapper = styled.div`
  position: absolute;
  right: 10px;
  color: ${({ theme }) => theme.text1}
  border-radius: 3px;
  height: 16px;
  width: 16px;
  padding: 0px;
  bottom: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  :hover {
    cursor: pointer;
    opacity: 0.7;
  }
`

const CandleStickChart = ({
  data,
  width,
  height = 300,
  base,
  margin = true,
  valueFormatter = (val) => formattedNum(val, false),
  showVolume = true,
  markers = [],
}) => {
  const ref = useRef(null)
  const chartRef = useRef(null)
  const candleSeriesRef = useRef(null)
  const volumeSeriesRef = useRef(null)
  const tooltipRef = useRef(null)

  const [darkMode] = useDarkModeManager()
  const textColor = darkMode ? 'white' : 'black'

  const formattedData = useMemo(() => {
    return (
      data
        ?.map((entry) => ({
          time: parseFloat(entry.timestamp),
          open: parseFloat(entry.open),
          low: parseFloat(entry.low),
          close: parseFloat(entry.close),
          high: parseFloat(entry.high),
        }))
        .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.open))
        .sort((a, b) => a.time - b.time) || []
    )
  }, [data])

  const volumeData = useMemo(() => {
    if (!showVolume) return []
    return (
      data?.map((entry) => {
        const isUp = parseFloat(entry.close) >= parseFloat(entry.open)
        const rawVolume = entry.volume !== undefined && entry.volume !== null ? entry.volume.toString() : '0'
        return {
          time: parseFloat(entry.timestamp),
          value: Number.parseFloat(rawVolume),
          color: isUp ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
        }
      }) || []
    )
  }, [data, showVolume])

  const derivedData = useMemo(() => {
    if (!formattedData.length) return formattedData
    const baseValue = Number(base)
    if (!Number.isFinite(baseValue)) return formattedData
    const last = formattedData[formattedData.length - 1]
    if (!last || baseValue === last.close) return formattedData
    return [
      ...formattedData,
      {
        time: dayjs().unix(),
        open: parseFloat(last.close),
        close: baseValue,
        low: Math.min(baseValue, parseFloat(last.close)),
        high: Math.max(baseValue, parseFloat(last.close)),
      },
    ]
  }, [formattedData, base])

  const destroyChart = useCallback(() => {
    if (chartRef.current?.remove) {
      chartRef.current.remove()
    }
    chartRef.current = null
    candleSeriesRef.current = null
    volumeSeriesRef.current = null
    if (ref.current) {
      ref.current.innerHTML = ''
    }
    tooltipRef.current = null
  }, [])

  useEffect(() => {
    return () => destroyChart()
  }, [destroyChart])

  useEffect(() => {
    destroyChart()
  }, [destroyChart, darkMode])

  useEffect(() => {
    if (!ref.current || chartRef.current) return
    ref.current.innerHTML = ''
    const chart = createChart(ref.current, {
      width,
      height,
      layout: {
        backgroundColor: 'transparent',
        textColor,
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(148, 163, 184, 0.35)', width: 1 },
        horzLine: { color: 'rgba(148, 163, 184, 0.35)' },
      },
      rightPriceScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        visible: true,
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.08 },
      },
      timeScale: {
        borderColor: 'rgba(148, 163, 184, 0.3)',
        timeVisible: true,
        secondsVisible: false,
      },
      localization: { priceFormatter: (val) => valueFormatter(val) },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderDownColor: '#ef4444',
      borderUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      wickUpColor: '#22c55e',
    })

    candleSeries.setData(derivedData)
    candleSeries.setMarkers(markers || [])

    let volumeSeries
    if (showVolume && volumeData?.length) {
      volumeSeries = chart.addHistogramSeries({
        color: 'rgba(139, 92, 246, 0.45)',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.82, bottom: 0 },
      })
      volumeSeries.setData(volumeData)
    }

    const toolTip = document.createElement('div')
    toolTip.className = 'three-line-legend'
    ref.current.appendChild(toolTip)
    tooltipRef.current = toolTip
    toolTip.style.display = 'block'
    toolTip.style.left = (margin ? 116 : 10) + 'px'
    toolTip.style.top = '12px'
    toolTip.style.backgroundColor = 'transparent'

    const setLastBarText = () => {
      toolTip.innerHTML = base
        ? `<div style="font-size: 20px; margin: 4px 0px; color: ${textColor}">` +
          valueFormatter(base) +
          '</div>'
        : ''
    }
    setLastBarText()

    chart.subscribeCrosshairMove((param) => {
      if (
        !param ||
        param.time === undefined ||
        param.point.x < 0 ||
        param.point.x > width ||
        param.point.y < 0 ||
        param.point.y > height
      ) {
        setLastBarText()
      } else {
        const priceData = param.seriesPrices.get(candleSeries)
        const volumeDataPoint = volumeSeries ? param.seriesPrices.get(volumeSeries) : null
        const close = priceData?.close
        const open = priceData?.open
        const high = priceData?.high
        const low = priceData?.low
        const time = dayjs.unix(param.time).format('MM/DD h:mm A')
        toolTip.innerHTML =
          `<div style="font-size: 20px; margin: 4px 0px; color: ${textColor}">` +
          valueFormatter(close ?? 0) +
          `<span style="font-size: 12px; margin: 4px 6px; color: ${textColor}">` +
          time +
          ' UTC' +
          '</span>' +
          '</div>' +
          `<div style="font-size: 12px; color: ${textColor}">O: ${valueFormatter(
            open ?? 0
          )} H: ${valueFormatter(high ?? 0)} L: ${valueFormatter(low ?? 0)} C: ${valueFormatter(close ?? 0)}</div>` +
          (volumeDataPoint
            ? `<div style="font-size: 12px; color: ${textColor}">Vol: ${formattedNum(
                volumeDataPoint,
                false
              )}</div>`
            : '')
      }
    })

    chart.timeScale().fitContent()

    chartRef.current = chart
    candleSeriesRef.current = candleSeries
    volumeSeriesRef.current = volumeSeries
  }, [base, derivedData, destroyChart, height, margin, showVolume, textColor, valueFormatter, volumeData, width])

  useEffect(() => {
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData(derivedData)
      candleSeriesRef.current.setMarkers(markers || [])
    }
    if (volumeSeriesRef.current && showVolume) {
      volumeSeriesRef.current.setData(volumeData)
    }
  }, [derivedData, volumeData, showVolume, markers])

  useEffect(() => {
    if (width && chartRef.current) {
      chartRef.current.resize(width, height)
      chartRef.current.timeScale().scrollToPosition(0)
    }
  }, [width, height])

  return (
    <div>
      <div ref={ref} />
      <IconWrapper>
        <Play
          onClick={() => {
            chartRef.current && chartRef.current.timeScale().fitContent()
          }}
        />
      </IconWrapper>
    </div>
  )
}

export default CandleStickChart
