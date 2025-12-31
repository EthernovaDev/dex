import React, { useState, useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'
import dayjs from 'dayjs'
import { formattedNum } from '../../utils'
import { usePrevious } from 'react-use'
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
  // reference for DOM element to create with chart
  const ref = useRef()
  const tooltipRef = useRef(null)

  const formattedData = data?.map((entry) => {
    return {
      time: parseFloat(entry.timestamp),
      open: parseFloat(entry.open),
      low: parseFloat(entry.low),
      close: parseFloat(entry.close),
      high: parseFloat(entry.high),
    }
  })

  const volumeData = showVolume
    ? data?.map((entry) => {
        const isUp = parseFloat(entry.close) >= parseFloat(entry.open)
        const rawVolume = entry.volume !== undefined && entry.volume !== null ? entry.volume.toString() : '0'
        return {
          time: parseFloat(entry.timestamp),
          value: Number.parseFloat(rawVolume),
          color: isUp ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
        }
      })
    : []

  if (formattedData && formattedData.length > 0 && Number.isFinite(Number(base))) {
    formattedData.push({
      time: dayjs().unix(),
      open: parseFloat(formattedData[formattedData.length - 1].close),
      close: parseFloat(base),
      low: Math.min(parseFloat(base), parseFloat(formattedData[formattedData.length - 1].close)),
      high: Math.max(parseFloat(base), parseFloat(formattedData[formattedData.length - 1].close)),
    })
  }

  // pointer to the chart object
  const [chartCreated, setChartCreated] = useState(null)
  const dataPrev = usePrevious(data)

  const [darkMode] = useDarkModeManager()
  const textColor = darkMode ? 'white' : 'black'
  const previousTheme = usePrevious(darkMode)

  // reset the chart if theme switches
  useEffect(() => {
    if (chartCreated && previousTheme !== darkMode) {
      const node = ref.current
      if (tooltipRef.current && node) {
        node.removeChild(tooltipRef.current)
        tooltipRef.current = null
      }
      if (node) node.innerHTML = ''
      if (chartCreated?.remove) chartCreated.remove()
      setChartCreated(null)
    }
  }, [chartCreated, darkMode, previousTheme])

  useEffect(() => {
    if (data !== dataPrev && chartCreated) {
      const node = ref.current
      if (tooltipRef.current && node) {
        node.removeChild(tooltipRef.current)
        tooltipRef.current = null
      }
      if (node) node.innerHTML = ''
      if (chartCreated?.remove) chartCreated.remove()
      setChartCreated(null)
    }
  }, [chartCreated, data, dataPrev])

  // if no chart created yet, create one with options and add to DOM manually
  useEffect(() => {
    if (!chartCreated && ref.current) {
      ref.current.innerHTML = ''
      const chart = createChart(ref.current, {
        width: width,
        height: height,
        layout: {
          backgroundColor: 'transparent',
          textColor: textColor,
        },
        grid: {
          vertLines: {
            color: 'rgba(197, 203, 206, 0.5)',
          },
          horzLines: {
            color: 'rgba(197, 203, 206, 0.5)',
          },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
        },
        rightPriceScale: {
          borderColor: 'rgba(197, 203, 206, 0.8)',
          visible: true,
        },
        timeScale: {
          borderColor: 'rgba(197, 203, 206, 0.8)',
        },
        localization: {
          priceFormatter: (val) => formattedNum(val),
        },
      })

      var candleSeries = chart.addCandlestickSeries({
        upColor: 'green',
        downColor: 'red',
        borderDownColor: 'red',
        borderUpColor: 'green',
        wickDownColor: 'red',
        wickUpColor: 'green',
      })

      candleSeries.setData(formattedData)

      let volumeSeries
      if (showVolume && volumeData?.length) {
        volumeSeries = chart.addHistogramSeries({
          color: 'rgba(139, 92, 246, 0.4)',
          priceFormat: { type: 'volume' },
          priceScaleId: '',
          scaleMargins: {
            top: 0.8,
            bottom: 0,
          },
        })
        volumeSeries.setData(volumeData)
      }

      var toolTip = document.createElement('div')
      toolTip.className = 'three-line-legend'
      ref.current.appendChild(toolTip)
      tooltipRef.current = toolTip
      toolTip.style.display = 'block'
      toolTip.style.left = (margin ? 116 : 10) + 'px'
      toolTip.style.top = 50 + 'px'
      toolTip.style.backgroundColor = 'transparent'

      // get the title of the chart
      function setLastBarText() {
        toolTip.innerHTML = base
          ? `<div style="font-size: 22px; margin: 4px 0px; color: ${textColor}">` + valueFormatter(base) + '</div>'
          : ''
      }
      setLastBarText()

      // update the title when hovering on the chart
      chart.subscribeCrosshairMove(function (param) {
        if (
          param === undefined ||
          param.time === undefined ||
          param.point.x < 0 ||
          param.point.x > width ||
          param.point.y < 0 ||
          param.point.y > height
        ) {
          setLastBarText()
        } else {
          var price = param.seriesPrices.get(candleSeries).close
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

      setChartCreated(chart)
    }
  }, [chartCreated, formattedData, volumeData, width, height, valueFormatter, base, margin, textColor, showVolume])

  // responsiveness
  useEffect(() => {
    if (width) {
      chartCreated && chartCreated.resize(width, height)
      chartCreated && chartCreated.timeScale().scrollToPosition(0)
    }
  }, [chartCreated, height, width])

  useEffect(() => {
    return () => {
      if (chartCreated?.remove) chartCreated.remove()
      if (ref.current) ref.current.innerHTML = ''
      tooltipRef.current = null
    }
  }, [chartCreated])

  return (
    <div>
      <div ref={ref} />
      <IconWrapper>
        <Play
          onClick={() => {
            chartCreated && chartCreated.timeScale().fitContent()
          }}
        />
      </IconWrapper>
    </div>
  )
}

export default CandleStickChart
