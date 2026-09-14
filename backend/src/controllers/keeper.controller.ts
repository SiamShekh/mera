import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { Db } from '../db'
import { schema } from '../db'
import { listConfiguredSwapTokens } from '../solana/mockSwap'
import { ensureFresh, getPriceMap } from '../solana/priceEngine'
import type { Bindings } from '../types/env'
import type {
  KeeperTickBody,
  LinkPortfolioBody,
  LinkRuleBody,
} from '../validators/keeper'

export type KeeperTickResult = {
  dryRun: boolean
  evaluated: number
  actionable: Array<{
    ruleId: string
    type: string
    asset: string
    reason: string
    triggered: boolean
    assetValueUsd?: number
    portfolioValueUsd?: number
    profitPercent?: number
  }>
  skipped: number
  pricesUpdatedAt: string | null
  note: string
}

type HoldingRow = {
  mint: string
  symbol: string
  quantity: number
  valueUsd: number
}

/**
 * Keeper evaluates active rules against the live mock price book.
 * Live Devnet enforce needs KEEPER_SECRET_KEY + PROGRAM_ID + RPC (empty swap ok).
 */
export const keeperController = {
  async linkPortfolio(db: Db, body: LinkPortfolioBody) {
    const user = await db.query.users.findFirst({
      where: (fields, { eq: eqFn }) => eqFn(fields.address, body.userAddress),
    })
    if (!user) {
      throw new HTTPException(404, { message: 'User not found' })
    }

    const now = new Date().toISOString()
    await db
      .insert(schema.portfolios)
      .values({
        userAddress: body.userAddress,
        portfolioPda: body.portfolioPda,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: schema.portfolios.userAddress,
        set: {
          portfolioPda: body.portfolioPda,
          updatedAt: now,
        },
      })

    return { ok: true as const, portfolioPda: body.portfolioPda }
  },

  async linkRule(db: Db, body: LinkRuleBody) {
    const existing = await db.query.rules.findFirst({
      where: (fields, { eq: eqFn }) => eqFn(fields.id, body.ruleId),
    })
    if (!existing) {
      throw new HTTPException(404, { message: 'Rule not found' })
    }

    await db
      .update(schema.rules)
      .set({
        mint: body.mint,
        portfolioPda: body.portfolioPda,
        onChainRulePda: body.onChainRulePda,
        onChainRuleId: body.onChainRuleId,
        onChainStatus: 'active',
        status: 'active',
        updatedAt: new Date().toISOString(),
      })
      .where(eq(schema.rules.id, body.ruleId))

    return this.getRule(db, body.ruleId)
  },

  async getRule(db: Db, id: string) {
    const rule = await db.query.rules.findFirst({
      where: (fields, { eq: eqFn }) => eqFn(fields.id, id),
    })
    if (!rule) {
      throw new HTTPException(404, { message: 'Rule not found' })
    }
    return rule
  },

  async tick(
    db: Db,
    env: Bindings,
    body: KeeperTickBody,
  ): Promise<KeeperTickResult> {
    const book = await ensureFresh(db, env)
    const priceMap = await getPriceMap(db, env)
    const tokens = listConfiguredSwapTokens(env, priceMap)

    const rows = await db.query.rules.findMany({
      where: (fields, { eq: eqFn, and: andFn }) =>
        body.userAddress
          ? andFn(
              eqFn(fields.status, 'active'),
              eqFn(fields.userAddress, body.userAddress),
            )
          : eqFn(fields.status, 'active'),
    })

    const holdings = body.userAddress
      ? await fetchWalletHoldings(env, body.userAddress, tokens, priceMap)
      : synthesizeDemoHoldings(tokens)

    const portfolioValueUsd = holdings.reduce(
      (sum, row) => sum + row.valueUsd,
      0,
    )

    const actionable: KeeperTickResult['actionable'] = []
    let skipped = 0

    for (const rule of rows) {
      const evalResult = evaluateRule(
        rule,
        holdings,
        portfolioValueUsd,
        priceMap,
      )
      if (!evalResult) {
        skipped += 1
        continue
      }
      actionable.push({
        ruleId: rule.id,
        type: rule.type,
        asset: rule.asset,
        ...evalResult,
      })
    }

    const triggered = actionable.filter((row) => row.triggered)
    const canBroadcast =
      Boolean(env.KEEPER_SECRET_KEY) &&
      Boolean(env.PROGRAM_ID) &&
      Boolean(env.SOLANA_RPC_URL)

    const dryRun = body.dryRun || !canBroadcast

    return {
      dryRun,
      evaluated: rows.length,
      actionable,
      skipped,
      pricesUpdatedAt: book.updatedAt,
      note: dryRun
        ? triggered.length > 0
          ? `${triggered.length} rule(s) triggered on mock prices (dryRun — no enforce tx).`
          : 'No rules triggered at current mock prices.'
        : triggered.length > 0
          ? `${triggered.length} rule(s) triggered — broadcast enforce_rule with empty swap when wired.`
          : 'Keeper live; no rules triggered this tick.',
    }
  },
}

