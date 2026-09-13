import { LAMPORTS_PER_SOL, SOLANA_RPC_URL } from '@/lib/config'
import type { Holding } from '@/types/holding'

/** Wrapped SOL mint — used for USD price / icon lookups */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const USDT_MINT = 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB'

/** Common Mainnet mints → readable names */
const KNOWN_ASSETS: Record<string, string> = {
  [WSOL_MINT]: 'SOL',
  native: 'SOL',
  [USDC_MINT]: 'USDC',
  [USDT_MINT]: 'USDT',
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: 'JUP',
}

/** Fallback logos when DexScreener has no image */
const KNOWN_ICONS: Record<string, string> = {
  native:
    'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  [WSOL_MINT]:
    'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png',
  [USDC_MINT]:
    'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png',
  [USDT_MINT]:
    'https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png',
}

type RpcTokenAccount = {
  pubkey: string
  account: {
    data: {
      parsed?: {
        info?: {
          mint?: string
          tokenAmount?: {
            uiAmount: number | null
            decimals: number
            amount: string
          }
        }
      }
    }
  }
}

type RpcContextValue<T> = {
  context?: unknown
  value: T
}

type JsonRpcResult<T> = {
  result?: T
  error?: { message?: string }
}

type DexPair = {
  liquidity?: { usd?: number }
  priceUsd?: string
  baseToken?: { address?: string; symbol?: string }
  quoteToken?: { address?: string; symbol?: string }
  info?: { imageUrl?: string }
}

type TokenMarket = {
  priceUsd: number
  icon: string | null
  symbol: string | null
}

/** Small helper: POST JSON-RPC to our Solana RPC (Helius) */
async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(SOLANA_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  })

  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`)
  }

  const json = (await response.json()) as JsonRpcResult<T>
  if (json.error) {
    throw new Error(json.error.message ?? 'RPC error')
  }
  if (json.result === undefined) {
    throw new Error('RPC returned no result')
  }
  return json.result
}

function unwrapRpcValue<T>(result: T | RpcContextValue<T>): T {
  if (
    result !== null &&
    typeof result === 'object' &&
    'value' in (result as object)
  ) {
    return (result as RpcContextValue<T>).value
  }
  return result as T
}

async function getSolQuantity(owner: string): Promise<number> {
  const result = await rpc<number | RpcContextValue<number>>('getBalance', [
    owner,
  ])
  const lamports = unwrapRpcValue(result)
  return Number(lamports) / Number(LAMPORTS_PER_SOL)
}

async function getSplTokenRows(
  owner: string,
): Promise<Array<{ mint: string; quantity: number }>> {
  const rows: Array<{ mint: string; quantity: number }> = []

  for (const programId of [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID]) {
    try {
      const data = await rpc<
        RpcContextValue<RpcTokenAccount[]> | { value: RpcTokenAccount[] }
      >('getTokenAccountsByOwner', [
        owner,
        { programId },
        { encoding: 'jsonParsed', commitment: 'confirmed' },
      ])

      const accounts = unwrapRpcValue(data)

      for (const item of accounts) {
        const info = item.account.data.parsed?.info
        const mint = info?.mint
        const quantity = info?.tokenAmount?.uiAmount ?? 0
        if (!mint || quantity <= 0) {
          continue
        }
        rows.push({ mint, quantity })
      }
    } catch {
      // If one token program fails, still keep SOL + other tokens
    }
  }

  return rows
}

/**
 * Prices + icons from DexScreener (works in the browser; CoinGecko often blocks).
 * Stables fall back to $1 if missing.
 */
async function fetchTokenMarkets(
  mints: string[],
): Promise<Record<string, TokenMarket>> {
  const markets: Record<string, TokenMarket> = {}
  const lookupMints = [
    ...new Set(mints.map((m) => (m === 'native' ? WSOL_MINT : m))),
  ]

  // Sensible defaults for stables
  for (const stable of [USDC_MINT, USDT_MINT]) {
    if (lookupMints.includes(stable)) {
      markets[stable] = {
        priceUsd: 1,
        icon: KNOWN_ICONS[stable] ?? null,
        symbol: KNOWN_ASSETS[stable] ?? null,
      }
    }
  }

  if (lookupMints.length === 0) {
    return markets
  }

  try {
    // DexScreener accepts comma-separated mints
    const url = `https://api.dexscreener.com/latest/dex/tokens/${lookupMints.join(',')}`
    const res = await fetch(url)
    if (!res.ok) {
      return markets
    }

    const json = (await res.json()) as { pairs?: DexPair[] | null }
    const pairs = json.pairs ?? []

    for (const mint of lookupMints) {
      const matching = pairs.filter(
        (pair) => pair.baseToken?.address === mint && pair.priceUsd,
      )

      if (matching.length === 0) {
        continue
      }

      // Prefer the pool with the most USD liquidity
      matching.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0))
      const best = matching[0]
      const priceUsd = Number(best.priceUsd)
      if (!Number.isFinite(priceUsd) || priceUsd <= 0) {
        continue
      }

      markets[mint] = {
        priceUsd,
        icon: best.info?.imageUrl ?? KNOWN_ICONS[mint] ?? null,
        symbol: best.baseToken?.symbol ?? KNOWN_ASSETS[mint] ?? null,
      }
    }
  } catch {
    // Keep any defaults we already set
  }

  // Map native SOL to the same market as wrapped SOL
  if (markets[WSOL_MINT]) {
    markets.native = {
      ...markets[WSOL_MINT],
      icon: KNOWN_ICONS.native ?? markets[WSOL_MINT].icon,
      symbol: 'SOL',
    }
  } else if (mints.includes('native') || mints.includes(WSOL_MINT)) {
    // Last-resort icon even without a price
    markets.native = {
      priceUsd: 0,
      icon: KNOWN_ICONS.native,
      symbol: 'SOL',
    }
    markets[WSOL_MINT] = markets.native
  }

  return markets
}

