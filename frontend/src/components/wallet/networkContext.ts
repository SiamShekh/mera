import { createContext } from 'react'

import { NETWORKS, type SolanaNetworkId } from '@/lib/config'

export type NetworkContextValue = {
  /** Current cluster: 'devnet' | 'mainnet' */
  network: SolanaNetworkId
  /** true = Devnet (test), false = Mainnet */
  isTestNetwork: boolean
  /** Flip the switch: true → Devnet, false → Mainnet */
  setTestNetwork: (on: boolean) => void
  /** Label + RPC for the active network */
  networkConfig: (typeof NETWORKS)[SolanaNetworkId]
}

export const NetworkContext = createContext<NetworkContextValue | null>(null)
