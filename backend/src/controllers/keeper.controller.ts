import { AppError } from '../errors'
import {
  Portfolio,
  RuleModel,
  User,
  type Rule,
} from '../models'
import { leanRequired } from '../models/lean'
import {
  executeArmedBuy,
  executeArmedSell,
  executePaperSell,
  executeSizedPaperSell,
  type AutopilotExecution,
} from '../solana/autopilotSell'
import { listConfiguredSwapTokens } from '../solana/mockSwap'
import { ensureFresh, getPriceMap } from '../solana/priceEngine'
import type { Bindings } from '../types/env'
import type {
  ArmAutopilotBody,
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
  executions: AutopilotExecution[]
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
 * When dryRun=false: take-profit / stop-loss fills, and allocation rebalances → USDC.
 */
export const keeperController = {
  async linkPortfolio(body: LinkPortfolioBody) {
    const user = await User.findOne({ address: body.userAddress }).lean()
    if (!user) {
      throw new AppError(404, 'User not found')
    }

    const now = new Date().toISOString()
    await Portfolio.findOneAndUpdate(
      { userAddress: body.userAddress },
      {
        $set: {
          portfolioPda: body.portfolioPda,
          updatedAt: now,
        },
        $setOnInsert: {
          userAddress: body.userAddress,
          createdAt: now,
        },
      },
      { upsert: true },
    )

    return { ok: true as const, portfolioPda: body.portfolioPda }
  },

  async linkRule(body: LinkRuleBody) {
    const existing = await RuleModel.findOne({ id: body.ruleId }).lean()
    if (!existing) {
      throw new AppError(404, 'Rule not found')
    }

    await RuleModel.updateOne(
      { id: body.ruleId },
      {
        $set: {
          mint: body.mint,
          portfolioPda: body.portfolioPda,
          onChainRulePda: body.onChainRulePda,
          onChainRuleId: body.onChainRuleId,
          onChainStatus: 'active',
          status: 'active',
          updatedAt: new Date().toISOString(),
        },
      },
    )

    return this.getRule(body.ruleId)
  },

  /**
   * Arm Autopilot after the user deposits sell tokens to treasury (one wallet sign).
   * If the price condition is already true, settles immediately.
   */
  async armAutopilot(env: Bindings, body: ArmAutopilotBody) {
    const rule = await this.getRule(body.ruleId)
    if (rule.userAddress !== body.userAddress) {
      throw new AppError(403, 'Rule belongs to another wallet')
    }
    if (rule.status !== 'active' && !rule.executedAt) {
      throw new AppError(400, 'Rule is not active')
    }

    const now = new Date().toISOString()
    await RuleModel.updateOne(
      { id: body.ruleId },
      {
        $set: {
          mint: body.sellMint,
          escrowSellAmount: body.sellAmount,
          escrowDepositSig: body.depositSignature,
          updatedAt: now,
        },
      },
    )

    const armed = await this.getRule(body.ruleId)
    const priceMap = await getPriceMap(env)
    const tokens = listConfiguredSwapTokens(env, priceMap)
    const holdings = await fetchWalletHoldings(
      env,
      body.userAddress,
      tokens,
      priceMap,
    )
    const portfolioValueUsd = holdings.reduce(
      (sum, row) => sum + row.valueUsd,
      0,
    )
    const evalResult = evaluateRule(
      armed,
      holdings,
      portfolioValueUsd,
      priceMap,
    )

    if (evalResult?.triggered) {
      const isBuy =
        armed.type === 'market_buy' || armed.type === 'limit_buy'
      const execution = isBuy
        ? await executeArmedBuy(env, armed)
        : await executeArmedSell(env, armed)
      return {
        armed: true as const,
        settledNow: true as const,
        rule: await this.getRule(body.ruleId),
        execution,
        reason: evalResult.reason,
      }
    }

    return {
      armed: true as const,
      settledNow: false as const,
      rule: armed,
      execution: null,
      reason:
        evalResult?.reason ??
        'Order armed — Autopilot will sell automatically when the price hits.',
    }
  },

  async getRule(id: string): Promise<Rule> {
    const rule = await RuleModel.findOne({ id })
    if (!rule) {
      throw new AppError(404, 'Rule not found')
    }
    return leanRequired<Rule>(rule)
  },

  async tick(env: Bindings, body: KeeperTickBody): Promise<KeeperTickResult> {
    const book = await ensureFresh(env)
    const priceMap = await getPriceMap(env)
    const tokens = listConfiguredSwapTokens(env, priceMap)

    const filter: Record<string, unknown> = { status: 'active' }
    if (body.userAddress) {
      filter.userAddress = body.userAddress
    }
    const rows = (await RuleModel.find(filter).lean()).map((row) =>
      leanRequired<Rule>(row),
    )

    const holdingsByUser = new Map<string, HoldingRow[]>()
    async function holdingsFor(userAddress: string) {
      const cached = holdingsByUser.get(userAddress)
      if (cached) return cached
      const rowsForUser = await fetchWalletHoldings(
        env,
        userAddress,
        tokens,
        priceMap,
      )
      holdingsByUser.set(userAddress, rowsForUser)
      return rowsForUser
    }

    const actionable: KeeperTickResult['actionable'] = []
    const executions: AutopilotExecution[] = []
    let skipped = 0

    const canExecute =
      Boolean(env.SWAP_AUTHORITY_SECRET) && Boolean(env.SOLANA_RPC_URL)
    const dryRun = body.dryRun === true || !canExecute

    for (const rule of rows) {
      const holdings = await holdingsFor(rule.userAddress)
      const portfolioValueUsd = holdings.reduce(
        (sum, row) => sum + row.valueUsd,
        0,
      )

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

      if (!dryRun && evalResult.triggered) {
        try {
          if (rule.type === 'take_profit' || rule.type === 'stop_loss') {
            if (rule.escrowDepositSig && rule.escrowSellAmount && rule.mint) {
              executions.push(await executeArmedSell(env, rule))
            } else {
              executions.push(await executePaperSell(env, rule, holdings))
            }
          } else if (rule.type === 'market_buy' || rule.type === 'limit_buy') {
            if (rule.escrowDepositSig && rule.escrowSellAmount && rule.mint) {
              executions.push(await executeArmedBuy(env, rule))
            } else {
              executions.push({
                ruleId: rule.id,
                asset: rule.asset,
                soldAmount: 0,
                buyAmount: 0,
                buySymbol: rule.asset,
                txid: null,
                note: 'Buy triggered but not armed — waiting for pay-asset escrow from chat.',
              })
            }
          } else if (rule.type === 'max_allocation') {
            const trim = computeMaxAllocationTrim(
              rule,
              holdings,
              portfolioValueUsd,
              priceMap,
            )
            if (trim) {
              executions.push(
                await executeSizedPaperSell(env, {
                  rule,
                  sellAsset: trim.symbol,
                  sellMint: trim.mint,
                  sellAmount: trim.sellAmount,
                  keepActive: rule.unit === 'percent',
                  notePrefix: 'Allocation trim',
                }),
              )
            }
          } else if (
            rule.type === 'min_allocation' &&
            rule.asset.toUpperCase() === 'USDC'
          ) {
            const raise = computeUsdcFloorRaise(
              rule,
              holdings,
              portfolioValueUsd,
            )
            if (raise) {
              executions.push(
                await executeSizedPaperSell(env, {
                  rule,
                  sellAsset: raise.symbol,
                  sellMint: raise.mint,
                  sellAmount: raise.sellAmount,
                  keepActive: true,
                  notePrefix: 'Cash floor raise',
                }),
              )
            }
          }
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Autopilot sell failed'
          executions.push({
            ruleId: rule.id,
            asset: rule.asset,
            soldAmount: 0,
            buyAmount: 0,
            buySymbol: 'USDC',
            txid: null,
            note: message,
          })
        }
      }
    }

    const triggered = actionable.filter((row) => row.triggered)
    const sold = executions.filter((row) => row.txid)

    return {
      dryRun,
      evaluated: rows.length,
      actionable,
      executions,
      skipped,
      pricesUpdatedAt: book.updatedAt,
      note: dryRun
        ? triggered.length > 0
          ? `${triggered.length} rule(s) triggered (dryRun — no sell).`
          : 'No rules triggered at current mock prices.'
        : sold.length > 0
          ? `Autopilot sold ${sold.length} order(s).`
          : triggered.length > 0
            ? `${triggered.length} triggered — waiting for escrow or sell failed.`
            : 'Autopilot watching — no rules triggered.',
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
    limitPrice?: number | null
    payAsset?: string | null
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
        (rule.mint && row.mint === rule.mint) ||
        aliasesMatch(row.symbol, rule.asset),
    ) ?? null

  const livePrice = resolveLivePrice(priceMap, rule.asset, rule.mint)

  if (rule.type === 'market_buy' || rule.type === 'limit_buy') {
    // Always price the buy target (asset), never the pay mint stored on arm.
    const buyPrice = resolveLivePrice(priceMap, rule.asset, null)
    if (!buyPrice) {
      return {
        triggered: false,
        reason: `No live mock price for ${rule.asset}`,
      }
    }
    if (rule.type === 'market_buy') {
      return {
        triggered: true,
        assetValueUsd: holding?.valueUsd,
        portfolioValueUsd,
        reason: `${rule.asset} market buy — execute now (live $${buyPrice.toFixed(2)})`,
      }
    }
    const limit = rule.limitPrice ?? 0
    const triggered = limit > 0 && buyPrice <= limit
    return {
      triggered,
      assetValueUsd: holding?.valueUsd,
      portfolioValueUsd,
      reason: triggered
        ? `${rule.asset} at $${buyPrice.toFixed(2)} ≤ $${limit} — limit buy`
        : `${rule.asset} at $${buyPrice.toFixed(2)} — waiting for ≤ $${limit}`,
    }
  }

  if (rule.type === 'take_profit' || rule.type === 'stop_loss') {
    // Demo entry = anchor-like: profit/loss vs static anchor if we have price
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
    const threshold = rule.value

    if (rule.type === 'stop_loss') {
      if (rule.unit === 'amount') {
        const triggered = livePrice <= threshold
        return {
          triggered,
          assetValueUsd: holding?.valueUsd,
          portfolioValueUsd,
          reason: triggered
            ? `${rule.asset} at $${livePrice.toFixed(2)} ≤ $${threshold} — stop-loss sell`
            : `${rule.asset} at $${livePrice.toFixed(2)} — stop-loss waiting for ≤ $${threshold}`,
        }
      }
      const lossPercent = ((anchor - livePrice) / anchor) * 100
      const triggered = lossPercent >= threshold
      return {
        triggered,
        profitPercent: Math.round(-lossPercent * 100) / 100,
        assetValueUsd: holding?.valueUsd,
        portfolioValueUsd,
        reason: triggered
          ? `${rule.asset} −${lossPercent.toFixed(1)}% vs anchor (stop-loss ${threshold}%)`
          : `${rule.asset} at −${lossPercent.toFixed(1)}% — above stop-loss ${threshold}%`,
      }
    }

    // Absolute USD price trigger (unit=amount). value <= 0 = market sell now.
    if (rule.unit === 'amount') {
      const market = !(threshold > 0)
      const triggered = market || livePrice >= threshold
      return {
        triggered,
        assetValueUsd: holding?.valueUsd,
        portfolioValueUsd,
        reason: market
          ? `${rule.asset} market sell — execute now`
          : triggered
            ? `${rule.asset} at $${livePrice.toFixed(2)} ≥ $${threshold} — sell now`
            : `${rule.asset} at $${livePrice.toFixed(2)} — waiting for $${threshold}`,
      }
    }

    const profitPercent = ((livePrice - anchor) / anchor) * 100
    const triggered = profitPercent >= threshold

    return {
      triggered,
      profitPercent: Math.round(profitPercent * 100) / 100,
      assetValueUsd: holding?.valueUsd,
      portfolioValueUsd,
      reason: triggered
        ? `${rule.asset} +${profitPercent.toFixed(1)}% vs anchor (threshold ${threshold}%)`
        : `${rule.asset} at ${profitPercent.toFixed(1)}% vs anchor — below take-profit ${threshold}%`,
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

function computeMaxAllocationTrim(
  rule: { asset: string; unit: string; value: number; mint: string | null },
  holdings: HoldingRow[],
  portfolioValueUsd: number,
  priceMap: Record<string, number>,
): { symbol: string; mint: string; sellAmount: number } | null {
  const holding =
    holdings.find(
      (row) =>
        row.symbol.toUpperCase() === rule.asset.toUpperCase() ||
        (rule.mint && row.mint === rule.mint) ||
        aliasesMatch(row.symbol, rule.asset),
    ) ?? null
  if (!holding || !(holding.quantity > 0) || portfolioValueUsd <= 0) return null

  const assetValueUsd = holding.valueUsd
  const targetUsd =
    rule.unit === 'percent'
      ? (portfolioValueUsd * rule.value) / 100
      : rule.value
  const excessUsd = assetValueUsd - targetUsd
  if (!(excessUsd > 0)) return null

  const price =
    holding.quantity > 0
      ? holding.valueUsd / holding.quantity
      : resolveLivePrice(priceMap, rule.asset, rule.mint)
  if (!(price && price > 0)) return null

  const sellAmount = Math.min(holding.quantity, excessUsd / price)
  if (!(sellAmount > 0)) return null
  return { symbol: holding.symbol, mint: holding.mint, sellAmount }
}

function computeUsdcFloorRaise(
  rule: { unit: string; value: number },
  holdings: HoldingRow[],
  portfolioValueUsd: number,
): { symbol: string; mint: string; sellAmount: number } | null {
  const usdc =
    holdings.find((row) => row.symbol.toUpperCase() === 'USDC') ?? null
  const usdcUsd = usdc?.valueUsd ?? 0
  const targetUsd =
    rule.unit === 'percent'
      ? (portfolioValueUsd * rule.value) / 100
      : rule.value
  const deficitUsd = targetUsd - usdcUsd
  if (!(deficitUsd > 0)) return null

  const candidates = holdings
    .filter((row) => row.symbol.toUpperCase() !== 'USDC' && row.quantity > 0)
    .sort((a, b) => b.valueUsd - a.valueUsd)
  const source = candidates[0]
  if (!source) return null

  const price = source.valueUsd / source.quantity
  if (!(price > 0)) return null
  const sellAmount = Math.min(source.quantity, deficitUsd / price)
  if (!(sellAmount > 0)) return null
  return { symbol: source.symbol, mint: source.mint, sellAmount }
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

function aliasesMatch(a: string, b: string): boolean {
  const left = a.toUpperCase()
  const right = b.toUpperCase()
  if (left === right) return true
  const nvidia = new Set(['NVDA', 'NVDAX'])
  return nvidia.has(left) && nvidia.has(right)
}

function resolveLivePrice(
  priceMap: Record<string, number>,
  asset: string,
  mint: string | null,
): number | undefined {
  if (mint && priceMap[mint] != null) return priceMap[mint]
  if (priceMap[asset] != null) return priceMap[asset]

  const upper = asset.toUpperCase()
  for (const [key, value] of Object.entries(priceMap)) {
    if (key.toUpperCase() === upper) return value
  }
  if (upper === 'NVDA' || upper === 'NVDAX') {
    for (const [key, value] of Object.entries(priceMap)) {
      const k = key.toUpperCase()
      if (k === 'NVDA' || k === 'NVDAX') return value
    }
  }
  return undefined
}
