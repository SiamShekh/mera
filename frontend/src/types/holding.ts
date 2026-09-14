/**
 * One row in the user's portfolio bucket.
 * Balances come from the chain; price/value/allocation use a USD price feed.
 */
export type Holding = {
  /** Token symbol or short name (e.g. "SOL", "USDC") */
  asset: string
  /** How many tokens the wallet holds */
  quantity: number
  /** Token decimals (9 for SOL, 6 for USDC, …) */
  decimals: number
  /** SPL token program id, or null for native SOL */
  tokenProgram: string | null
  /** USD price per 1 token */
  price: number
  /** 24h price change percent (e.g. -2.38) */
  priceChange24h: number | null
  /** Total value in USD (quantity × price) */
  value: number
  /** Same value expressed in SOL */
  valueInSol: number
  /** Share of portfolio in percent (0–100) */
  allocation: number
  /** Mint address (or "native" for SOL) — stable id for lists */
  mint: string
  /** Token logo URL (null if unknown) */
  icon: string | null
}
