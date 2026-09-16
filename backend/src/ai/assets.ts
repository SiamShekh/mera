/**
 * Platform assets only. Unknown English words must never become fake tickers
 * (e.g. “No, I like to buy Google” must not compile as asset NO).
 */

import { XSTOCKS_CATALOG } from '../data/xstocks'

export type AssetAlias = {
  symbol: string
  aliases: string[]
}

export type TradableAsset = {
  symbol: string
  name: string
}

/** Soft aliases — never invent symbols outside this set + catalog. */
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
    symbol: 'BACx',
    aliases: [
      'bac',
      'bacx',
      'bank of america',
      'bank of america stock',
      'bofa',
      'b of a',
      'bank america',
    ],
  },
  {
    symbol: 'GOOGLx',
    aliases: [
      'googl',
      'googlx',
      'goog',
      'google',
      'google stock',
      'alphabet',
      'alphabet stock',
      'alphabet xstock',
    ],
  },
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

/** Filler / speech words that must never become tickers. */
const ENGLISH_TICKER_BLOCKLIST = new Set([
  'need',
  'needs',
  'needed',
  'no',
  'not',
  'yes',
  'yeah',
  'yep',
  'ok',
  'okay',
  'like',
  'likes',
  'want',
  'wants',
  'buy',
  'sell',
  'when',
  'then',
  'from',
  'with',
  'using',
  'another',
  'take',
  'multiple',
  'actions',
  'action',
  'market',
  'price',
  'stock',
  'stocks',
  'share',
  'shares',
  'token',
  'tokens',
  'please',
  'have',
  'this',
  'that',
  'into',
  'after',
  'before',
  'once',
  'down',
  'drop',
  'drops',
  'reach',
  'reaches',
  'current',
  'amount',
  'order',
  'orders',
  'plan',
  'rule',
  'rules',
  'cancel',
  'cancelled',
  'canceled',
  'delete',
  'unlock',
  'refund',
  'release',
  'forget',
  'nevermind',
  'the',
  'and',
  'for',
  'are',
  'was',
  'were',
  'been',
  'being',
  'your',
  'you',
  'our',
  'their',
  'i',
  'me',
  'my',
  'we',
  'it',
  'to',
  'of',
  'at',
  'in',
  'on',
  'by',
  'or',
  'if',
  'all',
  'more',
  'again',
  'back',
  'comes',
  'come',
  'goes',
  'go',
  'give',
  'different',
  'instruction',
  'message',
  'prompt',
  'now',
  'just',
  'also',
  'actually',
  'something',
  'anything',
])

const knownByLower = new Map<string, string>()

function remember(symbol: string, key: string) {
  const k = key.trim().toLowerCase()
  if (!k) return
  if (!knownByLower.has(k)) knownByLower.set(k, symbol)
}

for (const entry of ASSET_ALIASES) {
  remember(entry.symbol, entry.symbol)
  for (const alias of entry.aliases) remember(entry.symbol, alias)
}
for (const row of XSTOCKS_CATALOG) {
  remember(row.symbol, row.symbol)
  remember(row.symbol, row.underlying)
  remember(row.symbol, row.name)
}

const KNOWN_SYMBOLS = new Set(
  [...knownByLower.values()].map((s) => s.toUpperCase()),
)

export function listTradableAssets(): TradableAsset[] {
  const seen = new Set<string>()
  const out: TradableAsset[] = []
  for (const row of XSTOCKS_CATALOG) {
    const key = row.symbol.toUpperCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      symbol: row.symbol,
      name: row.name.replace(/\s+xStock$/i, ''),
    })
  }
  for (const extra of ['NVDAx', 'USDC', 'SOL'] as const) {
    if (seen.has(extra.toUpperCase())) continue
    seen.add(extra.toUpperCase())
    out.push({ symbol: extra, name: extra })
  }
  return out
}

export function isKnownPlatformAsset(symbol: string): boolean {
  const normalized = normalizeAsset(symbol)
  if (!normalized) return false
  return KNOWN_SYMBOLS.has(normalized.toUpperCase())
}

/**
 * Map free text to a platform ticker. Returns null instead of inventing
 * unknown coins from English (“NO”, “NEED”, “LIKE”).
 */
export function normalizeAsset(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const lower = trimmed.toLowerCase().replace(/[.!?]+$/g, '')
  if (ENGLISH_TICKER_BLOCKLIST.has(lower)) return null

  const exact = knownByLower.get(lower)
  if (exact) return exact

  if (/\s/.test(trimmed) || trimmed.length > 8) {
    let best: { symbol: string; len: number } | null = null
    for (const [alias, symbol] of knownByLower) {
      if (alias.length < 3) continue
      if (!lower.includes(alias)) continue
      if (!best || alias.length > best.len) {
        best = { symbol, len: alias.length }
      }
    }
    if (best) return best.symbol
  }

  if (!TICKER_RE.test(trimmed)) return null

  const asSymbol = knownByLower.get(trimmed.toLowerCase())
  if (asSymbol) return asSymbol

  // Tokenized tickers like AAPLx / GOOGLx only if already known.
  return null
}

/** True if the string is a known platform ticker after normalize. */
export function isValidAssetTicker(symbol: string): boolean {
  return normalizeAsset(symbol) != null
}
