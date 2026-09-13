/**
 * Solana network + RPC config.
 * Devnet only for now — swap RPC later if you use a dedicated provider.
 */
import { WalletAdapterNetwork } from '@solana/wallet-adapter-base'
import { clusterApiUrl } from '@solana/web3.js'

/** Active cluster: Devnet (test network). */
export const SOLANA_NETWORK = WalletAdapterNetwork.Devnet

/**
 * Public Devnet RPC. For production-grade reliability later,
 * replace with a dedicated endpoint (Helius, QuickNode, etc.).
 */
export const SOLANA_RPC_ENDPOINT =
  import.meta.env.VITE_SOLANA_RPC_URL ?? clusterApiUrl(SOLANA_NETWORK)

export const NETWORK_LABEL = 'Devnet'
