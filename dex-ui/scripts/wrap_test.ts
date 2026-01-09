import fs from 'fs'
import { ethers } from 'ethers'

const ENV_PATH = process.env.ENV_PATH || '/opt/novadex/.env'
const DEPLOYMENTS_PATH = process.env.DEPLOYMENTS_JSON || '/opt/novadex/contracts/deployments.json'

type EnvMap = Record<string, string>

function parseEnv(content: string): EnvMap {
  const env: EnvMap = {}
  content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .forEach(line => {
      const idx = line.indexOf('=')
      if (idx === -1) return
      const key = line.slice(0, idx).trim()
      let value = line.slice(idx + 1).trim()
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }
      env[key] = value
    })
  return env
}

function loadEnv(): EnvMap {
  if (!fs.existsSync(ENV_PATH)) return {}
  return parseEnv(fs.readFileSync(ENV_PATH, 'utf8'))
}

function loadDeployments() {
  if (!fs.existsSync(DEPLOYMENTS_PATH)) {
    throw new Error(`Missing deployments.json at ${DEPLOYMENTS_PATH}`)
  }
  return JSON.parse(fs.readFileSync(DEPLOYMENTS_PATH, 'utf8'))
}

const WNOVA_ABI = [
  'function deposit() payable',
  'function withdraw(uint256)',
  'function balanceOf(address) view returns (uint256)'
]

async function main() {
  const env = loadEnv()
  const rpcUrl = process.env.RPC_URL || env.RPC_URL || 'https://rpc.ethnova.net'
  const deployments = loadDeployments()
  const wnova = deployments?.addresses?.wnova
  if (!wnova) throw new Error('WNOVA address missing in deployments.json')

  const target = process.argv[2] || '0x2DAf4F20180b5f5b2DaD430691f5ac961d7295b6'
  if (!/^0x[a-fA-F0-9]{40}$/.test(target)) {
    throw new Error(`Invalid address: ${target}`)
  }

  const provider = new ethers.providers.JsonRpcProvider(rpcUrl, 121525)
  const contract = new ethers.Contract(wnova, WNOVA_ABI, provider)

  console.log(`[wrap_test] RPC: ${rpcUrl}`)
  console.log(`[wrap_test] WNOVA: ${wnova}`)
  console.log(`[wrap_test] Target: ${target}`)

  const balance = await contract.balanceOf(target)
  console.log(`[wrap_test] WNOVA balanceOf: ${ethers.utils.formatEther(balance)} (${balance.toString()})`)

  const value = ethers.utils.parseEther('1.0')
  const estimate = await contract.estimateGas.deposit({ value, from: target })
  console.log(`[wrap_test] estimateGas deposit(1 NOVA): ${estimate.toString()}`)

  const shouldSend = process.argv.includes('--send')
  const privateKey = process.env.DEPLOYER_PRIVATE_KEY || env.DEPLOYER_PRIVATE_KEY

  if (shouldSend) {
    if (!privateKey) {
      throw new Error('DEPLOYER_PRIVATE_KEY missing; cannot send tx')
    }
    const signer = new ethers.Wallet(privateKey, provider)
    const tx = await contract.connect(signer).deposit({ value: ethers.utils.parseEther('0.01') })
    console.log(`[wrap_test] sent tx: ${tx.hash}`)
    const receipt = await tx.wait(1)
    console.log(`[wrap_test] confirmed in block ${receipt.blockNumber}`)
  } else {
    console.log('[wrap_test] dry-run only (add --send to submit 0.01 NOVA)')
  }
}

main().catch(err => {
  console.error('[wrap_test] error', err?.message || err)
  process.exit(1)
})
