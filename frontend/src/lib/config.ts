// App-wide settings from env (with simple defaults)

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Which Solana cluster we can use */
export type SolanaNetworkId = 'devnet' | 'mainnet'

export const NETWORKS = {
  // Test / development cluster (default)
  devnet: {
    id: 'devnet' as const,
    label: 'Devnet',
    chain: 'solana:devnet' as const,
    rpcUrl:
      import.meta.env.VITE_SOLANA_DEVNET_RPC_URL ??
      import.meta.env.VITE_SOLANA_RPC_URL ??
      'https://api.devnet.solana.com',
  },
  // Real mainnet — use carefully
  mainnet: {
    id: 'mainnet' as const,
    label: 'Mainnet',
    chain: 'solana:mainnet' as const,
    rpcUrl:
      import.meta.env.VITE_SOLANA_MAINNET_RPC_URL ??
      'https://api.mainnet-beta.solana.com',
  },
} as const

/** Default for local development: test network ON = Devnet */
export const DEFAULT_NETWORK: SolanaNetworkId = 'devnet'

// 1 SOL = 1_000_000_000 lamports
export const LAMPORTS_PER_SOL = 1_000_000_000n

export const NETWORK_STORAGE_KEY = 'solana-network'
