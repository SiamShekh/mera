import {
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from '@solana/kit'

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

export { USDC_MINT, NVDAX_MINT, MINTS }

/**
 * Tokenized stock ticker → Devnet mock mint.
 * Run `program/scripts/setup-devnet-mints.sh` and set VITE_NVDAX_MINT.
 */
export const TOKENIZED_STOCK_MINTS: Record<string, string> = {
  NVDA: NVDAX_MINT,
  NVDAX: NVDAX_MINT,
}

const addressEncoder = getAddressEncoder()
const textEncoder = new TextEncoder()

/** Derive Portfolio PDA: seeds = ["portfolio", owner]. */
export async function derivePortfolioPda(ownerAddress: string) {
  const owner = address(ownerAddress)
  const [pda] = await getProgramDerivedAddress({
    programAddress: MERA_PROGRAM_ID,
    seeds: [textEncoder.encode('portfolio'), addressEncoder.encode(owner)],
  })
  return pda
}

/** Derive Rule PDA: seeds = ["rule", portfolio, rule_id little-endian u64]. */
export async function deriveRulePda(
  portfolioPda: string,
  ruleId: bigint | number,
) {
  const portfolio = address(portfolioPda)
  const id = BigInt(ruleId)
  const le = new Uint8Array(8)
  new DataView(le.buffer).setBigUint64(0, id, true)

  const [pda] = await getProgramDerivedAddress({
    programAddress: MERA_PROGRAM_ID,
    seeds: [textEncoder.encode('rule'), addressEncoder.encode(portfolio), le],
  })
  return pda
}

export function resolveMint(symbolOrMint: string): string | null {
  return resolveDevnetMint(symbolOrMint)
}
