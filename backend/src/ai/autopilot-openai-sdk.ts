import {
  Agent,
  run,
  setDefaultOpenAIKey,
  tool,
  user,
  assistant,
  type AgentInputItem,
} from '@openai/agents'
import { z } from 'zod'

import {
  isKnownPlatformAsset,
  listTradableAssets,
  normalizeAsset,
} from './assets'
import { interpretRules } from './interpret'
import { fallbackCompileMany, brokerClarifyMessage } from './fallback'
import { resolveCancelTurn, type OpenOrderHint } from './cancel'
import {
  compiledRuleSchema,
  isSellSideRule,
  type CompiledRule,
} from '../validators/compile'

export type HoldingHint = {
  symbol: string
  quantity: number
  priceUsd: number
}

export type AutopilotSdkResult =
  | {
      ok: true
      kind: 'clarify' | 'propose' | 'cannot' | 'chat' | 'execute' | 'cancel'
      reply: string
      rule: CompiledRule | null
      rules: CompiledRule[]
      interpretation: string | null
      provider: 'openai'
      cancelRuleIds?: string[]
      clearPending?: boolean
    }
  | { ok: false; error: string }

const agentPlanSchema = z.object({
  kind: z.enum(['clarify', 'propose', 'cannot', 'chat', 'execute', 'cancel']),
  reply: z.string().min(1),
  rules: z.array(z.unknown()).max(20).default([]),
  cancelRuleIds: z.array(z.string()).max(20).optional().default([]),
})

export type AutopilotSdkContext = {
  holdings: HoldingHint[]
  walletConnected: boolean
  pendingRules: CompiledRule[]
  pendingCancelIds: string[]
  openOrders: OpenOrderHint[]
}

function holdingsSummary(holdings: HoldingHint[]): string {
  if (holdings.length === 0) {
    return 'HOLDINGS_UNKNOWN — do not invent balances. For liquidate, ask the user to connect a wallet or use get_wallet_holdings after they connect.'
  }
  return holdings
    .map(
      (row) =>
        `${row.symbol}: qty ${row.quantity}, ~$${row.priceUsd.toFixed(2)}`,
    )
    .join(' · ')
}

function buildLiquidateRules(holdings: HoldingHint[]): CompiledRule[] {
  const sells: CompiledRule[] = []
  for (const row of holdings) {
    const symbol = normalizeAsset(row.symbol) ?? row.symbol
    const upper = symbol.toUpperCase()
    if (upper === 'USDC' || upper === 'SOL') continue
    if (!(row.quantity > 0)) continue
    sells.push({
      type: 'take_profit',
      asset: symbol,
      unit: 'amount',
      value: 0,
      actionUnit: 'percent',
      actionValue: 100,
      sellBasis: 'position',
    })
  }
  return sells
}

