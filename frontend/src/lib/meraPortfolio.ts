/**
 * Mera portfolio program client helpers.
 * PROGRAM_ID is a placeholder until `anchor keys sync` / deploy.
 */

import { MINTS, resolveMint as resolveDevnetMint } from '@/lib/mints'

export const MERA_PROGRAM_ID =
  import.meta.env.VITE_MERA_PROGRAM_ID ??
  '55SD6QmpgygjDqLG3fzcbMvFEdPT4LozjAvPwcJQZXM5'

/** Max rules packed into one Portfolio PDA (matches on-chain MAX_RULES). */
export const MAX_PORTFOLIO_RULES = 8

/** Common Devnet mock mints used by the vault UX. */
export { MINTS }

export type OnChainRuleType =
  | 'min_allocation'
  | 'max_allocation'
  | 'take_profit'
  | 'stop_loss'
  | 'market_buy'
  | 'limit_buy'

/**
 * Derive portfolio PDA seeds (matches on-chain `["portfolio", owner]`).
 * Rules are packed inside this single account (no per-rule PDA).
 * Use @solana/kit getProgramDerivedAddress in the UI when signing.
 */
export function portfolioSeedBytes(ownerAddress: string): {
  seeds: string[]
  programId: string
} {
  return {
    seeds: ['portfolio', ownerAddress],
    programId: MERA_PROGRAM_ID,
  }
}

/** Map UI / AI asset tickers to Devnet mock mints when known. */
export function resolveMint(asset: string): string | null {
  return resolveDevnetMint(asset)
}
