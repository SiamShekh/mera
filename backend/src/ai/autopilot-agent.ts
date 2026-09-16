import { z } from 'zod'

import { extractJsonObject, resolveLlmForAgent } from './llm'
import { interpretRules } from './interpret'
import { normalizeAsset } from './assets'
import { fallbackCompile, fallbackCompileMany, brokerClarifyMessage } from './fallback'
import {
  isLiquidateIntent,
  buildLiquidateRules,
  runAutopilotWithOpenAIAgents,
  unclearInstructionReply,
} from './autopilot-openai-sdk'
import {
  resolveCancelTurn,
  type OpenOrderHint,
} from './cancel'
import {
  compiledRuleSchema,
  isBuySideRule,
  isSellSideRule,
  type CompiledRule,
} from '../validators/compile'
import type { Bindings } from '../types/env'

/** Soft shell — rules validated separately so one bad object doesn't kill the turn. */
const agentOutputSchema = z.object({
  kind: z.enum(['clarify', 'propose', 'cannot', 'chat', 'execute', 'cancel']),
  reply: z.string().min(1),
  rule: z.unknown().optional().nullable(),
  rules: z.array(z.unknown()).max(20).optional().nullable(),
  cancelRuleIds: z.array(z.string().uuid()).max(20).optional().nullable(),
})

export type AutopilotAgentResult =
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

export type HoldingHint = {
  symbol: string
  quantity: number
  priceUsd: number
}

/**
 * Conversational Autopilot brain: understand NL → clarify / propose / refuse / execute.
 * Does not save rules or move tokens — the client confirms then arms.
 */
