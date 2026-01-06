import { ethers } from 'ethers'
import { normAddr } from './index'

const RPC_URL = process.env.REACT_APP_RPC_URL
const REGISTRY_ADDRESS = process.env.REACT_APP_METADATA_REGISTRY_ADDRESS
const IPFS_GATEWAY = process.env.REACT_APP_IPFS_GATEWAY || 'https://dex.ethnova.net/ipfs/'

const REGISTRY_ABI = [
  'function tokenURI(address) view returns (string)',
  'function pairURI(address) view returns (string)'
]

function resolveIpfs(uri) {
  if (!uri) return ''
  if (uri.startsWith('ipfs://')) {
    return `${IPFS_GATEWAY}${uri.slice(7)}`
  }
  if (uri.includes('/ipfs/')) {
    const idx = uri.indexOf('/ipfs/')
    const cid = uri.slice(idx + 6)
    return `${IPFS_GATEWAY}${cid}`
  }
  return uri
}

async function fetchJson(url) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}

async function getRegistryProvider() {
  if (!RPC_URL || !REGISTRY_ADDRESS) return null
  return new ethers.providers.JsonRpcProvider(RPC_URL)
}

async function fetchUri(address, type) {
  if (!address || !REGISTRY_ADDRESS || !RPC_URL) return ''
  const provider = await getRegistryProvider()
  if (!provider) return ''
  const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider)
  const normalized = normAddr(address)
  try {
    if (type === 'pair') {
      return await registry.pairURI(normalized)
    }
    return await registry.tokenURI(normalized)
  } catch {
    return ''
  }
}

export async function fetchRegistryTokenMetadata(address) {
  const uri = await fetchUri(address, 'token')
  if (!uri) return null
  const json = await fetchJson(resolveIpfs(uri))
  if (!json) return null
  return {
    name: json.name || '',
    symbol: json.symbol || '',
    description: json.description || '',
    logo: json.image || '',
    image_uri: json.image || '',
    website: json.links?.website || '',
    twitter: json.links?.x || '',
    telegram: json.links?.telegram || '',
    discord: json.links?.discord || '',
    metadata_uri: uri,
    source: 'registry'
  }
}

export async function fetchRegistryPairMetadata(address) {
  const uri = await fetchUri(address, 'pair')
  if (!uri) return null
  const json = await fetchJson(resolveIpfs(uri))
  if (!json) return null
  return {
    name: json.name || '',
    symbol: json.symbol || '',
    description: json.description || '',
    logo: json.image || '',
    image_uri: json.image || '',
    website: json.links?.website || '',
    twitter: json.links?.x || '',
    telegram: json.links?.telegram || '',
    discord: json.links?.discord || '',
    metadata_uri: uri,
    source: 'registry'
  }
}