function createAutopilotTools(userMessage: string) {
  const getWalletHoldings = tool({
    name: 'get_wallet_holdings',
    description:
      'Return wallet balances. Optional for future buy ladders; useful before liquidate-now.',
    parameters: z.object({}),
    execute: async (_args, runContext) => {
      const ctx = runContext?.context as AutopilotSdkContext | undefined
      const holdings = ctx?.holdings ?? []
      return {
        walletConnected: Boolean(ctx?.walletConnected),
        holdings,
        nonUsdcHoldings: holdings.filter((row) => {
          const s = (normalizeAsset(row.symbol) ?? row.symbol).toUpperCase()
          return s !== 'USDC' && s !== 'SOL' && row.quantity > 0
        }),
      }
    },
  })

  const buildLiquidateToUsdc = tool({
    name: 'build_liquidate_to_usdc',
    description:
      'Sell 100% of every non-USDC holding into USDC right now. NOT for “buy now, sell later at $X”.',
    parameters: z.object({
      reason: z.string(),
    }),
    execute: async (_args, runContext) => {
      const ctx = runContext?.context as AutopilotSdkContext | undefined
      const holdings = ctx?.holdings ?? []
      const rules = buildLiquidateRules(holdings)
      if (rules.length === 0) {
        return {
          ok: false as const,
          error:
            holdings.length === 0
              ? 'No holdings reported.'
              : 'No non-USDC stock balances to sell.',
          rules: [],
          interpretation: null,
        }
      }
      return {
        ok: true as const,
        rules,
        interpretation: interpretRules(rules),
      }
    },
  })

  const normalizeTicker = tool({
    name: 'normalize_ticker',
    description:
      'Map a company name to a platform ticker. Returns null if it is not a stock we trade — never invent a coin.',
    parameters: z.object({ raw: z.string() }),
    execute: async ({ raw }) => ({
      raw,
      symbol: normalizeAsset(raw),
      known: Boolean(normalizeAsset(raw)),
    }),
  })

  const listAssets = tool({
    name: 'list_tradable_assets',
    description:
      'List tokenized stocks and cash this platform can trade. Use when the user names something unknown.',
    parameters: z.object({}),
    execute: async () => ({
      assets: listTradableAssets(),
    }),
  })

  const compileBrokerPlan = tool({
    name: 'compile_broker_plan',
    description:
      'Compile a natural-language broker instruction (buy ladders, “down by $2 more”, take-profit) into platform rules. Call this first for multi-step buy/sell talk.',
    parameters: z.object({
      instruction: z.string().describe('Broker-style instruction'),
    }),
    execute: async ({ instruction }, runContext) => {
      const ctx = runContext?.context as AutopilotSdkContext | undefined
      const text = instruction.trim() || userMessage
      const rules = fallbackCompileMany(text, ctx?.holdings) ?? []
      return {
        ok: rules.length > 0,
        rules,
        interpretation: rules.length > 0 ? interpretRules(rules) : null,
      }
    },
  })

  const validateRules = tool({
    name: 'validate_rules',
    description: 'Validate rule objects before proposing them.',
    parameters: z.object({
      rules: z.array(z.unknown()).max(20),
    }),
    execute: async ({ rules }) => {
      const valid: CompiledRule[] = []
      const errors: string[] = []
      for (const [i, blob] of rules.entries()) {
        const parsed = compiledRuleSchema.safeParse(blob)
        if (parsed.success) {
          if (
            isSellSideRule(parsed.data) &&
            parsed.data.asset.toUpperCase() === 'USDC'
          ) {
            errors.push(`rule[${i}]: do not sell USDC`)
            continue
          }
          valid.push(parsed.data)
        } else {
          errors.push(`rule[${i}]: ${parsed.error.message}`)
        }
      }
      return {
        ok: errors.length === 0,
        valid,
        errors,
        interpretation: valid.length > 0 ? interpretRules(valid) : null,
      }
    },
  })

  return [
    compileBrokerPlan,
    normalizeTicker,
    listAssets,
    validateRules,
    getWalletHoldings,
    buildLiquidateToUsdc,
  ]
}

function buildInstructions(ctx: AutopilotSdkContext): string {
  const pending =
    ctx.pendingRules.length > 0
      ? `Pending plan awaiting confirmation (${ctx.pendingRules.length} rule(s)): ${JSON.stringify(ctx.pendingRules)}. If the user affirms (yes/confirm/ok), return kind "execute" with the SAME rules.`
      : 'No pending plan.'

  const pendingCancel =
    ctx.pendingCancelIds.length > 0
      ? `Pending cancel ids: ${ctx.pendingCancelIds.join(', ')}. If they affirm, kind "cancel" with those ids and empty rules.`
      : 'No pending cancel.'

  const open =
    ctx.openOrders.length > 0
      ? `Open unfilled orders:\n${ctx.openOrders
          .map((order) => {
            const lock =
              order.escrowAmount != null && order.escrowAmount > 0
                ? ` locked ${order.escrowAmount}`
                : ''
            return `- ${order.id}: ${order.type} ${order.asset}${lock}`
          })
          .join('\n')}`
      : 'No open orders to cancel.'

  return `You are Mera Autopilot — a skilled retail broker for tokenized stocks on this platform (xStocks like GOOGLx, AAPLx, BACx, paid in USDC).
Users talk the way they talk to a human broker: messy English, “No I meant Google”, ladders, “when it comes back”. Understand that. They should never need tickers or schemas.

Holdings: ${holdingsSummary(ctx.holdings)}
Wallet: ${ctx.walletConnected ? 'connected' : 'may be disconnected'}
${open}
${pending}
${pendingCancel}

Tools (use them):
- compile_broker_plan — FIRST for any buy/sell instruction
- normalize_ticker — Google→GOOGLx, Apple→AAPLx. null = we do not trade that name
- list_tradable_assets — if the name is unknown
- validate_rules — before propose
- get_wallet_holdings / build_liquidate_to_usdc — liquidate NOW to USDC only

Output: { "kind", "reply", "rules", "cancelRuleIds" }  kind = clarify|propose|cannot|chat|execute|cancel

Hard rules:
- NEVER invent a ticker from English (No, Need, Like, I, Want). If you cannot map the company, kind=clarify and ask them to rephrase. Do not pick a random coin.
- Leading “No,” / “Actually,” is speech, not an asset.
- Cancel / delete / unlock / refund / “put the money back” / “delete that order/rule/scroll” is NOT a new trade. Use kind propose with cancelRuleIds from Open orders, empty rules. Confirmed cancel → kind cancel. Refund locked tokens to the spendable wallet.
- “Buy Apple at the current price and sell when I have 10% profit” → market_buy + take_profit up 10% sell 100%. If share count is missing, ask only for how many shares / USDC — do not pretend you didn’t understand the stock.
- Company names are enough. Google = GOOGLx (Alphabet). Bank of America = BACx. Ignore filler words like “FIB” if the company is clear.
- “Buy at current price: 2 stocks” → market_buy 2.
- “When price goes down to 345, buy 5” → limit_buy 5 @ 345 (even without $).
- “When it comes back at 355, sell all” → take_profit @ 355, 100%.
- Propose the FULL plan even if they don’t hold the stock yet.
- Never propose selling USDC. Never mention internal blocklists.

If the instruction is truly unintelligible: kind=clarify, rules=[], reply like “I didn’t get that instruction. Tell me the stock (e.g. Google, Apple, Bank of America) and what to buy or sell at which price.”`
}

