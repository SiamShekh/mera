// App-wide settings from env (with simple defaults)

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Solana Mainnet only */
export const SOLANA_CHAIN = 'solana:mainnet' as const
export const NETWORK_LABEL = 'Mainnet'

/** Mainnet RPC — set your Helius URL in .env */
export const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com'

// 1 SOL = 1_000_000_000 lamports
export const LAMPORTS_PER_SOL = 1_000_000_000n