function assetName(mint: string, marketSymbol: string | null): string {
  if (mint === 'native') {
    return 'SOL'
  }
  return (
    marketSymbol ??
    KNOWN_ASSETS[mint] ??
    `${mint.slice(0, 4)}…${mint.slice(-4)}`
  )
}

function tokenIcon(mint: string, marketIcon: string | null): string | null {
  return marketIcon ?? KNOWN_ICONS[mint] ?? null
}

/**
 * Load holdings for a connected wallet address.
 * 1) Read SOL + SPL balances from the chain (via Helius RPC)
 * 2) Fetch USD prices + icons (DexScreener)
 * 3) Compute USD value, SOL value, and allocation %
 */
export async function fetchHoldings(ownerAddress: string): Promise<Holding[]> {
  const solQuantity = await getSolQuantity(ownerAddress)
  const splRows = await getSplTokenRows(ownerAddress)

  const raw: Array<{ mint: string; quantity: number }> = []

  if (solQuantity > 0) {
    raw.push({ mint: 'native', quantity: solQuantity })
  }
  raw.push(...splRows)

  if (raw.length === 0) {
    return []
  }

  const markets = await fetchTokenMarkets(raw.map((row) => row.mint))
  const solUsd = markets.native?.priceUsd ?? markets[WSOL_MINT]?.priceUsd ?? 0

  const withValues = raw.map((row) => {
    const market =
      markets[row.mint] ?? markets[row.mint === 'native' ? WSOL_MINT : row.mint]
    const price = market?.priceUsd ?? 0
    const value = row.quantity * price
    // Convert USD value → SOL (for SOL itself, this equals quantity when priced)
    const valueInSol =
      solUsd > 0 ? value / solUsd : row.mint === 'native' ? row.quantity : 0

    return {
      asset: assetName(row.mint, market?.symbol ?? null),
      quantity: row.quantity,
      price,
      value,
      valueInSol,
      mint: row.mint,
      icon: tokenIcon(row.mint, market?.icon ?? null),
    }
  })

  const totalValue = withValues.reduce((sum, row) => sum + row.value, 0)

  const holdings: Holding[] = withValues.map((row) => ({
    ...row,
    // Percent of portfolio by USD value
    allocation: totalValue > 0 ? (row.value / totalValue) * 100 : 0,
  }))

  holdings.sort((a, b) => b.value - a.value)

  return holdings
}
