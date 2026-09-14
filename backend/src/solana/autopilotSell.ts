import { AppError } from '../errors'
import { RuleModel, type Rule } from '../models'
import { swapController } from '../controllers/swap.controller'
import type { Bindings } from '../types/env'
import {
  getConnection,
  listConfiguredSwapTokens,
  loadSwapAuthority,
  payoutBuyTokens,
  quoteSwap,
} from './mockSwap'
import { getPriceMap } from './priceEngine'

export type AutopilotExecution = {
  ruleId: string
  asset: string
  soldAmount: number
  buyAmount: number
  buySymbol: string
  txid: string | null
  note: string
}

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
  env: Bindings,
  rule: Rule,
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
    throw new AppError(
      400,
      'Rule is not armed — deposit sell tokens first from chat.',
    )
  }

  const priceMap = await getPriceMap(env)
  const tokens = listConfiguredSwapTokens(env, priceMap)
  const usdc = tokens.find((t) => t.symbol === 'USDC')
  if (!usdc) {
    throw new AppError(500, 'USDC mint not configured')
  }

  const result = await swapController.complete(env, {
    userAddress: rule.userAddress,
    sellMint,
    buyMint: usdc.mint,
    sellAmount,
    depositSignature,
  })

  const note = `Autopilot sold ${sellAmount} ${rule.asset} → ${result.buyAmount} USDC`
  const now = new Date().toISOString()
  await RuleModel.updateOne(
    { id: rule.id },
    {
      $set: {
        status: 'paused',
        executedAt: now,
        executionTxid: result.payoutSignature,
        executionNote: note,
        updatedAt: now,
      },
    },
  )

  return {
    ruleId: rule.id,
    asset: rule.asset,
    soldAmount: sellAmount,
    buyAmount: result.buyAmount,
    buySymbol: 'USDC',
    txid: result.payoutSignature ?? null,
    note,
  }
}

/**
 * Complete an armed Autopilot buy: pay tokens already in treasury;
 * mint/payout the target stock to the user.
 */
export async function executeArmedBuy(
  env: Bindings,
  rule: Rule,
): Promise<AutopilotExecution> {
  if (rule.executedAt) {
    return {
      ruleId: rule.id,
      asset: rule.asset,
      soldAmount: rule.escrowSellAmount ?? 0,
      buyAmount: 0,
      buySymbol: rule.asset,
      txid: rule.executionTxid,
      note: rule.executionNote ?? 'Already executed',
    }
  }

  const payAmount = rule.escrowSellAmount
  const depositSignature = rule.escrowDepositSig
  const payMint = rule.mint

  if (!payAmount || !depositSignature || !payMint) {
    throw new AppError(
      400,
      'Buy is not armed — deposit pay tokens first from chat.',
    )
  }

  const priceMap = await getPriceMap(env)
  const tokens = listConfiguredSwapTokens(env, priceMap)
  const buyToken = resolveBuyToken(tokens, rule.asset)
  if (!buyToken) {
    throw new AppError(400, `No mint for ${rule.asset}`)
  }
  if (buyToken.mint === payMint) {
    throw new AppError(
      400,
      `Buy mint for ${rule.asset} matches pay mint — check token config.`,
    )
  }

  const result = await swapController.complete(env, {
    userAddress: rule.userAddress,
    sellMint: payMint,
    buyMint: buyToken.mint,
    sellAmount: payAmount,
    depositSignature,
  })

  const paySymbol = rule.payAsset ?? 'USDC'
  const note = `Autopilot bought ${result.buyAmount} ${rule.asset} ← ${payAmount} ${paySymbol}`
  const now = new Date().toISOString()
  await RuleModel.updateOne(
    { id: rule.id },
    {
      $set: {
        status: 'paused',
        executedAt: now,
        executionTxid: result.payoutSignature,
        executionNote: note,
        updatedAt: now,
      },
    },
  )

  return {
    ruleId: rule.id,
    asset: rule.asset,
    soldAmount: payAmount,
    buyAmount: result.buyAmount,
    buySymbol: rule.asset,
    txid: result.payoutSignature ?? null,
    note,
  }
}

