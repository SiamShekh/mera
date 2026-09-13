import { ClientProvider } from '@solana/react'
import { useMemo, type ReactNode } from 'react'

import { useNetwork } from '@/hooks/useNetwork'
import { createSolanaClient } from '@/lib/solanaClient'

type SolanaProviderProps = {
  children: ReactNode
}

/**
 * Builds a Kit client for the selected network and publishes it.
 * When Devnet/Mainnet flips, we remount with a fresh client (new RPC + chain).
 */
export function SolanaProvider({ children }: SolanaProviderProps) {
  const { network } = useNetwork()

  const client = useMemo(() => createSolanaClient(network), [network])

  return (
    <ClientProvider key={network} client={client}>
      {children}
    </ClientProvider>
  )
}
