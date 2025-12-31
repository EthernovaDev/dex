const PUBLIC_URL = (process.env.PUBLIC_URL ?? '').replace(/\/+$/, '')
export const DEFAULT_TOKEN_LIST_URL = `${PUBLIC_URL}/tokenlists/ethernova.tokenlist.json`

export const DEFAULT_LIST_OF_LISTS: string[] = [DEFAULT_TOKEN_LIST_URL]
