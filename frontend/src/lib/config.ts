// App-wide settings from env (with simple defaults)

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000'

/** Socket.io realtime (same origin as API by default). */
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL ?? API_URL

/** Solana network label shown in the UI. */
export const SOLANA_CHAIN = 'solana:devnet' as const
export const NETWORK_LABEL =
  import.meta.env.VITE_NETWORK_LABEL ?? 'Solana'

/** Solana RPC URL — set in `.env`. */
export const SOLANA_RPC_URL =
  import.meta.env.VITE_SOLANA_RPC_URL ?? 'https://api.devnet.solana.com'

/** Anchor programmable portfolio program id. */
export const MERA_PROGRAM_ID =
  import.meta.env.VITE_MERA_PROGRAM_ID ??
  '55SD6QmpgygjDqLG3fzcbMvFEdPT4LozjAvPwcJQZXM5'

// 1 SOL = 1_000_000_000 lamports
export const LAMPORTS_PER_SOL = 1_000_000_000n
