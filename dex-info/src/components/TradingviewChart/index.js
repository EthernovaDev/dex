import React, { useEffect, useMemo, useRef, useCallback } from 'react'
import { createChart } from 'lightweight-charts'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { formattedNum } from '../../utils'
import styled from 'styled-components'
import { Play } from 'react-feather'
import { useDarkModeManager } from '../../contexts/LocalStorage'
import { IconWrapper } from '..'

dayjs.extend(utc)

export const CHART_TYPES = {
  BAR: 'BAR',
  AREA: 'AREA',
}

const Wrapper = styled.div`
  position: relative;
`

const HEIGHT = 300

const TradingViewChart = ({
  type = CHART_TYPES.BAR,
  data,
  base,
  baseChange,
  field,
  title,
  width,
  useWeekly = false,
}) => {
  const ref = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const tooltipRef = useRef(null)

  const [darkMode] = useDarkModeManager()
  const textColor = darkMode ? 'white' : 'black'

  const formattedData = useMemo(() => {
    return (
      data
        ?.map((entry) => {
          const value = parseFloat(entry?.[field])
          return {
            time: dayjs.unix(entry.date).utc().format('YYYY-MM-DD'),
            value,
          }
        })
        .filter((entry) => Number.isFinite(entry.value)) || []
    )
  }, [data, field])

  const destroyChart = useCallback(() => {
    if (chartRef.current?.remove) {
      chartRef.current.remove()
    }
    chartRef.current = null
    seriesRef.current = null
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
  }, [destroyChart, darkMode, type])

  useEffect(() => {
    if (!ref.current || chartRef.current) return
    ref.current.innerHTML = ''

    const chart = createChart(ref.current, {
      width,
      height: HEIGHT,
      layout: {
        backgroundColor: 'transparent',
        textColor,
      },
      rightPriceScale: {
        scaleMargins: {
          top: type === CHART_TYPES.AREA ? 0.32 : 0.2,
          bottom: 0,
        },
        borderVisible: false,
      },
      timeScale: {
        borderVisible: false,
      },
      grid: {
        horzLines: {
          color: 'rgba(197, 203, 206, 0.5)',
          visible: false,
        },
        vertLines: {
          color: 'rgba(197, 203, 206, 0.5)',
          visible: false,
        },
      },
      crosshair: {
        horzLine: {
          visible: false,
          labelVisible: false,
        },
        vertLine: {
          visible: true,
          style: 0,
          width: 2,
          color: 'rgba(32, 38, 46, 0.1)',
          labelVisible: false,
        },
      },
      localization: {
        priceFormatter: (val) => formattedNum(val, false),
      },
    })

    const series =
      type === CHART_TYPES.BAR
        ? chart.addHistogramSeries({
            color: '#ff007a',
            priceFormat: { type: 'volume' },
            scaleMargins: { top: 0.32, bottom: 0 },
            lineColor: '#ff007a',
            lineWidth: 3,
          })
        : chart.addAreaSeries({
            topColor: '#ff007a',
            bottomColor: 'rgba(255, 0, 122, 0)',
            lineColor: '#ff007a',
            lineWidth: 3,
          })

    series.setData(formattedData)

    const toolTip = document.createElement('div')
    toolTip.className = darkMode ? 'three-line-legend-dark' : 'three-line-legend'
    ref.current.appendChild(toolTip)
    tooltipRef.current = toolTip
    toolTip.style.display = 'block'
    toolTip.style.fontWeight = '500'
    toolTip.style.left = '-4px'
    toolTip.style.top = '-8px'
    toolTip.style.backgroundColor = 'transparent'

    chart.subscribeCrosshairMove((param) => {
      if (
        !param ||
        param.time === undefined ||
        param.point.x < 0 ||
        param.point.x > width ||
        param.point.y < 0 ||
        param.point.y > HEIGHT
      ) {
        updateTooltip(toolTip)
        return
      }
      const dateStr = useWeekly
        ? dayjs(param.time.year + '-' + param.time.month + '-' + param.time.day)
            .startOf('week')
            .format('MMMM D, YYYY') +
          '-' +
          dayjs(param.time.year + '-' + param.time.month + '-' + param.time.day)
            .endOf('week')
            .format('MMMM D, YYYY')
        : dayjs(param.time.year + '-' + param.time.month + '-' + param.time.day).format('MMMM D, YYYY')
      const price = param.seriesPrices.get(series)

      toolTip.innerHTML =
        `<div style="font-size: 16px; margin: 4px 0px; color: ${textColor};">${title}</div>` +
        `<div style="font-size: 22px; margin: 4px 0px; color: ${textColor}">` +
        formattedNum(price, false) +
        '</div>' +
        '<div>' +
        dateStr +
        '</div>'
    })

    chart.timeScale().fitContent()

    chartRef.current = chart
    seriesRef.current = series
    updateTooltip(toolTip)
  }, [darkMode, formattedData, title, type, useWeekly, width, textColor, destroyChart, base, baseChange])

  const updateTooltip = useCallback(
    (toolTipEl) => {
      const toolTip = toolTipEl || tooltipRef.current
      if (!toolTip) return
      const percentValue = Number.isFinite(Number(baseChange)) ? Number(baseChange) : null
      const percentChange = percentValue === null ? null : percentValue.toFixed(2)
      const formattedPercentChange =
        percentChange === null ? '—' : (percentChange > 0 ? '+' : '') + percentChange + '%'
      const color = percentValue === null ? textColor : percentValue >= 0 ? 'green' : 'red'

      toolTip.innerHTML =
        `<div style="font-size: 16px; margin: 4px 0px; color: ${textColor};">${title} ` +
        `${type === CHART_TYPES.BAR && !useWeekly ? '(24hr)' : ''}</div>` +
        `<div style="font-size: 22px; margin: 4px 0px; color:${textColor}">` +
        formattedNum(base ?? 0, false) +
        `<span style="margin-left: 10px; font-size: 16px; color: ${color};">${formattedPercentChange}</span>` +
        '</div>'
    },
    [base, baseChange, textColor, title, type, useWeekly]
  )

  useEffect(() => {
    if (seriesRef.current) {
      seriesRef.current.setData(formattedData)
    }
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent()
    }
  }, [formattedData])

  useEffect(() => {
    if (width && chartRef.current) {
      chartRef.current.resize(width, HEIGHT)
      chartRef.current.timeScale().scrollToPosition(0)
    }
  }, [width])

  useEffect(() => {
    updateTooltip()
  }, [updateTooltip])

  return (
    <Wrapper>
      <div ref={ref} />
      <IconWrapper>
        <Play
          onClick={() => {
            chartRef.current && chartRef.current.timeScale().fitContent()
          }}
        />
      </IconWrapper>
    </Wrapper>
  )
}

export default TradingViewChart
