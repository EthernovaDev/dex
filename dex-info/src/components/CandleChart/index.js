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
  valueFormatter = (val) => formattedNum(val, true),
  showVolume = true,
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
      data?.map((entry) => ({
        time: parseFloat(entry.timestamp),
        open: parseFloat(entry.open),
        low: parseFloat(entry.low),
        close: parseFloat(entry.close),
        high: parseFloat(entry.high),
      })) || []
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
    if (!formattedData.length || !Number.isFinite(Number(base))) return formattedData
    const last = formattedData[formattedData.length - 1]
    return [
      ...formattedData,
      {
        time: dayjs().unix(),
        open: parseFloat(last.close),
        close: parseFloat(base),
        low: Math.min(parseFloat(base), parseFloat(last.close)),
        high: Math.max(parseFloat(base), parseFloat(last.close)),
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
        vertLines: { color: 'rgba(197, 203, 206, 0.5)' },
        horzLines: { color: 'rgba(197, 203, 206, 0.5)' },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: {
        borderColor: 'rgba(197, 203, 206, 0.8)',
        visible: true,
      },
      timeScale: { borderColor: 'rgba(197, 203, 206, 0.8)' },
      localization: { priceFormatter: (val) => formattedNum(val) },
    })

    const candleSeries = chart.addCandlestickSeries({
      upColor: 'green',
      downColor: 'red',
      borderDownColor: 'red',
      borderUpColor: 'green',
      wickDownColor: 'red',
      wickUpColor: 'green',
    })

    candleSeries.setData(derivedData)

    let volumeSeries
    if (showVolume && volumeData?.length) {
      volumeSeries = chart.addHistogramSeries({
        color: 'rgba(139, 92, 246, 0.4)',
        priceFormat: { type: 'volume' },
        priceScaleId: '',
        scaleMargins: { top: 0.8, bottom: 0 },
      })
      volumeSeries.setData(volumeData)
    }

    const toolTip = document.createElement('div')
    toolTip.className = 'three-line-legend'
    ref.current.appendChild(toolTip)
    tooltipRef.current = toolTip
    toolTip.style.display = 'block'
    toolTip.style.left = (margin ? 116 : 10) + 'px'
    toolTip.style.top = '50px'
    toolTip.style.backgroundColor = 'transparent'

    const setLastBarText = () => {
      toolTip.innerHTML = base
        ? `<div style="font-size: 22px; margin: 4px 0px; color: ${textColor}">` +
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
        const price = param.seriesPrices.get(candleSeries).close
        const time = dayjs.unix(param.time).format('MM/DD h:mm A')
        toolTip.innerHTML =
          `<div style="font-size: 22px; margin: 4px 0px; color: ${textColor}">` +
          valueFormatter(price) +
          `<span style="font-size: 12px; margin: 4px 6px; color: ${textColor}">` +
          time +
          ' UTC' +
          '</span>' +
          '</div>'
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
    }
    if (volumeSeriesRef.current && showVolume) {
      volumeSeriesRef.current.setData(volumeData)
    }
  }, [derivedData, volumeData, showVolume])

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
