import React from 'react'
import { BigNumber } from 'bignumber.js'
import dayjs from 'dayjs'
import { ethers } from 'ethers'
import utc from 'dayjs/plugin/utc'
import { client, blockClient } from '../apollo/client'
import { DEX_URL, EXPLORER_URL, WRAPPED_NATIVE_ADDRESS } from '../constants/urls'
import { GET_BLOCK, GET_BLOCKS, SHARE_VALUE } from '../apollo/queries'
import { Text } from 'rebass'
import _Decimal from 'decimal.js-light'
import toFormat from 'toformat'
import { timeframeOptions } from '../constants'
import Numeral from 'numeral'

// format libraries
const Decimal = toFormat(_Decimal)
BigNumber.set({ EXPONENTIAL_AT: 50 })
dayjs.extend(utc)

export function getTimeframe(timeWindow) {
  const utcEndTime = dayjs.utc()
  // based on window, get starttime
  let utcStartTime
  switch (timeWindow) {
    case timeframeOptions.WEEK:
      utcStartTime = utcEndTime.subtract(1, 'week').endOf('day').unix() - 1
      break
    case timeframeOptions.MONTH:
      utcStartTime = utcEndTime.subtract(1, 'month').endOf('day').unix() - 1
      break
    case timeframeOptions.ALL_TIME:
      utcStartTime = utcEndTime.subtract(1, 'year').endOf('day').unix() - 1
      break
    default:
      utcStartTime = utcEndTime.subtract(1, 'year').startOf('year').unix() - 1
      break
  }
  return utcStartTime
}

const wrappedNative = WRAPPED_NATIVE_ADDRESS || ''
const dexBase = `${DEX_URL.replace(/\/+$/, '')}/#/`

export function getPoolLink(token0Address, token1Address = null, remove = false) {
  const token0 = token0Address?.toLowerCase() === wrappedNative ? wrappedNative : token0Address
  if (!token1Address) {
    return `${dexBase}${remove ? 'remove' : 'add'}/${token0}/${wrappedNative}`
  }
  const token1 = token1Address?.toLowerCase() === wrappedNative ? wrappedNative : token1Address
  return `${dexBase}${remove ? 'remove' : 'add'}/${token0}/${token1}`
}

export function getSwapLink(token0Address, token1Address = null) {
  const token0 = token0Address?.toLowerCase() === wrappedNative ? wrappedNative : token0Address
  if (!token1Address) {
    return `${dexBase}swap?inputCurrency=${token0}`
  }
  const token1 = token1Address?.toLowerCase() === wrappedNative ? wrappedNative : token1Address
  return `${dexBase}swap?inputCurrency=${token0}&outputCurrency=${token1}`
}

export function getMiningPoolLink(token0Address) {
  const token0 = token0Address?.toLowerCase() === wrappedNative ? wrappedNative : token0Address
  return `${dexBase}uni/${wrappedNative}/${token0}`
}

export function getUniswapAppLink(linkVariable) {
  const base = `${DEX_URL.replace(/\/+$/, '')}/#/uni`
  if (!linkVariable) return base
  return `${base}/${wrappedNative}/${linkVariable}`
}

export function localNumber(val) {
  return Numeral(val).format('0,0')
}

export function getReserveWnova(pair, wnovaAddress = WRAPPED_NATIVE_ADDRESS) {
  const wnovaLower = wnovaAddress?.toLowerCase?.()
  const token0Id = pair?.token0?.id?.toLowerCase?.()
  const token1Id = pair?.token1?.id?.toLowerCase?.()
  if (!wnovaLower || !token0Id || !token1Id) return null
  if (token0Id === wnovaLower) return Number(pair?.reserve0 || 0)
  if (token1Id === wnovaLower) return Number(pair?.reserve1 || 0)
  return null
}

export function getLiquidityWnova(pair, wnovaAddress = WRAPPED_NATIVE_ADDRESS) {
  const reserveWnova = getReserveWnova(pair, wnovaAddress)
  if (!Number.isFinite(reserveWnova) || reserveWnova <= 0) return null
  return reserveWnova
}

export const toNiceDate = (date) => {
  let x = dayjs.utc(dayjs.unix(date)).format('MMM DD')
  return x
}

// shorten the checksummed version of the input address to have 0x + 4 characters at start and end
export function shortenAddress(address, chars = 4) {
  const parsed = isAddress(address)
  if (!parsed) {
    throw Error(`Invalid 'address' parameter '${address}'.`)
  }
  return `${parsed.substring(0, chars + 2)}...${parsed.substring(42 - chars)}`
}