function coerceSdkRules(raw: unknown[]): CompiledRule[] {
  const out: CompiledRule[] = []
  for (const blob of raw) {
    const parsed = compiledRuleSchema.safeParse(blob)
    if (!parsed.success) continue
    if (
      isSellSideRule(parsed.data) &&
      parsed.data.asset.toUpperCase() === 'USDC'
    ) {
      continue
    }
    out.push(parsed.data)
  }
  return out
}

function toAgentInput(
  message: string,
  history?: Array<{ role: 'user' | 'assistant'; content: string }>,
): AgentInputItem[] {
  const items: AgentInputItem[] = []
  for (const turn of (history ?? []).slice(-8)) {
    if (turn.role === 'user') items.push(user(turn.content))
    else items.push(assistant(turn.content))
  }
  items.push(user(message))
  return items
}

/**
 * Run Autopilot via @openai/agents. Returns null if the SDK path cannot run
 * (missing key / empty output) so the caller can fall back.
 */
export async function runAutopilotWithOpenAIAgents(input: {
  apiKey: string
  model?: string
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  holdings?: HoldingHint[]
  walletConnected?: boolean
  pendingRules?: CompiledRule[]
  pendingCancelIds?: string[]
  openOrders?: OpenOrderHint[]
}): Promise<AutopilotSdkResult | null> {
  const apiKey = input.apiKey.trim()
  if (!apiKey) return null

  const pendingCancelIds = input.pendingCancelIds ?? []
  const openOrders = input.openOrders ?? []
  const pendingRules = input.pendingRules ?? []

  const cancelTurn = resolveCancelTurn({
    message: input.message,
    pendingRulesCount: pendingRules.length,
    pendingCancelIds,
    openOrders,
  })
  if (cancelTurn) {
    return {
      ok: true,
      kind: cancelTurn.kind,
      reply: cancelTurn.reply,
      rule: null,
      rules: [],
      interpretation: null,
      provider: 'openai',
      cancelRuleIds: cancelTurn.cancelRuleIds,
      clearPending: cancelTurn.clearPending,
    }
  }

  setDefaultOpenAIKey(apiKey)

  const context: AutopilotSdkContext = {
    holdings: input.holdings ?? [],
    walletConnected: Boolean(input.walletConnected),
    pendingRules,
    pendingCancelIds,
    openOrders,
  }

  const modelId = input.model?.trim() || 'gpt-5.6-luna'

  const agent = new Agent({
    name: 'Mera Autopilot',
    instructions: () => buildInstructions(context),
    model: modelId,
    tools: createAutopilotTools(input.message),
    outputType: agentPlanSchema,
    modelSettings: {
      temperature: 0.2,
    },
  })

  try {
    const result = await run(agent, toAgentInput(input.message, input.history), {
      context,
      maxTurns: 8,
    })

    const output = result.finalOutput
    if (!output || typeof output !== 'object') {
      return null
    }

    const parsed = agentPlanSchema.safeParse(output)
    if (!parsed.success) return null

    let rules = keepKnownRules(coerceSdkRules(parsed.data.rules ?? []))
    let reply = parsed.data.reply
    let kind = parsed.data.kind
    const cancelRuleIds = parsed.data.cancelRuleIds ?? []

    if (kind === 'cancel') {
      rules = []
      return {
        ok: true,
        kind: 'cancel',
        reply,
        rule: null,
        rules: [],
        interpretation: null,
        provider: 'openai',
        cancelRuleIds,
        clearPending: true,
      }
    }

    // Prefer deterministic broker compile over hallucinated 1-leg / fake tickers.
    const brokerPlan = keepKnownRules(
      fallbackCompileMany(input.message, context.holdings) ?? [],
    )
    if (
      brokerPlan.length > 0 &&
      cancelRuleIds.length === 0 &&
      !isLiquidateIntent(input.message) &&
      (brokerPlan.length > rules.length ||
        rules.some((rule) => !isKnownPlatformAsset(rule.asset)))
    ) {
      rules = brokerPlan
      kind = 'propose'
      reply = `${interpretRules(brokerPlan)}\n\nReply **yes** to arm this plan.`
    }

    rules = keepKnownRules(rules)

    if (looksLikeTradeTalk(input.message) && rules.length === 0 && kind !== 'execute') {
      const smart =
        brokerClarifyMessage(input.message, context.holdings) ??
        unclearInstructionReply(input.message)
      return {
        ok: true,
        kind: 'clarify',
        reply: smart,
        rule: null,
        rules: [],
        interpretation: null,
        provider: 'openai',
      }
    }

    // Safety net: liquidate intents must never keep a lone USDC sell.
    if (isLiquidateIntent(input.message)) {
      const rebuilt = buildLiquidateRules(context.holdings)
      if (rebuilt.length > 0) {
        rules = rebuilt
        kind = 'propose'
        reply = `${interpretRules(rebuilt)}\n\nReply **yes** to arm this plan.`
      } else if (
        rules.length === 1 &&
        isSellSideRule(rules[0]!) &&
        rules[0]!.asset.toUpperCase() === 'USDC'
      ) {
        return {
          ok: true,
          kind: 'clarify',
          reply:
            'I can sell your **stocks** into USDC, but I don’t see any non-USDC balances yet. Connect your wallet / refresh Spot, then ask again.',
          rule: null,
          rules: [],
          interpretation: null,
          provider: 'openai',
        }
      }
    }

    // Affirm pending plan if model forgot rules
    if (
      context.pendingRules.length > 0 &&
      (kind === 'execute' ||
        (/^(yes|y|yeah|yep|confirm|ok|okay|sure|do it|go ahead|arm|approve|proceed)\b/i.test(
          input.message.trim(),
        ) &&
          rules.length === 0))
    ) {
      rules = context.pendingRules
      kind = 'execute'
    }

    return {
      ok: true,
      kind,
      reply,
      rule: rules[0] ?? null,
      rules,
      interpretation: rules.length > 0 ? interpretRules(rules) : null,
      provider: 'openai',
      cancelRuleIds,
    }
  } catch (error) {
    console.error('[autopilot-openai-sdk]', error)
    return null
  }
}

