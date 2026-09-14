import { XSTOCKS_CATALOG } from '@/data/xstocks'

/** Shared token icon URLs (local first — reliable for hackathon). */
export const TOKEN_ICONS: Record<string, string> = {
  SOL: '/tokens/sol.svg',
  USDC: '/tokens/usdc.svg',
  SOLx: '/tokens/solx.svg',
  stX: '/tokens/stx.svg',
  NVDAx: '/tokens/nvdax.svg',
  ...Object.fromEntries(XSTOCKS_CATALOG.map((row) => [row.symbol, row.icon])),
}

export function iconForSymbol(symbol: string): string {
  const key = symbol.trim()
  if (key in TOKEN_ICONS) {
    return TOKEN_ICONS[key]
  }
  const upper = key.toUpperCase()
  if (upper === 'SOL' || upper === 'WSOL') return TOKEN_ICONS.SOL
  if (upper === 'USDC') return TOKEN_ICONS.USDC
  if (upper === 'SOLX') return TOKEN_ICONS.SOLx
  if (upper === 'STX') return TOKEN_ICONS.stX
  if (upper === 'NVDAX' || upper === 'NVDA') return TOKEN_ICONS.NVDAx

  for (const stock of XSTOCKS_CATALOG) {
    if (
      stock.symbol.toUpperCase() === upper ||
      stock.underlying.toUpperCase() === upper
    ) {
      return stock.icon
    }
  }

  return TOKEN_ICONS.SOL
}
