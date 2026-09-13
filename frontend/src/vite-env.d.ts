/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL?: string
  readonly VITE_SOLANA_DEVNET_RPC_URL?: string
  readonly VITE_SOLANA_MAINNET_RPC_URL?: string
  readonly VITE_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