/**
 * True only for “sell everything to USDC / liquidate now”.
 * NOT for “buy ladder, then sell all when price hits $X” (that’s take-profit).
 */
export function isLiquidateIntent(message: string): boolean {
  const lower = message.toLowerCase()

  // Buy + sell plans are multi-leg strategies, not liquidate-now.
  if (/\bbuy\b/.test(lower)) return false

  // “Sell all when/if price reaches $X” is a take-profit, not liquidate-now.
  const deferredTakeProfit =
    /sell.{0,100}(when|if|once|after).{0,60}(price|\$|reaches|hits|goes?\s+to|above|at\s+or\s+above)/i.test(
      lower,
    ) ||
    /(when|if).{0,60}(price|\$).{0,40}\d.{0,40}sell/i.test(lower)
  if (deferredTakeProfit) return false

  return (
    /(sell|liquidate).{0,40}(all|everything).{0,40}(stocks?|tokens?|assets?|holdings?).{0,40}(to|into)\s+usdc/i.test(
      lower,
    ) ||
    /convert.{0,40}(money|proceeds|stocks?|tokens?|assets?|everything).{0,40}\b(into|to)\s+usdc/i.test(
      lower,
    ) ||
    /convert\s+everything\s+to\s+usdc/i.test(lower) ||
    /sell\s+all\s+(my\s+)?(stocks?|tokens?|assets?|holdings?)(\s+now|\s+at\s+(the\s+)?(current\s+)?market|\s+immediately)?\s*$/i.test(
      lower.trim(),
    ) ||
    /(liquidate|dump)\s+(all|everything)/i.test(lower)
  )
}

function keepKnownRules(rules: CompiledRule[]): CompiledRule[] {
  return rules.filter((rule) => {
    if (!isKnownPlatformAsset(rule.asset)) return false
    if ('payAsset' in rule && rule.payAsset && !isKnownPlatformAsset(rule.payAsset)) {
      return false
    }
    return true
  })
}

function looksLikeTradeTalk(message: string): boolean {
  if (
    /\b(cancel|delete|unlock|refund|remove)\b/i.test(message) &&
    /\b(order|rule|plan|buy|sell|trade|lock|escrow|wallet|money)\b/i.test(
      message,
    )
  ) {
    return false
  }
  return /\b(buy|sell|stock|stocks|shares?|limit|market)\b/i.test(message)
}

function unclearInstructionReply(_message: string): string {
  return 'I didn’t get that instruction. Tell me which listed stock (for example Google, Apple, Bank of America, Nvidia, Tesla) and what to buy or sell, at which price or “at the current price.”'
}

export { buildLiquidateRules, unclearInstructionReply }
