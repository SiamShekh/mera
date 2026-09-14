export type Bindings = {
  DB: D1Database
  ENVIRONMENT: string
  CORS_ORIGIN: string
  /** Optional OpenAI key (wrangler secret / .dev.vars). Fallback only. */
  OPENAI_API_KEY?: string
  /** Optional OpenAI model override (default gpt-4o-mini). */
  OPENAI_MODEL?: string
  /** Cloudflare Workers AI binding (preferred; enabled in wrangler.toml). */
  AI?: Ai
  /** Optional Workers AI model id (default @cf/meta/llama-3.1-8b-instruct-fast). */
  WORKERS_AI_MODEL?: string
  /** Mera portfolio Anchor program id (Devnet). */
  PROGRAM_ID?: string
  /** Base58 secret key for the keeper fee payer (never a user key). */
  KEEPER_SECRET_KEY?: string
  /** Solana RPC URL (Devnet). */
  SOLANA_RPC_URL?: string
  /** Optional; unused on Devnet (mock enforce, no Jupiter quotes). */
  JUPITER_API_URL?: string
  /** Optional mock USDC mint (Devnet). */
  MOCK_USDC_MINT?: string
  /** Optional mock NVDAx mint (Devnet). */
  MOCK_NVDAX_MINT?: string
  /** Optional mock SOL (SOLx) mint (Devnet). */
  MOCK_SOLX_MINT?: string
  /** Optional mock staked X (stX) mint (Devnet). */
  MOCK_STX_MINT?: string
  /**
   * Base58 secret of the mint authority / swap treasury wallet
   * (the keypair that ran setup-devnet-mints.sh).
   */
  SWAP_AUTHORITY_SECRET?: string
}

export type AppEnv = {
  Bindings: Bindings
}
