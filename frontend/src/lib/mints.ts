import { TOKEN_ICONS } from '@/lib/tokenIcons'

/**
 * Devnet mock mints for the hackathon.
 *
 * Create them with: `cd program && bash scripts/setup-devnet-mints.sh`
 * Then paste the printed addresses into `frontend/.env`.
 */

/** Placeholder until you run the setup script — deposit/resolve will fail until set. */
const PLACEHOLDER = '11111111111111111111111111111111'

export const USDC_MINT = import.meta.env.VITE_USDC_MINT?.trim() || PLACEHOLDER

export const NVDAX_MINT = import.meta.env.VITE_NVDAX_MINT?.trim() || PLACEHOLDER

/** Mock SOL (SPL) for Devnet spot swaps — not native SOL. */
export const SOLX_MINT = import.meta.env.VITE_SOLX_MINT?.trim() || PLACEHOLDER

/** Mock staked X for Devnet spot swaps. */
export const STX_MINT = import.meta.env.VITE_STX_MINT?.trim() || PLACEHOLDER

/** Fixed mock USD prices (no DexScreener / Mainnet liquidity). */
export const MOCK_USD_PRICES: Record<string, number> = {
  ...(USDC_MINT !== PLACEHOLDER ? { [USDC_MINT]: 1 } : {}),
  ...(NVDAX_MINT !== PLACEHOLDER ? { [NVDAX_MINT]: 120 } : {}),
  ...(SOLX_MINT !== PLACEHOLDER ? { [SOLX_MINT]: 150 } : {}),
  ...(STX_MINT !== PLACEHOLDER ? { [STX_MINT]: 165 } : {}),
}

export const MINTS = {
  USDC: USDC_MINT,
  /** Native/wrapped SOL id (fees / native balance). Not a mock swap mint. */
  SOL: 'So11111111111111111111111111111111111111112',
  SOLx: SOLX_MINT,
  NVDAx: NVDAX_MINT,
  stX: STX_MINT,
} as const

export type SwapAsset = {
  symbol: string
  mint: string
  decimals: number
  priceUsd: number
  icon: string
}

/** Tradeable Devnet mock assets for Spot (excludes native SOL). */
export function listSwapAssets(): SwapAsset[] {
  const rows: SwapAsset[] = [
    {
      symbol: 'USDC',
      mint: USDC_MINT,
      decimals: 6,
      priceUsd: 1,
      icon: TOKEN_ICONS.USDC,
    },
    {
      symbol: 'SOLx',
      mint: SOLX_MINT,
      decimals: 6,
      priceUsd: 150,
      icon: TOKEN_ICONS.SOLx,
    },
    {
      symbol: 'stX',
      mint: STX_MINT,
      decimals: 6,
      priceUsd: 165,
      icon: TOKEN_ICONS.stX,
    },
    {
      symbol: 'NVDAx',
      mint: NVDAX_MINT,
      decimals: 6,
      priceUsd: 120,
      icon: TOKEN_ICONS.NVDAx,
    },
  ]
  return rows.filter((row) => row.mint !== PLACEHOLDER)
}

export function quoteMockSwap(
  sell: SwapAsset,
  buy: SwapAsset,
  sellAmount: number,
): number {
  if (!(sellAmount > 0) || sell.mint === buy.mint) {
    return 0
  }
  const sellUsd = sellAmount * sell.priceUsd
  const scale = 10 ** Math.min(buy.decimals, 8)
  return Math.floor((sellUsd / buy.priceUsd) * scale) / scale
}

export function resolveMint(asset: string): string | null {
  const key = asset.trim().toUpperCase()
  if (!key) return null
  if (key.length >= 32) return asset.trim()
  const map: Record<string, string> = {
    USDC: MINTS.USDC,
    SOL: MINTS.SOL,
    WSOL: MINTS.SOL,
    SOLX: MINTS.SOLx,
    NVDA: MINTS.NVDAx,
    NVDAX: MINTS.NVDAx,
    STX: MINTS.stX,
  }
  return map[key] ?? null
}

export function mintsConfigured(): boolean {
  return USDC_MINT !== PLACEHOLDER && NVDAX_MINT !== PLACEHOLDER
}

export function swapMintsConfigured(): boolean {
  return listSwapAssets().length >= 2
}
