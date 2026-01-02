import React, { useEffect, useMemo, useRef, useCallback } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
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
  const textColor = darkMode ? 'white' : 'black'

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
        vertLines: { color: 'rgba(148, 163, 184, 0.08)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.08)' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: 'rgba(148, 163, 184, 0.35)', width: 1 },
        horzLine: { color: 'rgba(148, 163, 184, 0.35)' },
      },
      rightPriceScale: {
        borderVisible: false,
        visible: true,
        scaleMargins: { top: type === 'histogram' ? 0.2 : 0.12, bottom: 0.08 },
      },
      timeScale: {
        borderVisible: false,
        rightOffset: 4,
        barSpacing: 6,
        fixLeftEdge: true,
        fixRightEdge: true,
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
    toolTip.style.backgroundColor = 'rgba(8, 12, 22, 0.75)'
    toolTip.style.border = '1px solid rgba(255, 255, 255, 0.12)'
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
      const timeLabel = param.time ? new Date(param.time * 1000).toLocaleString() : ''
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