export async function runAutopilotAgent(
  env: Bindings,
  input: {
    message: string
    history?: Array<{ role: 'user' | 'assistant'; content: string }>
    holdings?: HoldingHint[]
    walletConnected?: boolean
    pendingRule?: CompiledRule | null
    pendingRules?: CompiledRule[] | null
    pendingCancelIds?: string[]
    openOrders?: OpenOrderHint[]
  },
): Promise<AutopilotAgentResult> {
  const pendingRules = normalizePendingRules(
    input.pendingRules,
    input.pendingRule,
  )
  const pendingCancelIds = input.pendingCancelIds ?? []
  const openOrders = input.openOrders ?? []

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

  // Prefer OpenAI Agents SDK (tools + structured output) when a key is present.
  const apiKey = env.OPENAI_API_KEY?.trim()
  if (apiKey) {
    const sdkResult = await runAutopilotWithOpenAIAgents({
      apiKey,
      model: env.OPENAI_MODEL,
      message: input.message,
      history: input.history,
      holdings: input.holdings,
      walletConnected: input.walletConnected,
      pendingRules,
      pendingCancelIds,
      openOrders,
    })
    if (sdkResult) {
      return sdkResult
    }
  }

  const system = buildAutopilotAgentPrompt({
    holdings: input.holdings,
    walletConnected: input.walletConnected,
    pendingRules,
    pendingCancelIds,
    openOrders,
  })

  const llm = await resolveLlmForAgent(env, [
    { role: 'system', content: system },
    ...(input.history ?? []).slice(-8).map((turn) => ({
      role: turn.role as 'user' | 'assistant',
      content: turn.content,
    })),
    { role: 'user', content: input.message },
  ])

  if (!llm.ok) {
    const deterministic = proposeFromFallback(input.message, input.holdings)
    if (deterministic) {
      return { ...deterministic, provider: 'openai' }
    }
    return { ok: false, error: llm.reason }
  }

  if (isGarbageModelText(llm.text)) {
    const deterministic = proposeFromFallback(input.message, input.holdings)
    if (deterministic) {
      return { ...deterministic, provider: llm.provider }
    }
    return {
      ok: false,
      error:
        'AI returned unreadable output. Restart the backend so OPENAI_MODEL=gpt-5.6-luna is loaded, then try again.',
    }
  }

  let raw: unknown
  try {
    raw = extractJsonObject(llm.text)
  } catch {
    const deterministic = proposeFromFallback(input.message, input.holdings)
    if (deterministic) {
      return { ...deterministic, provider: llm.provider }
    }
    return {
      ok: true,
      kind: 'chat',
      reply: humanizeModelText(llm.text),
      rule: null,
      rules: [],
      interpretation: null,
      provider: llm.provider,
    }
  }

  const parsed = agentOutputSchema.safeParse(raw)
  if (!parsed.success) {
    const deterministic = proposeFromFallback(input.message, input.holdings)
    if (deterministic) {
      return { ...deterministic, provider: llm.provider }
    }
    return {
      ok: true,
      kind: 'clarify',
      reply:
        'I want to help, but I need a clearer portfolio instruction. You can set cash floors, concentration caps, take-profit, stop-loss, or sell-all to USDC.',
      rule: null,
      rules: [],
      interpretation: null,
      provider: llm.provider,
    }
  }

  if (isGarbageModelText(parsed.data.reply)) {
    const deterministic = proposeFromFallback(input.message, input.holdings)
    if (deterministic) {
      return { ...deterministic, provider: llm.provider }
    }
    return {
      ok: true,
      kind: 'clarify',
      reply:
        'I want to help, but I need a clearer portfolio instruction. Which guard, cash floor, or sell order should I set up?',
      rule: null,
      rules: [],
      interpretation: null,
      provider: llm.provider,
    }
  }

  let rules = coerceRules(parsed.data.rules, parsed.data.rule, {
    message: input.message,
    holdings: input.holdings,
  })

  if (
    (parsed.data.kind === 'propose' || parsed.data.kind === 'execute') &&
    rules.length > 0
  ) {
    rules = expandLiquidateIfNeeded(rules, input.holdings, input.message)
    rules = expandDiversifyIfNeeded(rules, input.holdings, input.message)
    rules = expandBuyLadderIfNeeded(rules, input.message)
    rules = expandNotionalAndDipBuysIfNeeded(
      rules,
      input.message,
      input.holdings,
    )
  } else if (parsed.data.kind !== 'propose' && parsed.data.kind !== 'execute') {
    rules = []
  }

  // Model returned too few legs for a clearly multi-intent prompt — recover.
  if (
    countDistinctIntents(input.message) >= 2 &&
    rules.length < countDistinctIntents(input.message) &&
    (parsed.data.kind === 'propose' ||
      parsed.data.kind === 'clarify' ||
      parsed.data.kind === 'chat' ||
      parsed.data.kind === 'cannot')
  ) {
    const recovered = proposeFromFallback(input.message, input.holdings)
    if (recovered && recovered.rules.length > rules.length) {
      return { ...recovered, provider: llm.provider }
    }
  }

  // Model clarified / failed to emit rules, but the prompt is a clear compileable order.
  if (
    rules.length === 0 &&
    (parsed.data.kind === 'clarify' ||
      parsed.data.kind === 'chat' ||
      parsed.data.kind === 'propose' ||
      parsed.data.kind === 'cannot')
  ) {
    const deterministic = proposeFromFallback(input.message, input.holdings)
    if (deterministic) {
      return { ...deterministic, provider: llm.provider }
    }
  }

  // Affirm pending plan
  if (
    pendingRules.length > 0 &&
    (parsed.data.kind === 'execute' ||
      (isAffirmative(input.message) &&
        (parsed.data.kind === 'chat' || parsed.data.kind === 'propose')))
  ) {
    rules = pendingRules
    const blocked = explainMissingBalances(rules, input.holdings)
    if (blocked) {
      return {
        ok: true,
        kind: 'cannot',
        reply: blocked,
        rule: null,
        rules: [],
        interpretation: null,
        provider: llm.provider,
      }
    }
    return {
      ok: true,
      kind: 'execute',
      reply:
        parsed.data.reply ||
        'Confirmed — I’ll activate your portfolio plan with wallet approval where needed.',
      rule: rules[0] ?? null,
      rules,
      interpretation: interpretRules(rules),
      provider: llm.provider,
    }
  }

  if (
    rules.length > 0 &&
    (parsed.data.kind === 'propose' || parsed.data.kind === 'execute')
  ) {
    const blocked = explainMissingBalances(rules, input.holdings)
    if (blocked && parsed.data.kind === 'execute') {
      return {
        ok: true,
        kind: 'cannot',
        reply: blocked,
        rule: null,
        rules: [],
        interpretation: null,
        provider: llm.provider,
      }
    }
    if (blocked && parsed.data.kind === 'propose') {
      return {
        ok: true,
        kind: 'propose',
        reply: `${parsed.data.reply}\n\n⚠️ ${blocked}`,
        rule: rules[0] ?? null,
        rules,
        interpretation: interpretRules(rules),
        provider: llm.provider,
      }
    }
  }

  return {
    ok: true,
    kind: parsed.data.kind,
    reply: parsed.data.reply,
    rule: parsed.data.kind === 'cancel' ? null : (rules[0] ?? null),
    rules: parsed.data.kind === 'cancel' ? [] : rules,
    interpretation:
      parsed.data.kind === 'cancel'
        ? null
        : rules.length > 0
          ? interpretRules(rules)
          : null,
    provider: llm.provider,
    cancelRuleIds: parsed.data.cancelRuleIds ?? [],
  }
}

