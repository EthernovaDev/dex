import { normAddr } from './index'

const TOKEN_METADATA_KEY = 'novadex:token-metadata'
const PAIR_METADATA_KEY = 'novadex:pair-metadata'

const safeParse = (value) => {
  if (!value) return null
  try {
    const parsed = JSON.parse(value)
    if (!parsed || typeof parsed !== 'object') return null
    return parsed
  } catch {
    return null
  }
}

const readMap = (key) => {
  if (typeof window === 'undefined') return {}
  const raw = window.localStorage.getItem(key)
  return safeParse(raw) || {}
}

export const getLocalTokenMetadataMap = () => readMap(TOKEN_METADATA_KEY)
export const getLocalPairMetadataMap = () => readMap(PAIR_METADATA_KEY)

export const getTokenMetadata = (address) => {
  const addr = normAddr(address)
  if (!addr) return null
  const map = getLocalTokenMetadataMap()
  return map?.[addr] || null
}

export const getPairMetadata = (pairAddress) => {
  const addr = normAddr(pairAddress)
  if (!addr) return null
  const map = getLocalPairMetadataMap()
  return map?.[addr] || null
}

export const getLocalTokens = () => {
  const map = getLocalTokenMetadataMap()
  return Object.keys(map || {}).map((id) => {
    const meta = map[id] || {}
    return {
      id,
      symbol: meta.symbol || '',
      name: meta.name || '',
      decimals: meta.decimals,
      description: meta.description,
      logo: meta.logo,
      website: meta.website,
      twitter: meta.twitter,
      telegram: meta.telegram,
      discord: meta.discord,
      createdAt: meta.createdAt,
    }
  })
}

export const getLocalPairs = () => {
  const map = getLocalPairMetadataMap()
  return Object.keys(map || {}).map((id) => {
    const meta = map[id] || {}
    return {
      id,
      token0: meta.token0,
      token1: meta.token1,
      symbol0: meta.symbol0,
      symbol1: meta.symbol1,
      createdAt: meta.createdAt,
    }
  })
}
