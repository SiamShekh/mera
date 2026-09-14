/**
 * Assets are not a fixed catalog — users can hold anything.
 * Optional aliases only help normalize common names → tickers.
 * Callers may also pass live `holdings` as soft hints for the LLM.
 */

import { XSTOCKS_CATALOG } from '../data/xstocks'

export type AssetAlias = {
  symbol: string
  aliases: string[]
}

/** Soft normalization only — never used as an allowlist. */
export const ASSET_ALIASES: AssetAlias[] = [
  { symbol: 'SOL', aliases: ['solana', 'sol'] },
  {
    symbol: 'USDC',
    aliases: ['usdc', 'usd coin', 'cash', 'stablecoin', 'stables'],
  },
  { symbol: 'USDT', aliases: ['usdt', 'tether'] },
  { symbol: 'BTC', aliases: ['bitcoin', 'btc', 'wbtc'] },
  { symbol: 'ETH', aliases: ['ethereum', 'eth', 'weth'] },
  { symbol: 'JUP', aliases: ['jupiter', 'jup'] },
  {
    symbol: 'NVDAx',
    aliases: [
      'nvidia',
      'nvda',
      'nvdax',
      'nvdia',
      'navidia',
      'nvidia stock',
      'nvidia xstock',
      'nvidia x stock',
    ],
  },
  { symbol: 'SOLx', aliases: ['solx', 'sol stock', 'tokenized sol'] },
  { symbol: 'stX', aliases: ['stx', 'stock x'] },
  ...XSTOCKS_CATALOG.map((row) => {
    const base = row.underlying.toLowerCase()
    const name = row.name.replace(/\s+xStock$/i, '').toLowerCase()
    return {
      symbol: row.symbol,
      aliases: [
        base,
        row.symbol.toLowerCase(),
        name,
        `${name} stock`,
        `${name} xstock`,
        `${base} stock`,
        `${base} xstock`,
      ].filter(Boolean),
    }
  }),
]

const TICKER_RE = /^[A-Za-z][A-Za-z0-9._-]{0,31}$/

/** Normalize free-text asset to a ticker; accepts any plausible symbol. */
export function normalizeAsset(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase()

  for (const entry of ASSET_ALIASES) {
    if (entry.symbol.toLowerCase() === lower) return entry.symbol
    if (entry.aliases.some((alias) => alias === lower)) return entry.symbol
  }

  // "nvidia stock" / "my solana bag"
  for (const entry of ASSET_ALIASES) {
    if (
      entry.aliases.some(
        (alias) => alias.length >= 3 && lower.includes(alias),
      ) ||
      lower.includes(entry.symbol.toLowerCase())
    ) {
      return entry.symbol
    }
  }

  if (!TICKER_RE.test(trimmed)) return null
  return trimmed.toUpperCase()
}

/** True if the string looks like a usable ticker (not membership in a catalog). */
export function isValidAssetTicker(symbol: string): boolean {
  return TICKER_RE.test(symbol.trim())
}