export const toWeeklyDate = (date) => {
  const formatted = dayjs.utc(dayjs.unix(date))
  date = new Date(formatted)
  const day = new Date(formatted).getDay()
  var lessDays = day === 6 ? 0 : day + 1
  var wkStart = new Date(new Date(date).setDate(date.getDate() - lessDays))
  var wkEnd = new Date(new Date(wkStart).setDate(wkStart.getDate() + 6))
  return dayjs.utc(wkStart).format('MMM DD') + ' - ' + dayjs.utc(wkEnd).format('MMM DD')
}

export function getTimestampsForChanges() {
  const utcCurrentTime = dayjs()
  const t1 = utcCurrentTime.subtract(1, 'day').startOf('minute').unix()
  const t2 = utcCurrentTime.subtract(2, 'day').startOf('minute').unix()
  const tWeek = utcCurrentTime.subtract(1, 'week').startOf('minute').unix()
  return [t1, t2, tWeek]
}

export async function splitQuery(query, localClient, vars, list, skipCount = 100) {
  let fetchedData = {}
  let allFound = false
  let skip = 0

  while (!allFound) {
    let end = list.length
    if (skip + skipCount < list.length) {
      end = skip + skipCount
    }
    let sliced = list.slice(skip, end)
    let result = await localClient.query({
      query: query(...vars, sliced),
      fetchPolicy: 'cache-first',
    })
    fetchedData = {
      ...fetchedData,
      ...result.data,
    }
    if (Object.keys(result.data).length < skipCount || skip + skipCount > list.length) {
      allFound = true
    } else {
      skip += skipCount
    }
  }

  return fetchedData
}

/**
 * @notice Fetches first block after a given timestamp
 * @dev Query speed is optimized by limiting to a 600-second period
 * @param {Int} timestamp in seconds
 */
export async function getBlockFromTimestamp(timestamp) {
  let result = await blockClient.query({
    query: GET_BLOCK,
    variables: {
      timestampFrom: timestamp,
      timestampTo: timestamp + 600,
    },
    fetchPolicy: 'cache-first',
  })
  return result?.data?.blocks?.[0]?.number
}

/**
 * @notice Fetches block objects for an array of timestamps.
 * @dev blocks are returned in chronological order (ASC) regardless of input.
 * @dev blocks are returned at string representations of Int
 * @dev timestamps are returns as they were provided; not the block time.
 * @param {Array} timestamps
 */
export async function getBlocksFromTimestamps(timestamps, skipCount = 500) {
  if (timestamps?.length === 0) {
    return []
  }

  let fetchedData = await splitQuery(GET_BLOCKS, blockClient, [], timestamps, skipCount)

  let blocks = []
  if (fetchedData) {
    for (var t in fetchedData) {
      if (fetchedData[t].length > 0) {
        blocks.push({
          timestamp: t.split('t')[1],
          number: fetchedData[t][0]['number'],
        })
      }
    }
  }
  return blocks
}

// export async function getLiquidityTokenBalanceOvertime(account, timestamps) {
//   // get blocks based on timestamps
//   const blocks = await getBlocksFromTimestamps(timestamps)

//   // get historical share values with time travel queries
//   let result = await client.query({
//     query: SHARE_VALUE(account, blocks),
//     fetchPolicy: 'cache-first',
//   })

//   let values = []
//   for (var row in result?.data) {
//     let timestamp = row.split('t')[1]
//     if (timestamp) {
//       values.push({
//         timestamp,
//         balance: 0,
//       })
//     }
//   }
// }

/**
 * @notice Example query using time travel queries
 * @dev TODO - handle scenario where blocks are not available for a timestamps (e.g. current time)
 * @param {String} pairAddress
 * @param {Array} timestamps
 */
export async function getShareValueOverTime(pairAddress, timestamps) {
  if (!timestamps) {
    const utcCurrentTime = dayjs()
    const utcSevenDaysBack = utcCurrentTime.subtract(8, 'day').unix()
    timestamps = getTimestampRange(utcSevenDaysBack, 86400, 7)
  }

  // get blocks based on timestamps
  const blocks = await getBlocksFromTimestamps(timestamps)

  // get historical share values with time travel queries
  let result = await client.query({
    query: SHARE_VALUE(pairAddress, blocks),
    fetchPolicy: 'cache-first',
  })

  let values = []
  for (var row in result?.data) {
    let timestamp = row.split('t')[1]
    const reserveWnova = parseFloat(result.data[row]?.reserveETH ?? result.data[row]?.reserveUSD ?? 0)
    let sharePriceUsd = reserveWnova / parseFloat(result.data[row]?.totalSupply)
    if (timestamp) {
      values.push({
        timestamp,
        sharePriceUsd,
        sharePriceWnova: sharePriceUsd,
        totalSupply: result.data[row].totalSupply,
        reserve0: result.data[row].reserve0,
        reserve1: result.data[row].reserve1,
        reserveUSD: result.data[row].reserveUSD,
        reserveETH: result.data[row].reserveETH,
        token0DerivedETH: result.data[row].token0.derivedETH,
        token1DerivedETH: result.data[row].token1.derivedETH,
        roiUsd: values && values[0] ? sharePriceUsd / values[0]['sharePriceUsd'] : 1,
        ethPrice: 0,
        token0PriceUSD: 0,
        token1PriceUSD: 0,
      })
    }
  }

  // add eth prices
  let index = 0
  for (var brow in result?.data) {
    let timestamp = brow.split('b')[1]
    if (timestamp) {
      values[index].ethPrice = result.data[brow]?.ethPrice ?? 1
      values[index].token0PriceUSD = values[index].token0DerivedETH
      values[index].token1PriceUSD = values[index].token1DerivedETH
      index += 1
    }
  }

  return values
}