export function normalizePendingRules(
  pendingRules?: CompiledRule[] | null,
  pendingRule?: CompiledRule | null,
): CompiledRule[] {
  if (pendingRules && pendingRules.length > 0) return pendingRules
  if (pendingRule) return [pendingRule]
  return []
}

/** Validate / coerce model rule blobs; drop junk instead of failing the turn. */
function coerceRules(
  rulesRaw: unknown,
  ruleRaw: unknown,
  context: { message: string; holdings?: HoldingHint[] },
): CompiledRule[] {
  const blobs: unknown[] = []
  if (Array.isArray(rulesRaw)) {
    blobs.push(...rulesRaw)
  }
  if (ruleRaw != null) {
    blobs.push(ruleRaw)
  }

  const out: CompiledRule[] = []
  for (const blob of blobs) {
    const coerced = coerceOneRule(blob, context)
    if (coerced) out.push(coerced)
  }
  return out
}

function coerceOneRule(
  raw: unknown,
  context: { message: string; holdings?: HoldingHint[] },
): CompiledRule | null {
  const repaired = repairRuleBlob(raw, context)
  const direct = compiledRuleSchema.safeParse(repaired)
  if (direct.success) return direct.data

  if (!repaired || typeof repaired !== 'object') return null
  const row = repaired as Record<string, unknown>
  const type = typeof row.type === 'string' ? row.type.trim().toLowerCase() : ''

  // Models often invent market_sell / sell_market for "sell now".
  if (
    type === 'market_sell' ||
    type === 'sell_market' ||
    type === 'sell_now' ||
    type === 'market'
  ) {
    const asset =
      typeof row.asset === 'string' ? normalizeAsset(row.asset) : null
    if (!asset) return null
    const actionUnit =
      row.actionUnit === 'amount' || row.unit === 'amount'
        ? 'amount'
        : 'percent'
    const actionValue = Number(
      row.actionValue ?? row.value ?? (actionUnit === 'percent' ? 100 : 0),
    )
    const market = compiledRuleSchema.safeParse({
      type: 'take_profit',
      asset,
      unit: 'amount',
      value: 0,
      actionUnit,
      actionValue: actionValue > 0 ? actionValue : 100,
      sellBasis: row.sellBasis === 'portfolio' ? 'portfolio' : 'position',
    })
    return market.success ? market.data : null
  }

  return null
}

/** Fix common model mistakes before Zod (fake tickers, USDC notional buys). */
function repairRuleBlob(
  raw: unknown,
  context: { message: string; holdings?: HoldingHint[] },
): unknown {
  if (!raw || typeof raw !== 'object') return raw
  const row = { ...(raw as Record<string, unknown>) }

  if (typeof row.asset === 'string') {
    const normalized = normalizeAsset(row.asset)
    if (normalized) {
      row.asset = normalized
    } else {
      const fromMessage =
        context.message.match(/nvidi[a-z]*|nvdax|\bnvda\b/i)?.[0] ??
        context.message.match(/tesla|tslax|\btsla\b/i)?.[0]
      const repaired = fromMessage ? normalizeAsset(fromMessage) : null
      if (repaired) row.asset = repaired
    }
  }

  const type = typeof row.type === 'string' ? row.type.trim().toLowerCase() : ''
  if (type === 'market_buy' || type === 'limit_buy') {
    const notional = Number(
      row.payNotional ??
        row.notionalUsd ??
        row.usdcAmount ??
        row.spendUsd ??
        row.budgetUsd,
    )
    if (notional > 0) {
      const asset =
        typeof row.asset === 'string'
          ? (normalizeAsset(row.asset) ?? row.asset)
          : 'NVDAx'
      const limitPrice =
        type === 'limit_buy' ? Number(row.limitPrice) : undefined
      const shares = sharesFromNotionalHint(
        notional,
        asset,
        context.holdings,
        limitPrice != null && limitPrice > 0 ? limitPrice : undefined,
      )
      if (shares != null) {
        row.value = shares
        row.unit = 'amount'
      }
    }
    if (!row.payAsset) row.payAsset = 'USDC'
  }

  if (
    (type === 'take_profit' || type === 'stop_loss') &&
    (row.actionValue == null || Number(row.actionValue) <= 0)
  ) {
    row.actionUnit = 'percent'
    row.actionValue = 100
  }

  return row
}

