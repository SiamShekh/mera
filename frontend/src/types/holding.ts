/**
 * One row in the user's portfolio bucket.
 * Balances come from the chain; price/value/allocation use a USD price feed.
 */
export type Holding = {
  /** Token symbol or short name (e.g. "SOL", "USDC") */
  asset: string
  /** How many tokens the wallet holds */
  quantity: number
  /** USD price per 1 token */
  price: number
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
