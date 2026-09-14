/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SOLANA_RPC_URL?: string
  readonly VITE_API_URL?: string
  readonly VITE_MERA_PROGRAM_ID?: string
  readonly VITE_USDC_MINT?: string
  readonly VITE_NVDAX_MINT?: string
  readonly VITE_SOLX_MINT?: string
  readonly VITE_STX_MINT?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