function proposeFromFallback(
  message: string,
  holdings?: HoldingHint[],
): {
  ok: true
  kind: 'propose' | 'clarify'
  reply: string
  rule: CompiledRule | null
  rules: CompiledRule[]
  interpretation: string | null
} | null {
  if (isLiquidateIntent(message)) {
    const sells = buildLiquidateRules(holdings ?? [])
    if (sells.length > 0) {
      return {
        ok: true,
        kind: 'propose',
        reply: `${interpretRules(sells)}\n\nReply **yes** to arm this plan.`,
        rule: sells[0] ?? null,
        rules: sells,
        interpretation: interpretRules(sells),
      }
    }
    return {
      ok: true,
      kind: 'clarify',
      reply:
        'I can sell your **stocks** into USDC, but I don’t see any non-USDC balances yet. Connect your wallet / refresh Spot, then ask again.',
      rule: null,
      rules: [],
      interpretation: null,
    }
  }

  const many = fallbackCompileMany(message, holdings)
  if (many && many.length > 0) {
    return {
      ok: true,
      kind: 'propose',
      reply: `${interpretRules(many)}\n\nReply **yes** to arm this plan.`,
      rule: many[0] ?? null,
      rules: many,
      interpretation: interpretRules(many),
    }
  }

  const compiled = fallbackCompile(message, holdings)
  if ('rejection' in compiled) {
    if (/\b(buy|sell|stock|shares?)\b/i.test(message)) {
      return {
        ok: true,
        kind: 'clarify',
        reply:
          brokerClarifyMessage(message, holdings) ??
          unclearInstructionReply(message),
        rule: null,
        rules: [],
        interpretation: null,
      }
    }
    return null
  }
  // Guard: never propose selling USDC for stock→USDC language.
  if (
    isSellSideRule(compiled) &&
    compiled.asset.toUpperCase() === 'USDC' &&
    /usdc/i.test(message)
  ) {
    return null
  }
  const rules = [compiled]
  return {
    ok: true,
    kind: 'propose',
    reply: `${interpretRules(rules)}\n\nReply **yes** to arm this order.`,
    rule: rules[0] ?? null,
    rules,
    interpretation: interpretRules(rules),
  }
}

function countDistinctIntents(message: string): number {
  const numbered = [...message.matchAll(/\b\d+[.)]\s+/g)].length
  if (numbered >= 2) return numbered
  const buys = (message.toLowerCase().match(/\bbuy\b/g) ?? []).length
  const sells = (message.toLowerCase().match(/\bsell\b/g) ?? []).length
  return buys + sells
}

function sharesFromNotionalHint(
  usd: number,
  asset: string,
  holdings?: HoldingHint[],
  limitPrice?: number,
): number | null {
  const want = asset.toUpperCase().replace(/[^A-Z0-9]/g, '')
  let px =
    limitPrice != null && limitPrice > 0 ? limitPrice : null
  if (!(px != null && px > 0)) {
    for (const row of holdings ?? []) {
      const have = (normalizeAsset(row.symbol) ?? row.symbol)
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
      if (
        have === want ||
        (want.includes('NVDA') && have.includes('NVDA'))
      ) {
        if (row.priceUsd > 0) {
          px = row.priceUsd
          break
        }
      }
    }
  }
  if (!(px != null && px > 0)) {
    const anchors: Record<string, number> = {
      NVDAX: 120,
      SOLX: 150,
      STX: 165,
      TSLAX: 363.92,
      AAPLX: 334.71,
      AMZNX: 253.54,
    }
    px = anchors[want] ?? null
  }
  if (!(px != null && px > 0) || !(usd > 0)) return null
  return Number((usd / px).toFixed(6))
}

/**
 * Recover USDC-notional market buys and %-dip limit buys when the model
 * under-emitted legs or emitted share counts that don't match the prompt.
 */
function expandNotionalAndDipBuysIfNeeded(
  rules: CompiledRule[],
  message: string,
  holdings?: HoldingHint[],
): CompiledRule[] {
  const recovered = fallbackCompileMany(message, holdings)
  if (!recovered || recovered.length <= rules.length) return rules

  // Prefer recovered plan when it covers more of a multi-intent prompt.
  const recoveredBuys = recovered.filter(isBuySideRule).length
  const currentBuys = rules.filter(isBuySideRule).length
  if (recoveredBuys > currentBuys) return recovered
  return rules
}

/** Expand “sell all stocks to USDC” into one market sell per non-USDC holding. */
function expandLiquidateIfNeeded(
  rules: CompiledRule[],
  holdings: HoldingHint[] | undefined,
  message: string,
): CompiledRule[] {
  if (!isLiquidateIntent(message)) return rules

  const sells = buildLiquidateRules(holdings ?? [])
  if (sells.length > 0) return sells

  // Never keep a mistaken “sell USDC” rule for liquidate intents.
  if (
    rules.length === 1 &&
    isSellSideRule(rules[0]!) &&
    rules[0]!.asset.toUpperCase() === 'USDC'
  ) {
    return []
  }
  return rules
}

