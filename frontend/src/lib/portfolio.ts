import { API_URL, LAMPORTS_PER_SOL, SOLANA_RPC_URL } from '@/lib/config'
import {
  MOCK_USD_PRICES,
  NVDAX_MINT,
  SOLX_MINT,
  STX_MINT,
  USDC_MINT,
} from '@/lib/mints'
import { TOKEN_ICONS } from '@/lib/tokenIcons'
import { XSTOCKS_CATALOG } from '@/data/xstocks'
import type { Holding } from '@/types/holding'

/** Wrapped SOL mint — used for USD price / icon lookups */
export const WSOL_MINT = 'So11111111111111111111111111111111111111112'

const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'
const TOKEN_2022_PROGRAM_ID = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'

/** Devnet mock mints → readable names (never "Unknown") */
const KNOWN_ASSETS: Record<string, string> = {
  [WSOL_MINT]: 'SOL',
  native: 'SOL',
  [USDC_MINT]: 'USDC',
  [NVDAX_MINT]: 'NVDAx',
  [SOLX_MINT]: 'SOLx',
  [STX_MINT]: 'stX',
  ...Object.fromEntries(XSTOCKS_CATALOG.map((row) => [row.mint, row.symbol])),
}

/** Local icons — same as TokenIcon / public/tokens */
const KNOWN_ICONS: Record<string, string> = {
  native: TOKEN_ICONS.SOL,
  [WSOL_MINT]: TOKEN_ICONS.SOL,
  [USDC_MINT]: TOKEN_ICONS.USDC,
  [NVDAX_MINT]: TOKEN_ICONS.NVDAx,
  [SOLX_MINT]: TOKEN_ICONS.SOLx,
  [STX_MINT]: TOKEN_ICONS.stX,
  ...Object.fromEntries(XSTOCKS_CATALOG.map((row) => [row.mint, row.icon])),
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

type TokenMarket = {
  priceUsd: number
  priceChange24h: number | null
  icon: string | null
  symbol: string | null
}

/** Small helper: POST JSON-RPC to Devnet RPC */
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

async function getSplTokenRows(owner: string): Promise<
  Array<{
    mint: string
    quantity: number
    decimals: number
    tokenProgram: string
  }>
> {
  const rows: Array<{
    mint: string
    quantity: number
    decimals: number
    tokenProgram: string
  }> = []

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
        const decimals = info?.tokenAmount?.decimals ?? 0
        if (!mint || quantity <= 0) {
          continue
        }
        rows.push({ mint, quantity, decimals, tokenProgram: programId })
      }
    } catch {
      // If one token program fails, still keep SOL + other tokens
    }
  }

  return rows
}

/**
 * Devnet mock prices: prefer live backend oracle, fall back to static map.
 */
async function fetchTokenMarkets(
  mints: string[],
): Promise<Record<string, TokenMarket>> {
  const markets: Record<string, TokenMarket> = {}
  const lookupMints = [
    ...new Set(mints.map((m) => (m === 'native' ? WSOL_MINT : m))),
  ]

  const DEMO_SOL_USD = 150
  const liveByMint = await fetchLiveMockPrices()

  for (const mint of lookupMints) {
    const live = liveByMint[mint]
    if (live) {
      markets[mint] = {
        priceUsd: live.priceUsd,
        priceChange24h: live.changePct,
        icon: KNOWN_ICONS[mint] ?? null,
        symbol: live.symbol ?? KNOWN_ASSETS[mint] ?? null,
      }
      continue
    }
    const mock = MOCK_USD_PRICES[mint]
    if (typeof mock === 'number') {
      markets[mint] = {
        priceUsd: mock,
        priceChange24h: 0,
        icon: KNOWN_ICONS[mint] ?? null,
        symbol: KNOWN_ASSETS[mint] ?? null,
      }
      continue
    }
    if (mint === WSOL_MINT) {
      markets[mint] = {
        priceUsd: liveByMint[SOLX_MINT]?.priceUsd ?? DEMO_SOL_USD,
        priceChange24h: liveByMint[SOLX_MINT]?.changePct ?? 0,
        icon: KNOWN_ICONS[mint] ?? null,
        symbol: 'SOL',
      }
    }
  }

  if (markets[WSOL_MINT]) {
    markets.native = {
      ...markets[WSOL_MINT],
      icon: KNOWN_ICONS.native ?? markets[WSOL_MINT].icon,
      symbol: 'SOL',
    }
  } else if (mints.includes('native') || mints.includes(WSOL_MINT)) {
    markets.native = {
      priceUsd: DEMO_SOL_USD,
      priceChange24h: null,
      icon: KNOWN_ICONS.native,
      symbol: 'SOL',
    }
    markets[WSOL_MINT] = markets.native
  }

  return markets
}

async function fetchLiveMockPrices(): Promise<
  Record<string, { priceUsd: number; changePct: number; symbol: string }>
> {
  try {
    const response = await fetch(`${API_URL}/prices`)
    if (!response.ok) {
      return {}
    }
    const json = (await response.json()) as {
      prices?: Array<{
        mint: string
        symbol: string
        priceUsd: number
        changePct: number
      }>
    }
    const map: Record<
      string,
      { priceUsd: number; changePct: number; symbol: string }
    > = {}
    for (const row of json.prices ?? []) {
      map[row.mint] = {
        priceUsd: row.priceUsd,
        changePct: row.changePct,
        symbol: row.symbol,
      }
    }
    return map
  } catch {
    return {}
  }
}

function assetName(mint: string, marketSymbol: string | null): string {
  if (mint === 'native') {
    return 'SOL'
  }
  // Prefer our known ticker so Autopilot matching stays stable (not display names).
  const known = KNOWN_ASSETS[mint] ?? marketSymbol
  if (known) {
    return known
  }
  return `${mint.slice(0, 4)}…${mint.slice(-4)}`
}

function tokenIcon(mint: string, marketIcon: string | null): string | null {
  return marketIcon ?? KNOWN_ICONS[mint] ?? null
}

/**
 * Load holdings for a connected wallet address.
 * 1) Read SOL + SPL balances from the chain (Devnet RPC)
 * 2) Apply fixed mock USD prices for demo mints
 * 3) Compute USD value, SOL value, and allocation %
 */
export async function fetchHoldings(ownerAddress: string): Promise<Holding[]> {
  const solQuantity = await getSolQuantity(ownerAddress)
  const splRows = await getSplTokenRows(ownerAddress)

  const raw: Array<{
    mint: string
    quantity: number
    decimals: number
    tokenProgram: string | null
  }> = []

  if (solQuantity > 0) {
    raw.push({
      mint: 'native',
      quantity: solQuantity,
      decimals: 9,
      tokenProgram: null,
    })
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
      decimals: row.decimals,
      tokenProgram: row.tokenProgram,
      price,
      priceChange24h: market?.priceChange24h ?? null,
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
