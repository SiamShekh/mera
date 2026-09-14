/**
 * Mera portfolio program client helpers (Devnet).
 * PROGRAM_ID is a placeholder until `anchor keys sync` / deploy.
 */

import { MINTS, resolveMint as resolveDevnetMint } from '@/lib/mints'

export const MERA_PROGRAM_ID =
  import.meta.env.VITE_MERA_PROGRAM_ID ??
  '55SD6QmpgygjDqLG3fzcbMvFEdPT4LozjAvPwcJQZXM5'

/** Common Devnet mock mints used by the vault UX. */
export { MINTS }

export type OnChainRuleType =
  'min_allocation' | 'max_allocation' | 'take_profit'

/**
 * Derive portfolio PDA seeds (matches on-chain `["portfolio", owner]`).
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

export function ruleSeedHint(portfolioPda: string, ruleId: number | bigint) {
  return {
    seeds: ['rule', portfolioPda, String(ruleId)],
    programId: MERA_PROGRAM_ID,
  }
}

/** Map UI / AI asset tickers to Devnet mock mints when known. */
export function resolveMint(asset: string): string | null {
  return resolveDevnetMint(asset)
}
