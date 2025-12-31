import { ensureEthernovaConnected } from './ethernova'

export async function switchToEthernova(): Promise<void> {
  await ensureEthernovaConnected()
}
