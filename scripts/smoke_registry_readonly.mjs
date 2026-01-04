#!/usr/bin/env node
import fs from 'fs'
import * as ethers from 'ethers'

const configPath = '/opt/novadex/dex/dex-ui/public/ethernova.config.json'
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, 'utf8')) : {}
const registry = config?.contracts?.metadataRegistry
const rpcUrl = process.env.RPC_URL || config?.rpcUrl || 'https://rpc.ethnova.net'
const wnova = config?.tokens?.WNOVA?.address
const pair = config?.contracts?.pair

const log = (msg) => process.stdout.write(`${msg}\n`)
const warn = (msg) => process.stdout.write(`[WARN] ${msg}\n`)
const fail = (msg) => {
  process.stderr.write(`[ERROR] ${msg}\n`)
  process.exit(1)
}

const REGISTRY_ABI = [
  'function tokenURI(address) view returns (string)',
  'function pairURI(address) view returns (string)'
]

async function main() {
  if (!registry) fail('metadataRegistry missing in config')
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl)
  const contract = new ethers.Contract(registry, REGISTRY_ABI, provider)
  if (wnova) {
    const tokenUri = await contract.tokenURI(wnova)
    log(`[OK] tokenURI(${wnova}) => ${tokenUri || '(empty)'}`)
  } else {
    warn('WNOVA address missing')
  }
  if (pair) {
    const pairUri = await contract.pairURI(pair)
    log(`[OK] pairURI(${pair}) => ${pairUri || '(empty)'}`)
  } else {
    warn('Pair address missing')
  }
}

main().catch((err) => fail(err.message))
