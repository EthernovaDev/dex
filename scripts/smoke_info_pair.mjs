import fs from 'fs/promises'

const DEFAULT_SUBGRAPH = 'https://dex.ethnova.net/info/subgraphs/name/novadex/novadex'

function normAddr(addr) {
  return (addr || '').trim().toLowerCase()
}

async function readPairFromConfig() {
  try {
    const raw = await fs.readFile('/opt/novadex/dex/dex-ui/public/ethernova.config.json', 'utf8')
    const parsed = JSON.parse(raw)
    return parsed?.contracts?.pair || ''
  } catch (err) {
    return ''
  }
}

async function main() {
  const argAddr = process.argv[2]
  const pairAddress = normAddr(argAddr || process.env.PAIR_ADDRESS || (await readPairFromConfig()))
  const subgraphUrl = process.env.SUBGRAPH_URL || DEFAULT_SUBGRAPH

  if (!pairAddress || !/^0x[0-9a-f]{40}$/.test(pairAddress)) {
    console.error('[ERROR] Missing or invalid pair address. Pass as arg or set PAIR_ADDRESS.')
    process.exit(1)
  }

  const query = `query Pair($id: ID!) {
    pair(id: $id) {
      id
      token0 { id symbol name }
      token1 { id symbol name }
      reserve0
      reserve1
    }
  }`

  const body = JSON.stringify({ query, variables: { id: pairAddress } })

  let resp
  try {
    resp = await fetch(subgraphUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    })
  } catch (err) {
    console.error('[ERROR] Subgraph fetch failed:', err?.message || err)
    process.exit(1)
  }

  if (!resp.ok) {
    console.error(`[ERROR] Subgraph HTTP ${resp.status}`)
    process.exit(1)
  }

  const json = await resp.json()
  if (json?.errors?.length) {
    console.error('[ERROR] Subgraph returned errors:', JSON.stringify(json.errors))
    process.exit(1)
  }

  const pair = json?.data?.pair
  if (!pair) {
    console.error('[ERROR] Pair not indexed yet for id:', pairAddress)
    process.exit(1)
  }

  const token0 = pair?.token0?.symbol || '—'
  const token1 = pair?.token1?.symbol || '—'
  const reserve0 = pair?.reserve0 || '0'
  const reserve1 = pair?.reserve1 || '0'

  console.log('[OK] Subgraph endpoint:', subgraphUrl)
  console.log('[OK] Pair indexed:', pair.id)
  console.log(`[OK] Tokens: ${token0}/${token1}`)
  console.log(`[OK] Reserves: ${reserve0} / ${reserve1}`)
}

main().catch((err) => {
  console.error('[ERROR] smoke_info_pair failed:', err?.message || err)
  process.exit(1)
})
