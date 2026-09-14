// App-wide settings from env (with simple defaults)

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Solana Devnet only (hackathon — mock USDC / xStock). */
export const SOLANA_CHAIN = 'solana:devnet' as const
export const NETWORK_LABEL = 'Devnet'

/** Devnet RPC — set Helius Devnet URL in `.env`. */
export const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

/** Anchor programmable portfolio program (Devnet). */
export const MERA_PROGRAM_ID =
  import.meta.env.VITE_MERA_PROGRAM_ID ??
  '55SD6QmpgygjDqLG3fzcbMvFEdPT4LozjAvPwcJQZXM5'

// 1 SOL = 1_000_000_000 lamports
export const LAMPORTS_PER_SOL = 1_000_000_000n
