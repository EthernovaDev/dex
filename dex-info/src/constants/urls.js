const origin =
  (typeof window !== 'undefined' && window.location?.origin) || process.env.REACT_APP_DEX_URL || 'https://dex.ethnova.net'
const infoBase = `${origin.replace(/\/+$/, '')}/info`

export const SUBGRAPH_URL =
  process.env.REACT_APP_SUBGRAPH_URL || `${infoBase}/subgraphs/name/novadex/novadex`
export const BLOCKS_URL = process.env.REACT_APP_BLOCKS_URL || `${infoBase}/subgraphs/name/novadex/blocks`
export const EXPLORER_URL = process.env.REACT_APP_EXPLORER_URL || 'https://explorer.ethnova.net'
export const DEX_URL = process.env.REACT_APP_DEX_URL || origin
export const WRAPPED_NATIVE_ADDRESS = (process.env.REACT_APP_WNOVA_ADDRESS || '').toLowerCase()
export const TONY_ADDRESS = (process.env.REACT_APP_TONY_ADDRESS || '').toLowerCase()
export const PAIR_ADDRESS = (process.env.REACT_APP_PAIR_ADDRESS || '').toLowerCase()
