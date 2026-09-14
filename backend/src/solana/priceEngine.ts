import { desc, eq } from 'drizzle-orm'

import type { Db } from '../db'
import { mockPrices, priceTicks } from '../db/schema'
import type { Bindings } from '../types/env'

const TICK_INTERVAL_MS = 15_000
const MAX_TICKS_PER_MINT = 120

export type PriceAssetSeed = {
  symbol: string
  mint: string
  anchorUsd: number
  /** USDC stays pegged. */
  pegged?: boolean
}

export type LivePrice = {
  mint: string
  symbol: string
  priceUsd: number
  anchorUsd: number
  changePct: number
  updatedAt: string
}

export type PriceBook = {
  updatedAt: string | null
  prices: LivePrice[]
  ticks: Array<{
    mint: string
    symbol: string
    priceUsd: number
    changePct: number
    createdAt: string
  }>
}

const ANCHORS: Record<string, number> = {
  USDC: 1,
  NVDAx: 120,
  SOLx: 150,
  stX: 165,
}

/** Assets to simulate from env mint bindings. */
export function seedAssetsFromEnv(env: Bindings): PriceAssetSeed[] {
  const rows: Array<{ symbol: string; mint?: string; pegged?: boolean }> = [
    { symbol: 'USDC', mint: env.MOCK_USDC_MINT, pegged: true },
    { symbol: 'NVDAx', mint: env.MOCK_NVDAX_MINT },
    { symbol: 'SOLx', mint: env.MOCK_SOLX_MINT },
    { symbol: 'stX', mint: env.MOCK_STX_MINT },
  ]
  return rows
    .filter((row) => row.mint && row.mint.length >= 32)
    .map((row) => ({
      symbol: row.symbol,
      mint: row.mint as string,
      anchorUsd: ANCHORS[row.symbol] ?? 100,
      pegged: row.pegged,
    }))
}

