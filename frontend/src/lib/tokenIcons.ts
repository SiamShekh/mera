/** Shared token icon URLs (local first — reliable for hackathon). */
export const TOKEN_ICONS = {
  SOL: '/tokens/sol.svg',
  USDC: '/tokens/usdc.svg',
  SOLx: '/tokens/solx.svg',
  stX: '/tokens/stx.svg',
  NVDAx: '/tokens/nvdax.svg',
} as const

export function iconForSymbol(symbol: string): string {
  const key = symbol.trim()
  if (key in TOKEN_ICONS) {
    return TOKEN_ICONS[key as keyof typeof TOKEN_ICONS]
  }
  const upper = key.toUpperCase()
  if (upper === 'SOL' || upper === 'WSOL') return TOKEN_ICONS.SOL
  if (upper === 'USDC') return TOKEN_ICONS.USDC
  if (upper === 'SOLX') return TOKEN_ICONS.SOLx
  if (upper === 'STX') return TOKEN_ICONS.stX
  if (upper === 'NVDAX' || upper === 'NVDA') return TOKEN_ICONS.NVDAx
  return TOKEN_ICONS.SOL
}
