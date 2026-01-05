const API_BASE = '/api/metadata'

async function safeFetch(url, options) {
  try {
    const res = await fetch(url, options)
    if (!res.ok) return null
    const json = await res.json()
    return json
  } catch {
    return null
  }
}

export async function fetchTokenMetadata(address) {
  if (!address) return null
  const res = await safeFetch(`${API_BASE}/token/${address}`)
  if (!res || !res.ok) return null
  return res.data || null
}

export async function fetchPairMetadata(address) {
  if (!address) return null
  const res = await safeFetch(`${API_BASE}/pair/${address}`)
  if (!res || !res.ok) return null
  return res.data || null
}

export async function fetchTokenList() {
  const res = await safeFetch(`${API_BASE}/tokens`)
  if (!res || !res.ok) return null
  return res.data || null
}

export async function fetchPairList() {
  const res = await safeFetch(`${API_BASE}/pairs`)
  if (!res || !res.ok) return null
  return res.data || null
}
