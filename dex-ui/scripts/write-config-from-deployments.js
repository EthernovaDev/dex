#!/usr/bin/env node
const fs = require('fs')
const path = require('path')

const deploymentsPath = process.env.DEPLOYMENTS_JSON || '/opt/novadex/contracts/deployments.json'
const outputPath = path.join(__dirname, '..', 'public', 'ethernova.config.json')

if (!fs.existsSync(deploymentsPath)) {
  console.error(`[ERROR] deployments.json not found at ${deploymentsPath}`)
  process.exit(1)
}

const deployments = JSON.parse(fs.readFileSync(deploymentsPath, 'utf8'))
const addresses = deployments.addresses || {}
const startBlock = Number(
  deployments.startBlock ||
    deployments.deployBlock ||
    deployments.start_block ||
    deployments.deployBlockFactory ||
    0
)

const config = {
  chainId: Number(deployments.chainId || 77777),
  rpcUrl: process.env.REACT_APP_NETWORK_URL || 'https://rpc.ethnova.net',
  explorerUrl: process.env.REACT_APP_EXPLORER_URL || 'https://explorer.ethnova.net',
  nativeSymbol: 'NOVA',
  tokens: {
    WNOVA: {
      address: addresses.wnova || '',
      decimals: 18,
      symbol: 'WNOVA',
      name: 'Wrapped NOVA'
    },
    TONY: {
      address: addresses.tony || '',
      decimals: 18,
      symbol: 'TONY',
      name: 'STARK - IRON MAN'
    }
  },
  contracts: {
    factory: addresses.factory || '',
    router: addresses.novaRouter || addresses.router || '',
    swapRouter: addresses.novaRouter || addresses.router || '',
    liquidityRouter: addresses.router || '',
    multicall2: addresses.multicall2 || '',
    pair: addresses.pair || '',
    tokenFactory: addresses.tokenFactory || ''
  },
  startBlock
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true })
fs.writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`)
console.log(`[INFO] Wrote ${outputPath}`)
