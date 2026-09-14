import { eq } from 'drizzle-orm'
import { HTTPException } from 'hono/http-exception'

import type { Db } from '../db'
import { schema } from '../db'
import {
  getConnection,
  listConfiguredSwapTokens,
  loadSwapAuthority,
  payoutBuyTokens,
  quoteSwap,
} from './mockSwap'
import { getPriceMap } from './priceEngine'
import { swapController } from '../controllers/swap.controller'
import type { Bindings } from '../types/env'

export type AutopilotExecution = {
  ruleId: string
  asset: string
  soldAmount: number
  buyAmount: number
  buySymbol: string
  txid: string | null
  note: string
}

type RuleRow = typeof schema.rules.$inferSelect

type HoldingRow = {
  mint: string
  symbol: string
  quantity: number
  valueUsd: number
}

/**
 * Complete an armed Autopilot sell: escrow already sits in treasury;
 * mint USDC (or buy mint) to the user and pause the rule.
 */
export async function executeArmedSell(
  db: Db,
  env: Bindings,
  rule: RuleRow,
): Promise<AutopilotExecution> {
  if (rule.executedAt) {
    return {
      ruleId: rule.id,
      asset: rule.asset,
      soldAmount: rule.escrowSellAmount ?? 0,
      buyAmount: 0,
      buySymbol: 'USDC',
      txid: rule.executionTxid,
      note: rule.executionNote ?? 'Already executed',
    }
  }

  const sellAmount = rule.escrowSellAmount
  const depositSignature = rule.escrowDepositSig
  const sellMint = rule.mint

  if (!sellAmount || !depositSignature || !sellMint) {
    throw new HTTPException(400, {
      message: 'Rule is not armed — deposit sell tokens first from chat.',
    })
  }

  const priceMap = await getPriceMap(db, env)
  const tokens = listConfiguredSwapTokens(env, priceMap)
  const usdc = tokens.find((t) => t.symbol === 'USDC')
  if (!usdc) {
    throw new HTTPException(500, { message: 'USDC mint not configured' })
  }

  const result = await swapController.complete(env, db, {
    userAddress: rule.userAddress,
    sellMint,
    buyMint: usdc.mint,
    sellAmount,
    depositSignature,
  })

  const note = `Autopilot sold ${sellAmount} ${rule.asset} → ${result.buyAmount} USDC`
  const now = new Date().toISOString()
  await db
    .update(schema.rules)
    .set({
      status: 'paused',
      executedAt: now,
      executionTxid: result.payoutSignature,
      executionNote: note,
      updatedAt: now,
    })
    .where(eq(schema.rules.id, rule.id))

  return {
    ruleId: rule.id,
    asset: rule.asset,
    soldAmount: sellAmount,
    buyAmount: result.buyAmount,
    buySymbol: 'USDC',
    txid: result.payoutSignature,
    note,
  }
}

/**
 * Paper/credit sell when no escrow (demo holdings only) — mints USDC only.
 */
export async function executePaperSell(
  db: Db,
  env: Bindings,
  rule: RuleRow,
  holdings: HoldingRow[],
): Promise<AutopilotExecution> {
  if (rule.executedAt) {
    return {
      ruleId: rule.id,
      asset: rule.asset,
      soldAmount: 0,
      buyAmount: 0,
      buySymbol: 'USDC',
      txid: rule.executionTxid,
      note: rule.executionNote ?? 'Already executed',
    }
  }

  const priceMap = await getPriceMap(db, env)
  const tokens = listConfiguredSwapTokens(env, priceMap)
  const usdc = tokens.find((t) => t.symbol === 'USDC')
  const sellToken = tokens.find(
    (t) =>
      t.symbol.toUpperCase() === rule.asset.toUpperCase() ||
      t.mint === rule.mint,
  )
  if (!usdc || !sellToken) {
    throw new HTTPException(400, { message: `No mint for ${rule.asset}` })
  }

  const holding =
    holdings.find(
      (row) =>
        row.symbol.toUpperCase() === rule.asset.toUpperCase() ||
        row.mint === sellToken.mint,
    ) ?? null

  const sellAmount = computeSellQuantity(rule, holding, holdings)
  if (!(sellAmount > 0)) {
    throw new HTTPException(400, {
      message: `No ${rule.asset} size to sell — faucet mock tokens first.`,
    })
  }

  const quote = quoteSwap({
    tokens,
    sellMint: sellToken.mint,
    buyMint: usdc.mint,
    sellAmount,
  })

  const authority = loadSwapAuthority(env)
  const connection = getConnection(env)
  const txid = await payoutBuyTokens({
    connection,
    authority,
    userAddress: rule.userAddress,
    buyMint: usdc.mint,
    buyAmountUi: quote.buyAmount,
    decimals: usdc.decimals,
  })

  const note = `Autopilot paper-sold ${sellAmount} ${rule.asset} → minted ${quote.buyAmount} USDC (no escrow debit)`
  const now = new Date().toISOString()
  await db
    .update(schema.rules)
    .set({
      status: 'paused',
      mint: sellToken.mint,
      escrowSellAmount: sellAmount,
      executedAt: now,
      executionTxid: txid,
      executionNote: note,
      updatedAt: now,
    })
    .where(eq(schema.rules.id, rule.id))

  return {
    ruleId: rule.id,
    asset: rule.asset,
    soldAmount: sellAmount,
    buyAmount: quote.buyAmount,
    buySymbol: 'USDC',
    txid,
    note,
  }
}

export function computeSellQuantity(
  rule: {
    actionUnit: string | null
    actionValue: number | null
    sellBasis: string | null
    value: number
    unit: string
  },
  holding: HoldingRow | null,
  allHoldings: HoldingRow[],
): number {
  if (!holding || !(holding.quantity > 0)) return 0
  const actionValue = rule.actionValue ?? 0
  if (!(actionValue > 0)) return 0

  if (rule.actionUnit === 'amount') {
    const price = holding.valueUsd / holding.quantity
    if (!(price > 0)) return 0
    return Math.min(holding.quantity, actionValue / price)
  }

  // percent
  if (rule.sellBasis === 'portfolio') {
    const portfolio = allHoldings.reduce((sum, row) => sum + row.valueUsd, 0)
    const targetUsd = (portfolio * actionValue) / 100
    const price = holding.valueUsd / holding.quantity
    if (!(price > 0)) return 0
    return Math.min(holding.quantity, targetUsd / price)
  }

  return (holding.quantity * actionValue) / 100
}