/**
 * @notice Creates an evenly-spaced array of timestamps
 * @dev Periods include a start and end timestamp. For example, n periods are defined by n+1 timestamps.
 * @param {Int} timestamp_from in seconds
 * @param {Int} period_length in seconds
 * @param {Int} periods
 */
export function getTimestampRange(timestamp_from, period_length, periods) {
  let timestamps = []
  for (let i = 0; i <= periods; i++) {
    timestamps.push(timestamp_from + i * period_length)
  }
  return timestamps
}

export const toNiceDateYear = (date) => dayjs.utc(dayjs.unix(date)).format('MMMM DD, YYYY')

export const isAddress = (value) => {
  try {
    return ethers.utils.getAddress(value.toLowerCase())
  } catch {
    return false
  }
}

export const toK = (num) => {
  return Numeral(num).format('0.[00]a')
}

export const setThemeColor = (theme) => document.documentElement.style.setProperty('--c-token', theme || '#333333')

export const Big = (number) => new BigNumber(number)

const explorerBase = EXPLORER_URL.replace(/\/+$/, '')

export const urls = {
  showTransaction: (tx) => `${explorerBase}/tx/${tx}/`,
  showAddress: (address) => `${explorerBase}/address/${address}/`,
  showToken: (address) => `${explorerBase}/token/${address}/`,
  showBlock: (block) => `${explorerBase}/block/${block}/`,
}

export const formatTime = (unix) => {
  const now = dayjs()
  const timestamp = dayjs.unix(unix)

  const inSeconds = now.diff(timestamp, 'second')
  const inMinutes = now.diff(timestamp, 'minute')
  const inHours = now.diff(timestamp, 'hour')
  const inDays = now.diff(timestamp, 'day')

  if (inHours >= 24) {
    return `${inDays} ${inDays === 1 ? 'day' : 'days'} ago`
  } else if (inMinutes >= 60) {
    return `${inHours} ${inHours === 1 ? 'hour' : 'hours'} ago`
  } else if (inSeconds >= 60) {
    return `${inMinutes} ${inMinutes === 1 ? 'minute' : 'minutes'} ago`
  } else {
    return `${inSeconds} ${inSeconds === 1 ? 'second' : 'seconds'} ago`
  }
}

export const formatNumber = (num) => {
  return num.toString().replace(/(\d)(?=(\d{3})+(?!\d))/g, '$1,')
}

export const isFiniteNum = (value) => {
  if (value === null || value === undefined) return false
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value === 'string') return Number.isFinite(Number(value))
  if (typeof value === 'object' && typeof value.isFinite === 'function') return value.isFinite()
  return false
}