/** Ensure “keep diversified” adds 40% caps for other non-USDC holdings. */
function expandDiversifyIfNeeded(
  rules: CompiledRule[],
  holdings: HoldingHint[] | undefined,
  message: string,
): CompiledRule[] {
  const lower = message.toLowerCase()
  if (!/diversif|spread\s+(out|risk)|don'?t\s+concentrate/.test(lower)) {
    return rules
  }

  const capped = new Set(
    rules
      .filter((r) => r.type === 'max_allocation')
      .map((r) => r.asset.toUpperCase()),
  )

  const next = [...rules]
  const rows =
    holdings?.filter((row) => {
      const symbol = (normalizeAsset(row.symbol) ?? row.symbol).toUpperCase()
      return symbol !== 'USDC' && symbol !== 'SOL' && row.quantity > 0
    }) ?? []

  if (rows.length === 0 && !capped.has('NVDAX')) {
    next.push({
      type: 'max_allocation',
      asset: 'NVDAx',
      unit: 'percent',
      value: 40,
    })
    return next
  }

  for (const row of rows) {
    const symbol = normalizeAsset(row.symbol) ?? row.symbol
    if (capped.has(symbol.toUpperCase())) continue
    next.push({
      type: 'max_allocation',
      asset: symbol,
      unit: 'percent',
      value: 40,
    })
    capped.add(symbol.toUpperCase())
  }
  return next
}

/**
 * If the user listed a buy ladder in one message but the model returned fewer
 * legs than price/qty pairs, expand from the text when payAsset is known.
 */
function expandBuyLadderIfNeeded(
  rules: CompiledRule[],
  message: string,
): CompiledRule[] {
  const lower = message.toLowerCase()
  if (!/\bbuy\b/.test(lower)) return rules

  const legs: Array<{ qty: number; price: number }> = []
  const re =
    /buy\s+(\d+(?:\.\d+)?)\s+[a-z0-9._-]*\s*(?:at|@|below|under)?\s*\$?\s*(\d+(?:\.\d+)?)/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(message)) !== null) {
    legs.push({ qty: Number(match[1]), price: Number(match[2]) })
  }
  // Also: "2 at $80, 5 at $100"
  if (legs.length < 2) {
    const compact = [
      ...message.matchAll(
        /(\d+(?:\.\d+)?)\s*(?:shares?\s+)?(?:at|@)\s*\$?\s*(\d+(?:\.\d+)?)/gi,
      ),
    ]
    for (const m of compact) {
      legs.push({ qty: Number(m[1]), price: Number(m[2]) })
    }
  }
  if (legs.length < 2) return rules

  const existingBuys = rules.filter(isBuySideRule)
  const payAsset =
    existingBuys[0]?.payAsset ??
    (/\b(usdc|cash)\b/i.test(message) ? 'USDC' : null)
  const asset =
    existingBuys[0]?.asset ??
    normalizeAsset(message.match(/nvidi[a-z]*|nvdax|nvda/i)?.[0] ?? 'NVDAx') ??
    'NVDAx'
  if (!payAsset) return rules

  // Dedupe by price
  const seen = new Set<string>()
  const ladder: CompiledRule[] = []
  for (const leg of legs) {
    if (!(leg.qty > 0 && leg.price > 0)) continue
    const key = `${leg.qty}@${leg.price}`
    if (seen.has(key)) continue
    seen.add(key)
    ladder.push({
      type: 'limit_buy',
      asset,
      unit: 'amount',
      value: leg.qty,
      payAsset,
      limitPrice: leg.price,
    })
  }
  return ladder.length >= 2 ? ladder : rules
}

