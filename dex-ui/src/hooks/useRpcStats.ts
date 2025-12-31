import { useEffect, useState } from 'react'
import { DebugEventDetail } from '../utils/debugEvents'

export type RpcStats = DebugEventDetail['rpcStats']

export function useRpcStats(): RpcStats {
  const initial =
    typeof window !== 'undefined' && (window as any).__NOVADEX_DEBUG__ ? (window as any).__NOVADEX_DEBUG__.rpcStats : null
  const [stats, setStats] = useState<RpcStats>(initial)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<DebugEventDetail>).detail
      if (detail?.rpcStats) {
        setStats(detail.rpcStats)
      }
    }
    window.addEventListener('novadex:debug', handler as EventListener)
    return () => window.removeEventListener('novadex:debug', handler as EventListener)
  }, [])

  return stats
}
