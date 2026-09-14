import 'dotenv/config'

export type Env = {
  PORT: number
  ENVIRONMENT: string
  CORS_ORIGIN: string
  MONGODB_URI: string
  REALTIME_TICK_MS: number
  OPENAI_API_KEY?: string
  OPENAI_MODEL?: string
  PROGRAM_ID?: string
  KEEPER_SECRET_KEY?: string
  SOLANA_RPC_URL?: string
  JUPITER_API_URL?: string
  MOCK_USDC_MINT?: string
  MOCK_NVDAX_MINT?: string
  MOCK_SOLX_MINT?: string
  MOCK_STX_MINT?: string
  SWAP_AUTHORITY_SECRET?: string
}

/** @deprecated Use Env — kept as alias while AI/Solana modules migrate. */
export type Bindings = Env

function optional(key: string): string | undefined {
  const value = process.env[key]?.trim()
  return value ? value : undefined
}

export function loadEnv(): Env {
  const mongo = process.env.MONGODB_URI?.trim()
  if (!mongo) {
    throw new Error('MONGODB_URI is required')
  }

  return {
    PORT: Number(process.env.PORT ?? 3000),
    ENVIRONMENT: process.env.ENVIRONMENT?.trim() || 'development',
    CORS_ORIGIN:
      process.env.CORS_ORIGIN?.trim() ||
      'http://localhost:5173,http://127.0.0.1:5173',
    MONGODB_URI: mongo,
    REALTIME_TICK_MS: Number(process.env.REALTIME_TICK_MS ?? 10_000),
    OPENAI_API_KEY: optional('OPENAI_API_KEY'),
    OPENAI_MODEL: optional('OPENAI_MODEL'),
    PROGRAM_ID: optional('PROGRAM_ID'),
    KEEPER_SECRET_KEY: optional('KEEPER_SECRET_KEY'),
    SOLANA_RPC_URL: optional('SOLANA_RPC_URL'),
    JUPITER_API_URL: optional('JUPITER_API_URL'),
    MOCK_USDC_MINT: optional('MOCK_USDC_MINT'),
    MOCK_NVDAX_MINT: optional('MOCK_NVDAX_MINT'),
    MOCK_SOLX_MINT: optional('MOCK_SOLX_MINT'),
    MOCK_STX_MINT: optional('MOCK_STX_MINT'),
    SWAP_AUTHORITY_SECRET: optional('SWAP_AUTHORITY_SECRET'),
  }
}

let cached: Env | null = null

export function env(): Env {
  if (!cached) cached = loadEnv()
  return cached
}