function assetKey(symbol: string): string {
  return (normalizeAsset(symbol) ?? symbol).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function planBuysAsset(rules: CompiledRule[], sellAsset: string): boolean {
  const sellKey = assetKey(sellAsset)
  return rules.some((rule) => {
    if (!isBuySideRule(rule)) return false
    const buyKey = assetKey(rule.asset)
    return buyKey === sellKey || symbolsMatchNvidia(buyKey, sellKey)
  })
}

function explainMissingBalances(
  rules: CompiledRule[],
  holdings?: HoldingHint[],
): string | null {
  const rows = holdings ?? []
  if (rows.length === 0) return null

  const missingSells: string[] = []
  for (const rule of rules.filter(isSellSideRule)) {
    // Buy-then-TP: companion buy funds the position — don't require sell inventory yet.
    if (planBuysAsset(rules, rule.asset)) continue
    const want =
      normalizeAsset(rule.asset)?.toUpperCase() ?? rule.asset.toUpperCase()
    const hit = rows.find((row) => {
      const have =
        normalizeAsset(row.symbol)?.toUpperCase() ?? row.symbol.toUpperCase()
      return have === want || symbolsMatchNvidia(have, want)
    })
    if (!hit || !(hit.quantity > 0)) missingSells.push(rule.asset)
  }
  if (missingSells.length > 0) {
    return `I can’t arm sells for **${missingSells.join(', ')}** yet — your wallet shows no balance. Deposit that stock (or add a buy for it in this plan), then reply **yes**.`
  }

  const missingPay: string[] = []
  for (const rule of rules.filter(isBuySideRule)) {
    const want =
      normalizeAsset(rule.payAsset)?.toUpperCase() ??
      rule.payAsset.toUpperCase()
    const hit = rows.find((row) => {
      const have =
        normalizeAsset(row.symbol)?.toUpperCase() ?? row.symbol.toUpperCase()
      return have === want
    })
    if (!hit || !(hit.quantity > 0)) missingPay.push(rule.payAsset)
  }
  if (missingPay.length > 0) {
    return `I can’t arm buys — missing **${[...new Set(missingPay)].join(', ')}** to pay with. Use **Faucet** on Spot for mock USDC, then reply **yes**.`
  }
  return null
}

function symbolsMatchNvidia(a: string, b: string): boolean {
  const nvidia = new Set(['NVDA', 'NVDAX', 'NVIDIA', 'NVIDIAXSTOCK'])
  const strip = (s: string) => s.replace(/[^A-Z0-9]/g, '')
  return nvidia.has(strip(a)) && nvidia.has(strip(b))
}

function isAffirmative(message: string): boolean {
  return /^(yes|y|yeah|yep|confirm|ok|okay|sure|do it|go ahead|arm|approve|proceed|lets go|let's go)\b/i.test(
    message.trim(),
  )
}

function isGarbageModelText(text: string): boolean {
  const t = text.trim()
  return !t || t === '[object Object]' || /^\[object\s+\w+\]$/i.test(t)
}

function humanizeModelText(text: string): string {
  if (isGarbageModelText(text)) {
    return 'Something went wrong reading the AI response. Try again in a moment.'
  }
  return text.trim()
}

function buildAutopilotAgentPrompt(context: {
  holdings?: HoldingHint[]
  walletConnected?: boolean
  pendingRules: CompiledRule[]
  pendingCancelIds: string[]
  openOrders: OpenOrderHint[]
}): string {
  const holdings =
    context.holdings && context.holdings.length > 0
      ? context.holdings
          .map(
            (row) =>
              `${row.symbol}: qty ${row.quantity}, ~$${row.priceUsd.toFixed(2)}`,
          )
          .join(' · ')
      : 'HOLDINGS_UNKNOWN (client has not reported balances yet — NEVER say the user has zero / no balance; still propose if the instruction is clear, and note balance will be checked on confirm).'

  const nonUsdcHoldings =
    context.holdings
      ?.filter((row) => {
        const s = (normalizeAsset(row.symbol) ?? row.symbol).toUpperCase()
        return s !== 'USDC' && s !== 'SOL' && row.quantity > 0
      })
      .map((row) => normalizeAsset(row.symbol) ?? row.symbol) ?? []

  const pending =
    context.pendingRules.length > 0
      ? `A proposed portfolio plan is waiting for confirmation (${context.pendingRules.length} rule(s)): ${JSON.stringify(context.pendingRules)}. If they affirm (yes/confirm/ok), return kind "execute" with the same rules array.`
      : 'No pending plan awaiting confirmation.'

  const pendingCancel =
    context.pendingCancelIds.length > 0
      ? `A cancel is waiting for confirmation. Rule ids: ${context.pendingCancelIds.join(', ')}. If they affirm, return kind "cancel" with the same cancelRuleIds. Do NOT create a new buy/sell.`
      : 'No pending cancel.'

  const open =
    context.openOrders.length > 0
      ? `Open (unfilled) Autopilot orders:\n${context.openOrders
          .map((order) => {
            const lock =
              order.escrowAmount != null && order.escrowAmount > 0
                ? ` locked ${order.escrowAmount} ${order.payAsset ?? order.asset}`
                : ' no escrow'
            return `- id ${order.id}: ${order.type} ${order.asset}${lock}`
          })
          .join('\n')}`
      : 'No open Autopilot orders (nothing to cancel/refund).'

  const wallet = context.walletConnected
    ? 'Wallet is connected.'
    : 'Wallet may not be connected.'

  const diversifyHint =
    nonUsdcHoldings.length > 0
      ? `Known non-USDC holdings for diversify defaults: ${nonUsdcHoldings.join(', ')}.`
      : 'If holdings unknown and user says “keep diversified” without %, propose max_allocation 40% for NVDAx only and say they can name more assets.'

  return `You are Mera Autopilot — a programmable portfolio manager for in-app trading only.
You turn natural language into ONE OR MORE living rules (a plan), then wait for confirmation before anything runs.
Never write code. Never invent tickers from English filler words (e.g. "I need…" is NOT asset NEED).
Scope: buys, sells, cash floors, concentration caps, ladders, and dip buys on platform assets. Wallet signatures happen on the client after the user confirms.

Intent families:
1) Guard (max_allocation) — concentration caps / “keep diversified”
2) Cash floor (min_allocation, usually USDC) — always keep at least $X cash
3) Sell orders — take_profit, stop_loss, sell-all stocks → USDC
   Market sell NOW = take_profit with unit "amount" and value 0 (always triggered).
   If sell size is omitted, default actionValue to 100 (full position). NEVER reuse a buy-dip % as sell size.
4) Buy orders — market_buy / limit_buy (and ladders of several limit buys)
   USDC notionals ("buy $2000 of Nvidia with USDC") → convert to share qty using Holdings price (or ~$120 for NVDAx if unknown): value = notional / price.
   “Buy when price is down 5%” → limit_buy with limitPrice = spot * 0.95 (same notional→shares conversion).
5) Cancel / delete / unlock — drop a draft OR cancel an OPEN order and refund locked tokens to the spendable wallet.
   Words: cancel, delete, remove, unlock, refund, put the money back, drop that order/rule/scroll.
   NEVER compile cancel-talk as a new buy or sell.
   If they confirm a pending cancel, kind "cancel" with cancelRuleIds (no rules).

Return JSON only (no markdown):
{
  "kind": "clarify" | "propose" | "cannot" | "chat" | "execute" | "cancel",
  "reply": "human message to show in chat",
  "rules": [ /* 1..N compiled rule objects — include EVERY leg the user asked for */ ],
  "rule": null,
  "cancelRuleIds": []
}
Prefer "rules". You may also set "rule" as a single-rule alias (client normalizes).

Kinds:
- clarify — missing critical detail; ask ONE focused question. rules=[]
- propose — explain the FULL plan in plain English; ask them to reply yes/confirm. Include ALL rules. For cancel, include cancelRuleIds and empty rules.
- execute — user confirmed the pending plan. Include the same rules.
- cancel — user confirmed cancelling open order(s). Include cancelRuleIds. rules=[]
- cannot — impossible (zero balance when holdings listed, wallet needed, unsupported). rules=[]
- chat — general Mera question, not a portfolio action. rules=[]

Rule schema:
- max_allocation | min_allocation | take_profit | stop_loss | market_buy | limit_buy
- NEVER invent types like market_sell — encode market sells as take_profit value 0.
- nvidia/NVDA → asset "NVDAx"; tesla/TSLA → "TSLAx"; amazon → "AMZNx"
- Buys: {"type":"market_buy"|"limit_buy","asset":"NVDAx","unit":"amount","value":<shares>,"payAsset":"USDC","limitPrice":<usd or null>}
- Sells now: {"type":"take_profit","asset":"TSLAx","unit":"amount","value":0,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}
- "Buy 5 nvidia" WITHOUT pay asset → clarify: ask what to exchange / pay with, and LIST available balances from Holdings (qty + ~USD). Do NOT invent balances.
- After pay asset known but price style unknown → clarify: market now OR a fixed/limit USD price?
- Ladder: "buy 2 at $80, 5 at $100, 8 at $105" → MULTIPLE limit_buy rules (same asset + payAsset). If payAsset missing, ask once then propose the full ladder.
- Default payAsset to USDC only when user said "with USDC/cash" or clearly implied; otherwise clarify.
- Numbered multi-step prompts MUST become multiple rules (do not collapse to one sell).

Examples:
User: "sell 100% of TSLAx"
→ {"kind":"propose","reply":"I'll **sell 100% of TSLAx at market** into USDC. Reply **yes** to arm.","rules":[{"type":"take_profit","asset":"TSLAx","unit":"amount","value":0,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}]}

User: "Sell 100% Tesla stock at the current market price"
→ {"kind":"propose","reply":"I'll **sell 100% of TSLAx at market** into USDC. Reply **yes** to arm.","rules":[{"type":"take_profit","asset":"TSLAx","unit":"amount","value":0,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}]}

User: "Buy 5 nvidia"
(with holdings USDC 1200, NVDAx 2, TSLAx 1)
→ {"kind":"clarify","reply":"Got it — **buy 5 NVDAx**. What should I spend?\n\nAvailable balances:\n- **USDC**: 1200 (~$1200)\n- **NVDAx**: 2\n- **TSLAx**: 1\n\nReply with the pay asset (usually USDC).","rules":[]}

User: "USDC"
(history: buy 5 nvidia pending)
→ {"kind":"clarify","reply":"Buy **5 NVDAx** with **USDC** — at **market** now, or at a **limit price** (e.g. $100)?","rules":[]}

User: "market"
→ {"kind":"propose","reply":"I'll **buy 5 NVDAx at market** paid with **USDC**. Reply **yes** to lock USDC and fill.","rules":[{"type":"market_buy","asset":"NVDAx","unit":"amount","value":5,"payAsset":"USDC"}]}

User: "buy 2 nvidia at $80, buy 5 at $100, and buy 8 at $105 with USDC"
→ {"kind":"propose","reply":"I'll set a **buy ladder** with USDC:\n1. 2 NVDAx ≤ $80\n2. 5 NVDAx ≤ $100\n3. 8 NVDAx ≤ $105\nReply **yes** to arm all three.","rules":[{"type":"limit_buy","asset":"NVDAx","unit":"amount","value":2,"payAsset":"USDC","limitPrice":80},{"type":"limit_buy","asset":"NVDAx","unit":"amount","value":5,"payAsset":"USDC","limitPrice":100},{"type":"limit_buy","asset":"NVDAx","unit":"amount","value":8,"payAsset":"USDC","limitPrice":105}]}

User: "I need to take multiple actions: 1. Buy Nvidia using 2000 USDC at market. 2. When price is down 5%, buy another $2000 of Nvidia with USDC. 3. Sell Nvidia when price reaches $125."
(assume NVDAx spot ~$120)
→ {"kind":"propose","reply":"Plan:\n1. **Market buy** ~16.6667 NVDAx with **$2000 USDC**\n2. **Limit buy** ~17.5439 NVDAx if price ≤ **$114** (5% dip) with USDC\n3. **Take-profit**: sell **100%** of NVDAx at or above **$125**\nReply **yes** to arm all three.","rules":[{"type":"market_buy","asset":"NVDAx","unit":"amount","value":16.6667,"payAsset":"USDC"},{"type":"limit_buy","asset":"NVDAx","unit":"amount","value":17.5439,"payAsset":"USDC","limitPrice":114},{"type":"take_profit","asset":"NVDAx","unit":"amount","value":125,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}]}

User: "Keep my portfolio diversified, never let Nvidia exceed 40%, and always keep at least $500 USDC"
→ {"kind":"propose","reply":"I'll activate a portfolio plan: **max 40% NVDAx**, diversify caps, and **at least $500 USDC**. Reply **yes**.","rules":[{"type":"max_allocation","asset":"NVDAx","unit":"percent","value":40},{"type":"min_allocation","asset":"USDC","unit":"amount","value":500}]}

User: "Sell if NVDAx drops to $80"
→ {"kind":"propose","reply":"I'll set a **stop-loss**: sell **100% of NVDAx at or below $80**. Reply **yes**.","rules":[{"type":"stop_loss","asset":"NVDAx","unit":"amount","value":80,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}]}

User: "cancel my nvidia order"
(open order: limit buy NVDAx, locked 600 USDC)
→ {"kind":"propose","reply":"I'll **cancel** the NVDAx buy and return locked USDC to your wallet. Reply **yes**.","rules":[],"cancelRuleIds":["use-the-real-open-order-id"]}

User: "delete that rule and put the money back"
(one open order)
→ {"kind":"propose","reply":"I'll cancel it and refund locked tokens to your spendable wallet. Reply **yes**.","rules":[],"cancelRuleIds":["use-the-real-open-order-id"]}

Rules:
- Prefer holdings tickers; typos like navidia → NVDAx; tesla → TSLAx.
- Be concise. Never claim you already bought/sold unless kind is execute (client still must arm).
- If the user listed N steps, your rules array length should match (unless truly unsupported — then clarify what failed).
- Cancel always refunds escrow to the spendable wallet; never leave funds locked after a confirmed cancel.
- Output JSON only.

${wallet}
Holdings: ${holdings}
${diversifyHint}
${open}
${pending}
${pendingCancel}`
}
