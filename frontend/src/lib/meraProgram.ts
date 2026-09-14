import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit'

import { XSTOCKS_CATALOG } from '@/data/xstocks'
import {
  MINTS,
  NVDAX_MINT,
  USDC_MINT,
  resolveMint as resolveDevnetMint,
} from '@/lib/mints'

/** Deployed / declared Anchor program id (sync with program/Anchor.toml). */
export const MERA_PROGRAM_ID = address(
  import.meta.env.VITE_MERA_PROGRAM_ID ??
    '55SD6QmpgygjDqLG3fzcbMvFEdPT4LozjAvPwcJQZXM5',
)

/** Max rules packed into one Portfolio PDA (matches on-chain MAX_RULES). */
export const MAX_PORTFOLIO_RULES = 8

export { USDC_MINT, NVDAX_MINT, MINTS }

/**
 * Tokenized stock ticker → Devnet mock mint.
 * Core: setup-devnet-mints.sh · extras: add-xstock-mints.sh
 * Do not use these mint scripts on Mainnet — point at real mints instead.
 */
export const TOKENIZED_STOCK_MINTS: Record<string, string> = {
  NVDA: NVDAX_MINT,
  NVDAX: NVDAX_MINT,
  ...Object.fromEntries(
    XSTOCKS_CATALOG.flatMap((row) => [
      [row.symbol.toUpperCase(), row.mint],
      [row.underlying.toUpperCase(), row.mint],
    ]),
  ),
}

const addressEncoder = getAddressEncoder()
const textEncoder = new TextEncoder()

/** Derive Portfolio PDA: seeds = ["portfolio", owner]. Rules live inside this account. */
export async function derivePortfolioPda(ownerAddress: string) {
  const owner = address(ownerAddress)
  const [pda] = await getProgramDerivedAddress({
    programAddress: MERA_PROGRAM_ID,
    seeds: [textEncoder.encode('portfolio'), addressEncoder.encode(owner)],
  })
  return pda
}

export function resolveMint(symbolOrMint: string): string | null {
  return resolveDevnetMint(symbolOrMint)
}
