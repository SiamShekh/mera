import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { NetworkContext } from '@/components/wallet/networkContext'
import {
  DEFAULT_NETWORK,
  NETWORK_STORAGE_KEY,
  NETWORKS,
  type SolanaNetworkId,
} from '@/lib/config'

function readSavedNetwork(): SolanaNetworkId {
  try {
    const saved = localStorage.getItem(NETWORK_STORAGE_KEY)
    if (saved === 'devnet' || saved === 'mainnet') {
      return saved
    }
  } catch {
    // localStorage may be blocked — fall back to default
  }
  return DEFAULT_NETWORK
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [network, setNetwork] = useState<SolanaNetworkId>(readSavedNetwork)

  const setTestNetwork = useCallback((on: boolean) => {
    const next: SolanaNetworkId = on ? 'devnet' : 'mainnet'
    setNetwork(next)
    try {
      localStorage.setItem(NETWORK_STORAGE_KEY, next)
    } catch {
      // Ignore storage errors
    }
  }, [])

  const value = useMemo(
    () => ({
      network,
      isTestNetwork: network === 'devnet',
      setTestNetwork,
      networkConfig: NETWORKS[network],
    }),
    [network, setTestNetwork],
  )

  return (
    <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>
  )
}
