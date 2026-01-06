import React, { useEffect, useMemo, useRef, useCallback } from 'react'
import { createChart, CrosshairMode, LineStyle } from 'lightweight-charts'
import { formattedNum } from '../utils'
import { useDarkModeManager } from '../contexts/LocalStorage'

const DEFAULT_HEIGHT = 300

export default function SimpleSeriesChart({
  data,
  width,
  height = DEFAULT_HEIGHT,
  type = 'area', // 'area' | 'histogram'
  valueFormatter = (val) => formattedNum(val, false),
  color = 'rgba(139, 92, 246, 0.9)',
  fillTop = 'rgba(139, 92, 246, 0.35)',
  fillBottom = 'rgba(139, 92, 246, 0)',
}) {
  const ref = useRef(null)
  const chartRef = useRef(null)
  const seriesRef = useRef(null)
  const tooltipRef = useRef(null)
  const [darkMode] = useDarkModeManager()
  const textColor = darkMode ? 'rgba(235, 237, 245, 0.92)' : 'rgba(15, 23, 42, 0.9)'
  const gridColor = darkMode ? 'rgba(148, 163, 184, 0.06)' : 'rgba(15, 23, 42, 0.08)'
  const timeFormatter = useCallback((time) => {
    const ts = typeof time === 'number' ? time * 1000 : Date.parse(time)
    if (!Number.isFinite(ts)) return ''
    const date = new Date(ts)
    const now = Date.now()
    const diff = Math.abs(now - date.getTime())
    if (diff < 36 * 3600 * 1000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
    return date.toLocaleDateString([], { month: 'short', day: '2-digit' })
  }, [])

  const formattedData = useMemo(() => {
    return (
      data
        ?.map((entry) => ({
          time: Number(entry.time),
          value: Number(entry.value),
          color: entry.color,
        }))
        .filter((entry) => Number.isFinite(entry.time) && Number.isFinite(entry.value)) || []
    )
  }, [data])

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
      height,
      layout: {
        backgroundColor: 'transparent',
        textColor,
        fontFamily: 'Inter, system-ui, -apple-system, Segoe UI, sans-serif',
      },
      grid: {
        vertLines: { color: gridColor, style: LineStyle.Dotted },
        horzLines: { color: gridColor, style: LineStyle.Dotted },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(148, 163, 184, 0.3)', width: 1 },
        horzLine: { color: 'rgba(148, 163, 184, 0.3)' },
      },
      rightPriceScale: {
        borderVisible: false,
        visible: true,
        scaleMargins: { top: type === 'histogram' ? 0.25 : 0.18, bottom: 0.1 },
      },
      timeScale: {
        borderVisible: false,
        rightOffset: 4,
        barSpacing: type === 'histogram' ? 8 : 10,
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: timeFormatter,
      },
      localization: { priceFormatter: (val) => valueFormatter(val) },
    })

    const series =
      type === 'histogram'
        ? chart.addHistogramSeries({
            color,
            priceFormat: { type: 'volume' },
            priceScaleId: '',
            scaleMargins: { top: 0.82, bottom: 0 },
            baseLineVisible: true,
            baseLineColor: 'rgba(148, 163, 184, 0.35)',
          })
        : chart.addAreaSeries({
            topColor: fillTop,
            bottomColor: fillBottom,
            lineColor: color,
            lineWidth: 2,
          })

    series.setData(formattedData)

    const toolTip = document.createElement('div')
    toolTip.style.position = 'absolute'
    toolTip.style.pointerEvents = 'none'
    toolTip.style.display = 'block'
    toolTip.style.left = '12px'
    toolTip.style.top = '10px'
    toolTip.style.maxWidth = '260px'
    toolTip.style.width = 'auto'
    toolTip.style.whiteSpace = 'nowrap'
    toolTip.style.pointerEvents = 'none'
    toolTip.style.backgroundColor = 'rgba(10, 14, 24, 0.72)'
    toolTip.style.border = '1px solid rgba(255, 255, 255, 0.14)'
    toolTip.style.borderRadius = '10px'
    toolTip.style.padding = '6px 8px'
    toolTip.style.fontSize = '12px'
    toolTip.style.color = textColor
    ref.current.appendChild(toolTip)
    tooltipRef.current = toolTip

    chart.subscribeCrosshairMove((param) => {
      if (
        !param ||
        param.time === undefined ||
        param.point.x < 0 ||
        param.point.x > width ||
        param.point.y < 0 ||
        param.point.y > height
      ) {
        toolTip.innerHTML = valueFormatter(formattedData?.[formattedData.length - 1]?.value ?? 0)
        return
      }
      const val = param.seriesPrices.get(series)
      const timeLabel = param.time ? timeFormatter(param.time) : ''
      toolTip.innerHTML = `<div>${valueFormatter(val ?? 0)}</div>${timeLabel ? `<div style="opacity:0.65;font-size:11px;">${timeLabel}</div>` : ''}`
    })

    chart.timeScale().fitContent()

    chartRef.current = chart
    seriesRef.current = series
  }, [color, destroyChart, formattedData, height, textColor, type, valueFormatter, width, fillTop, fillBottom])

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
      chartRef.current.resize(width, height)
      chartRef.current.timeScale().scrollToPosition(0)
    }
  }, [width, height])

  return <div ref={ref} style={{ position: 'relative' }} />
}