/**
 * Paper/credit sell when no escrow (demo holdings only) — mints USDC only.
 */
export async function executePaperSell(
  env: Bindings,
  rule: Rule,
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

  const priceMap = await getPriceMap(env)
  const tokens = listConfiguredSwapTokens(env, priceMap)
  const usdc = tokens.find((t) => t.symbol === 'USDC')
  const sellToken = tokens.find(
    (t) =>
      t.symbol.toUpperCase() === rule.asset.toUpperCase() ||
      t.mint === rule.mint,
  )
  if (!usdc || !sellToken) {
    throw new AppError(400, `No mint for ${rule.asset}`)
  }

  const holding =
    holdings.find(
      (row) =>
        row.symbol.toUpperCase() === rule.asset.toUpperCase() ||
        row.mint === sellToken.mint,
    ) ?? null

  const sellAmount = computeSellQuantity(rule, holding, holdings)
  if (!(sellAmount > 0)) {
    throw new AppError(
      400,
      `No ${rule.asset} size to sell — faucet mock tokens first.`,
    )
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
  await RuleModel.updateOne(
    { id: rule.id },
    {
      $set: {
        status: 'paused',
        mint: sellToken.mint,
        escrowSellAmount: sellAmount,
        executedAt: now,
        executionTxid: txid,
        executionNote: note,
        updatedAt: now,
      },
    },
  )

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

export async function executeSizedPaperSell(
  env: Bindings,
  input: {
    rule: Rule
    sellAsset: string
    sellMint?: string | null
    sellAmount: number
    /** Allocation guards stay live; one-shot orders pause. */
    keepActive?: boolean
    notePrefix?: string
  },
): Promise<AutopilotExecution> {
  const { rule, sellAmount, keepActive = false } = input
  if (!(sellAmount > 0)) {
    throw new AppError(400, 'Sell amount must be > 0')
  }

  const priceMap = await getPriceMap(env)
  const tokens = listConfiguredSwapTokens(env, priceMap)
  const usdc = tokens.find((t) => t.symbol === 'USDC')
  const sellToken = tokens.find(
    (t) =>
      t.symbol.toUpperCase() === input.sellAsset.toUpperCase() ||
      (input.sellMint && t.mint === input.sellMint) ||
      t.mint === rule.mint,
  )
  if (!usdc || !sellToken) {
    throw new AppError(400, `No mint for ${input.sellAsset}`)
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

  const prefix = input.notePrefix ?? 'Autopilot'
  const note = `${prefix}: sold ${sellAmount} ${sellToken.symbol} → minted ${quote.buyAmount} USDC`
  const now = new Date().toISOString()

  if (keepActive) {
    await RuleModel.updateOne(
      { id: rule.id },
      {
        $set: {
          executionNote: note,
          updatedAt: now,
        },
      },
    )
  } else {
    await RuleModel.updateOne(
      { id: rule.id },
      {
        $set: {
          status: 'paused',
          mint: sellToken.mint,
          escrowSellAmount: sellAmount,
          executedAt: now,
          executionTxid: txid,
          executionNote: note,
          updatedAt: now,
        },
      },
    )
  }

  return {
    ruleId: rule.id,
    asset: sellToken.symbol,
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

function resolveBuyToken(
  tokens: Array<{
    symbol: string
    mint: string
    decimals: number
    priceUsd: number
  }>,
  asset: string,
) {
  const want = asset.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const exact = tokens.find(
    (t) => t.symbol.toUpperCase() === asset.toUpperCase(),
  )
  if (exact) return exact
  return (
    tokens.find((t) => {
      const have = t.symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
      return (
        have === want ||
        have === `${want}X` ||
        (want.endsWith('X') && have === want.slice(0, -1)) ||
        (want === 'GOOGL' && have === 'GOOGLX') ||
        (want === 'GOOGLE' && have === 'GOOGLX')
      )
    }) ?? null
  )
}