export const toNum = (value, fallback = 0) => {
  if (value === null || value === undefined || value === '') return fallback
  const parsed = typeof value === 'string' ? parseFloat(value) : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

// using a currency library here in case we want to add more in future
const USD_ENABLED = false

export const formatDollarAmount = (num, digits) => {
  const formatter = new Intl.NumberFormat([], {
    style: USD_ENABLED ? 'currency' : 'decimal',
    currency: 'USD',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })
  return formatter.format(num)
}

export const toSignificant = (number, significantDigits) => {
  Decimal.set({ precision: significantDigits + 1, rounding: Decimal.ROUND_UP })
  const updated = new Decimal(number).toSignificantDigits(significantDigits)
  return updated.toFormat(updated.decimalPlaces(), { groupSeparator: '' })
}

export const formattedNum = (number, usd = false, acceptNegatives = false) => {
  const useUsd = usd && USD_ENABLED
  if (isNaN(number) || number === '' || number === undefined) {
    return useUsd ? '$0' : 0
  }
  let num = parseFloat(number)

  if (num > 500000000) {
    return (useUsd ? '$' : '') + toK(num.toFixed(0), true)
  }

  if (num === 0) {
    if (useUsd) {
      return '$0'
    }
    return 0
  }

  if (num < 0.0001 && num > 0) {
    return useUsd ? '< $0.0001' : '< 0.0001'
  }

  if (num > 1000) {
    return useUsd ? formatDollarAmount(num, 0) : Number(parseFloat(num).toFixed(0)).toLocaleString()
  }

  if (useUsd) {
    if (num < 0.1) {
      return formatDollarAmount(num, 4)
    } else {
      return formatDollarAmount(num, 2)
    }
  }

  return Number(parseFloat(num).toFixed(4)).toString()
}

export const formatPrice = (value) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return '—'
  if (num === 0) return '0'
  const abs = Math.abs(num)
  if (abs < 0.000001) return '< 0.000001'
  if (abs < 0.001) return trimTrailingZeros(num.toFixed(6))
  if (abs < 0.01) return trimTrailingZeros(num.toFixed(5))
  if (abs < 1) return trimTrailingZeros(num.toFixed(4))
  if (abs < 1000) return trimTrailingZeros(num.toFixed(4))
  return formattedNum(num, false)
}

function trimTrailingZeros(value) {
  if (typeof value !== 'string') return value
  return value.replace(/(?:\.0+|(\.\d+?)0+)$/, '$1')
}

export function rawPercent(percentRaw) {
  let percent = parseFloat(percentRaw * 100)
  if (!percent || percent === 0) {
    return '0%'
  }
  if (percent < 1 && percent > 0) {
    return '< 1%'
  }
  return percent.toFixed(0) + '%'
}

export function formattedPercent(percent, useBrackets = false) {
  const parsed = Number(percent)
  if (!Number.isFinite(parsed)) {
    return <Text fontWeight={500}>—</Text>
  }
  const percentValue = parsed
  if (!percentValue || percentValue === 0) {
    return <Text fontWeight={500}>0%</Text>
  }

  if (percentValue < 0.0001 && percentValue > 0) {
    return (
      <Text fontWeight={500} color="green">
        {'< 0.0001%'}
      </Text>
    )
  }

  if (percentValue < 0 && percentValue > -0.0001) {
    return (
      <Text fontWeight={500} color="red">
        {'< 0.0001%'}
      </Text>
    )
  }

  let fixedPercent = percentValue.toFixed(2)
  if (fixedPercent === '0.00') {
    return '0%'
  }
  if (fixedPercent > 0) {
    if (fixedPercent > 100) {
      return <Text fontWeight={500} color="green">{`+${percentValue?.toFixed(0).toLocaleString()}%`}</Text>
    } else {
      return <Text fontWeight={500} color="green">{`+${fixedPercent}%`}</Text>
    }
  } else {
    return <Text fontWeight={500} color="red">{`${fixedPercent}%`}</Text>
  }
}

/**
 * gets the amoutn difference plus the % change in change itself (second order change)
 * @param {*} valueNow
 * @param {*} value24HoursAgo
 * @param {*} value48HoursAgo
 */
export const get2DayPercentChange = (valueNow, value24HoursAgo, value48HoursAgo) => {
  // get volume info for both 24 hour periods
  let currentChange = parseFloat(valueNow) - parseFloat(value24HoursAgo)
  let previousChange = parseFloat(value24HoursAgo) - parseFloat(value48HoursAgo)

  const adjustedPercentChange = (parseFloat(currentChange - previousChange) / parseFloat(previousChange)) * 100

  if (isNaN(adjustedPercentChange) || !isFinite(adjustedPercentChange)) {
    return [currentChange, 0]
  }
  return [currentChange, adjustedPercentChange]
}

/**
 * get standard percent change between two values
 * @param {*} valueNow
 * @param {*} value24HoursAgo
 */
export const getPercentChange = (valueNow, value24HoursAgo) => {
  const adjustedPercentChange =
    ((parseFloat(valueNow) - parseFloat(value24HoursAgo)) / parseFloat(value24HoursAgo)) * 100
  if (isNaN(adjustedPercentChange) || !isFinite(adjustedPercentChange)) {
    return 0
  }
  return adjustedPercentChange
}

export function isEquivalent(a, b) {
  var aProps = Object.getOwnPropertyNames(a)
  var bProps = Object.getOwnPropertyNames(b)
  if (aProps.length !== bProps.length) {
    return false
  }
  for (var i = 0; i < aProps.length; i++) {
    var propName = aProps[i]
    if (a[propName] !== b[propName]) {
      return false
    }
  }
  return true
}
