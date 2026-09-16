/**
 * One row in the user's portfolio bucket.
 * Balances come from the chain; price/value/allocation use a USD price feed.
 * Escrowed Autopilot / in-flight swap lots appear as extra `locked` rows.
 */
export type Holding = {
  /** List key — mint for wallet lots, `${mint}:locked` for escrow */
  id: string
  /** Token symbol or short name (e.g. "SOL", "USDC") */
  asset: string
  /** How many tokens this row represents (wallet or escrow) */
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
  /**
   * True when this quantity sits in treasury escrow (chat Autopilot / pending swap).
   * Still owned by the user — counts toward net worth, but cannot be spent.
   */
  locked: boolean
  /** Autopilot rule that escrowed this lot — cancel returns it to the wallet. */
  ruleId?: string | null
}

export function holdingListId(
  mint: string,
  locked: boolean,
  ruleId?: string | null,
): string {
  if (locked && ruleId) return `${mint}:locked:${ruleId}`
  return locked ? `${mint}:locked` : mint
}

export function availableHoldings(holdings: Holding[]): Holding[] {
  return holdings.filter((row) => !row.locked)
}

export function findAvailableHolding(
  holdings: Holding[],
  mint: string,
): Holding | null {
  if (!mint) {
    return null
  }
  return holdings.find((row) => row.mint === mint && !row.locked) ?? null
}
