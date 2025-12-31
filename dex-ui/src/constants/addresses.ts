const requiredEnv = (name: string): string => {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required at build time`)
  }
  return value
}

const parseChainId = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const trimmed = value.trim()
  const parsed = trimmed.startsWith('0x') ? parseInt(trimmed, 16) : parseInt(trimmed, 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

export const CHAIN_ID = parseChainId(process.env.REACT_APP_CHAIN_ID, 77777)
export const EXPLORER_URL = process.env.REACT_APP_EXPLORER_URL ?? ''

export const FACTORY_ADDRESS = requiredEnv('REACT_APP_FACTORY_ADDRESS')
export const ROUTER_ADDRESS = requiredEnv('REACT_APP_ROUTER_ADDRESS')
export const WNOVA_ADDRESS = requiredEnv('REACT_APP_WNOVA_ADDRESS')
export const TONY_ADDRESS = requiredEnv('REACT_APP_TONY_ADDRESS')
export const MULTICALL_ADDRESS = requiredEnv('REACT_APP_MULTICALL_ADDRESS')

export const BAD_RECIPIENT_ADDRESSES = [FACTORY_ADDRESS, ROUTER_ADDRESS]
