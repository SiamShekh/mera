import { ClientProvider } from '@solana/react'
import type { ReactNode } from 'react'

import { solanaClient } from '@/lib/solanaClient'

type SolanaProviderProps = {
  children: ReactNode
}

/**
 * Publishes the Kit Devnet client to React.
 * Wallet + RPC hooks read from this one provider.
 */
export function SolanaProvider({ children }: SolanaProviderProps) {
  return <ClientProvider client={solanaClient}>{children}</ClientProvider>
}