function evaluateRule(
  rule: {
    type: string
    asset: string
    unit: string
    value: number
    mint: string | null
  },
  holdings: HoldingRow[],
  portfolioValueUsd: number,
  priceMap: Record<string, number>,
): {
  triggered: boolean
  reason: string
  assetValueUsd?: number
  portfolioValueUsd?: number
  profitPercent?: number
} | null {
  const holding =
    holdings.find(
      (row) =>
        row.symbol.toUpperCase() === rule.asset.toUpperCase() ||
        (rule.mint && row.mint === rule.mint),
    ) ?? null

  const livePrice =
    (rule.mint ? priceMap[rule.mint] : undefined) ??
    priceMap[rule.asset] ??
    priceMap[rule.asset.toUpperCase()]

  if (rule.type === 'take_profit') {
    // Demo entry = anchor-like: profit vs "would be" at static anchor if we have price
    const anchor =
      rule.asset.toUpperCase() === 'USDC'
        ? 1
        : rule.asset.toUpperCase() === 'SOLX'
          ? 150
          : rule.asset.toUpperCase() === 'STX'
            ? 165
            : rule.asset.toUpperCase() === 'NVDAX' ||
                rule.asset.toUpperCase() === 'NVDA'
              ? 120
              : livePrice
    if (!livePrice || !anchor) {
      return {
        triggered: false,
        reason: `No live mock price for ${rule.asset}`,
      }
    }
    const profitPercent = ((livePrice - anchor) / anchor) * 100
    const threshold = rule.value
    const triggered =
      rule.unit === 'percent'
        ? profitPercent >= threshold
        : (holding?.valueUsd ?? 0) >= threshold

    return {
      triggered,
      profitPercent: Math.round(profitPercent * 100) / 100,
      assetValueUsd: holding?.valueUsd,
      portfolioValueUsd,
      reason: triggered
        ? `${rule.asset} +${profitPercent.toFixed(1)}% vs anchor (threshold ${threshold}${rule.unit === 'percent' ? '%' : ' USD'})`
        : `${rule.asset} at ${profitPercent.toFixed(1)}% vs anchor — below take-profit ${threshold}${rule.unit === 'percent' ? '%' : ''}`,
    }
  }

  if (rule.type === 'max_allocation' || rule.type === 'min_allocation') {
    if (portfolioValueUsd <= 0) {
      return {
        triggered: false,
        reason: 'Portfolio value is zero — deposit mock tokens or use faucet',
        portfolioValueUsd,
      }
    }
    const assetValueUsd = holding?.valueUsd ?? 0
    const allocationPct = (assetValueUsd / portfolioValueUsd) * 100

    if (rule.unit === 'percent') {
      const triggered =
        rule.type === 'max_allocation'
          ? allocationPct > rule.value
          : allocationPct < rule.value
      return {
        triggered,
        assetValueUsd,
        portfolioValueUsd,
        reason: triggered
          ? `${rule.asset} is ${allocationPct.toFixed(1)}% of portfolio (${rule.type} ${rule.value}%)`
          : `${rule.asset} at ${allocationPct.toFixed(1)}% — within ${rule.type} ${rule.value}%`,
      }
    }

    const triggered =
      rule.type === 'max_allocation'
        ? assetValueUsd > rule.value
        : assetValueUsd < rule.value
    return {
      triggered,
      assetValueUsd,
      portfolioValueUsd,
      reason: triggered
        ? `${rule.asset} value $${assetValueUsd.toFixed(2)} breaches ${rule.type} $${rule.value}`
        : `${rule.asset} value $${assetValueUsd.toFixed(2)} ok vs ${rule.type} $${rule.value}`,
    }
  }

  return null
}

function synthesizeDemoHoldings(
  tokens: Array<{ symbol: string; mint: string; priceUsd: number }>,
): HoldingRow[] {
  // Equal notional demo basket when no wallet — still lets allocation rules move with prices
  const notional = 1000
  return tokens.map((token) => {
    const quantity =
      token.priceUsd > 0 ? notional / token.priceUsd / tokens.length : 0
    return {
      mint: token.mint,
      symbol: token.symbol,
      quantity,
      valueUsd: notional / tokens.length,
    }
  })
}

async function fetchWalletHoldings(
  env: Bindings,
  owner: string,
  tokens: Array<{ symbol: string; mint: string; priceUsd: number }>,
  priceMap: Record<string, number>,
): Promise<HoldingRow[]> {
  const rpc = env.SOLANA_RPC_URL
  if (!rpc) {
    return synthesizeDemoHoldings(tokens)
  }

  try {
    const response = await fetch(rpc, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenAccountsByOwner',
        params: [
          owner,
          { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
          { encoding: 'jsonParsed', commitment: 'confirmed' },
        ],
      }),
    })
    if (!response.ok) {
      return synthesizeDemoHoldings(tokens)
    }
    const json = (await response.json()) as {
      result?: {
        value?: Array<{
          account: {
            data: {
              parsed?: {
                info?: {
                  mint?: string
                  tokenAmount?: { uiAmount: number | null }
                }
              }
            }
          }
        }>
      }
    }

    const qtyByMint = new Map<string, number>()
    for (const item of json.result?.value ?? []) {
      const mint = item.account.data.parsed?.info?.mint
      const qty = item.account.data.parsed?.info?.tokenAmount?.uiAmount ?? 0
      if (mint && qty > 0) {
        qtyByMint.set(mint, qty)
      }
    }

    const rows: HoldingRow[] = []
    for (const token of tokens) {
      const quantity = qtyByMint.get(token.mint) ?? 0
      if (quantity <= 0) continue
      const price = priceMap[token.mint] ?? token.priceUsd
      rows.push({
        mint: token.mint,
        symbol: token.symbol,
        quantity,
        valueUsd: quantity * price,
      })
    }
    return rows.length > 0 ? rows : synthesizeDemoHoldings(tokens)
  } catch {
    return synthesizeDemoHoldings(tokens)
  }
}