/** Mulberry32 PRNG — deterministic per (mint, unixMinute). */
function mulberry32(seed: number): () => number {
  let t = seed >>> 0
  return () => {
    t += 0x6d2b79f5
    let r = Math.imul(t ^ (t >>> 15), 1 | t)
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(mint: string, unixMinute: number): number {
  let h = unixMinute >>> 0
  for (let i = 0; i < mint.length; i += 1) {
    h = Math.imul(h ^ mint.charCodeAt(i), 0x9e3779b1)
  }
  return h >>> 0
}

/**
 * One crypto-like minute bar:
 * - mostly ±0.3–1.5%
 * - ~10% fat tails ±4–12%
 * - soft mean reversion + hard band vs anchor
 */
export function nextSimulatedPrice(
  mint: string,
  current: number,
  anchor: number,
  unixMinute: number,
  pegged: boolean,
): { price: number; changePct: number } {
  if (pegged) {
    return { price: anchor, changePct: 0 }
  }

  const rand = mulberry32(hashSeed(mint, unixMinute))
  const u1 = Math.max(1e-9, rand())
  const u2 = rand()
  // Box–Muller → approx N(0,1)
  const gaussian = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

  const fatTail = rand() < 0.1
  let ret = fatTail
    ? (rand() < 0.5 ? -1 : 1) * (0.04 + rand() * 0.08)
    : gaussian * 0.009

  // Clip normal / fat separately
  if (!fatTail) {
    const mag = Math.min(0.015, Math.max(0.003, Math.abs(ret)))
    ret = Math.sign(ret || 1) * mag * (0.5 + rand())
  } else {
    ret = Math.max(-0.12, Math.min(0.12, ret))
  }

  // Mean reversion toward anchor
  const drift = ((anchor - current) / anchor) * 0.08
  let next = current * (1 + ret + drift)

  const lo = anchor * 0.4
  const hi = anchor * 2.5
  next = Math.max(lo, Math.min(hi, next))

  // Keep readable precision
  next = Math.round(next * 1e6) / 1e6
  const changePct = current > 0 ? ((next - current) / current) * 100 : 0
  return { price: next, changePct: Math.round(changePct * 100) / 100 }
}

export async function ensureSeeded(db: Db, env: Bindings): Promise<void> {
  const assets = seedAssetsFromEnv(env)
  if (assets.length === 0) {
    return
  }

  const existing = await db.select().from(mockPrices)
  const byMint = new Set(existing.map((row) => row.mint))
  const now = new Date().toISOString()

  for (const asset of assets) {
    if (byMint.has(asset.mint)) {
      continue
    }
    await db.insert(mockPrices).values({
      mint: asset.mint,
      symbol: asset.symbol,
      priceUsd: asset.anchorUsd,
      anchorUsd: asset.anchorUsd,
      updatedAt: now,
    })
    await db.insert(priceTicks).values({
      id: crypto.randomUUID(),
      mint: asset.mint,
      priceUsd: asset.anchorUsd,
      changePct: 0,
      createdAt: now,
    })
  }
}

async function pruneTicks(db: Db, mint: string): Promise<void> {
  const rows = await db
    .select({ id: priceTicks.id })
    .from(priceTicks)
    .where(eq(priceTicks.mint, mint))
    .orderBy(desc(priceTicks.createdAt))

  const drop = rows.slice(MAX_TICKS_PER_MINT)
  for (const row of drop) {
    await db.delete(priceTicks).where(eq(priceTicks.id, row.id))
  }
}

/** Advance all assets by one minute bar. */
export async function stepAll(
  db: Db,
  env: Bindings,
  minuteOffset = 0,
): Promise<PriceBook> {
  await ensureSeeded(db, env)
  const assets = seedAssetsFromEnv(env)
  const peggedByMint = new Map(assets.map((a) => [a.mint, Boolean(a.pegged)]))
  const rows = await db.select().from(mockPrices)
  const unixMinute = Math.floor(Date.now() / TICK_INTERVAL_MS) - minuteOffset
  const now = new Date().toISOString()

  for (const row of rows) {
    const { price, changePct } = nextSimulatedPrice(
      row.mint,
      row.priceUsd,
      row.anchorUsd,
      unixMinute,
      peggedByMint.get(row.mint) ?? row.symbol === 'USDC',
    )
    await db
      .update(mockPrices)
      .set({ priceUsd: price, updatedAt: now })
      .where(eq(mockPrices.mint, row.mint))
    await db.insert(priceTicks).values({
      id: crypto.randomUUID(),
      mint: row.mint,
      priceUsd: price,
      changePct,
      createdAt: now,
    })
    await pruneTicks(db, row.mint)
  }

  return getPriceBook(db)
}

/**
 * If last update older than ~60s, step once (local wrangler + API consumers).
 * Catch up at most a few missed minutes so cold starts don’t jump wildly.
 */
export async function ensureFresh(db: Db, env: Bindings): Promise<PriceBook> {
  await ensureSeeded(db, env)
  const rows = await db.select().from(mockPrices)
  if (rows.length === 0) {
    return { updatedAt: null, prices: [], ticks: [] }
  }

  const newest = rows.reduce((max, row) => {
    const t = Date.parse(row.updatedAt)
    return Number.isFinite(t) && t > max ? t : max
  }, 0)

  const age = Date.now() - newest
  if (age < TICK_INTERVAL_MS) {
    return getPriceBook(db)
  }

  const missed = Math.min(5, Math.max(1, Math.floor(age / TICK_INTERVAL_MS)))
  let book = await getPriceBook(db)
  for (let i = missed - 1; i >= 0; i -= 1) {
    book = await stepAll(db, env, i)
  }
  return book
}

export async function getPriceBook(db: Db): Promise<PriceBook> {
  const rows = await db.select().from(mockPrices)
  if (rows.length === 0) {
    return { updatedAt: null, prices: [], ticks: [] }
  }

  const tickRows = await db
    .select()
    .from(priceTicks)
    .orderBy(desc(priceTicks.createdAt))
    .limit(80)

  const symbolByMint = new Map(rows.map((r) => [r.mint, r.symbol]))

  // changePct vs previous tick for each mint
  const latestChange = new Map<string, number>()
  for (const tick of tickRows) {
    if (!latestChange.has(tick.mint)) {
      latestChange.set(tick.mint, tick.changePct)
    }
  }

  const prices: LivePrice[] = rows.map((row) => ({
    mint: row.mint,
    symbol: row.symbol,
    priceUsd: row.priceUsd,
    anchorUsd: row.anchorUsd,
    changePct: latestChange.get(row.mint) ?? 0,
    updatedAt: row.updatedAt,
  }))

  const updatedAt =
    rows
      .map((r) => r.updatedAt)
      .sort()
      .at(-1) ?? null

  return {
    updatedAt,
    prices,
    ticks: tickRows.map((tick) => ({
      mint: tick.mint,
      symbol: symbolByMint.get(tick.mint) ?? '?',
      priceUsd: tick.priceUsd,
      changePct: tick.changePct,
      createdAt: tick.createdAt,
    })),
  }
}

/** Map mint → live USD (for swap / portfolio / keeper). */
export async function getPriceMap(
  db: Db,
  env: Bindings,
): Promise<Record<string, number>> {
  const book = await ensureFresh(db, env)
  const map: Record<string, number> = {}
  for (const row of book.prices) {
    map[row.mint] = row.priceUsd
    map[row.symbol] = row.priceUsd
  }
  return map
}
