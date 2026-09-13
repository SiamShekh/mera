import { useMemo, type ReactNode } from 'react'
import {
  ConnectionProvider,
  WalletProvider,
} from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'

import { SOLANA_RPC_ENDPOINT } from '@/lib/solana'

import '@solana/wallet-adapter-react-ui/styles.css'

type SolanaWalletProviderProps = {
  children: ReactNode
}

/**
 * Wraps the app with Solana connection + wallet adapters.
 * Empty `wallets` relies on Wallet Standard (Phantom, Solflare, etc.
 * auto-detected). Connected wallets can approve sign/sendTransaction
 * for future portfolio actions — keys stay in the wallet.
 */
export function SolanaWalletProvider({ children }: SolanaWalletProviderProps) {
  const endpoint = useMemo(() => SOLANA_RPC_ENDPOINT, [])
  const wallets = useMemo(() => [], [])

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  )
}
