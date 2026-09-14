import { z } from 'zod'

import { extractJsonObject, resolveLlmForAgent } from './llm'
import { interpretRules } from './interpret'
import { normalizeAsset } from './assets'
import { fallbackCompile } from './fallback'
import {
  compiledRuleSchema,
  isBuySideRule,
  isSellSideRule,
  type CompiledRule,
} from '../validators/compile'
import type { Bindings } from '../types/env'

/** Soft shell — rules validated separately so one bad object doesn't kill the turn. */
const agentOutputSchema = z.object({
  kind: z.enum(['clarify', 'propose', 'cannot', 'chat', 'execute']),
  reply: z.string().min(1),
  rule: z.unknown().optional().nullable(),
  rules: z.array(z.unknown()).max(20).optional().nullable(),
})

export type AutopilotAgentResult =
  | {
      ok: true
      kind: 'clarify' | 'propose' | 'cannot' | 'chat' | 'execute'
      reply: string
      rule: CompiledRule | null
      rules: CompiledRule[]
      interpretation: string | null
      provider: 'openai'
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
  },
): Promise<AutopilotAgentResult> {
  const pendingRules = normalizePendingRules(
    input.pendingRules,
    input.pendingRule,
  )
  const system = buildAutopilotAgentPrompt({
    holdings: input.holdings,
    walletConnected: input.walletConnected,
    pendingRules,
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
    const deterministic = proposeFromFallback(input.message)
    if (deterministic) {
      return { ...deterministic, provider: 'openai' }
    }
    return { ok: false, error: llm.reason }
  }

  if (isGarbageModelText(llm.text)) {
    const deterministic = proposeFromFallback(input.message)
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
    const deterministic = proposeFromFallback(input.message)
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
    const deterministic = proposeFromFallback(input.message)
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
    const deterministic = proposeFromFallback(input.message)
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

  let rules = coerceRules(parsed.data.rules, parsed.data.rule)

  if (
    (parsed.data.kind === 'propose' || parsed.data.kind === 'execute') &&
    rules.length > 0
  ) {
    rules = expandLiquidateIfNeeded(rules, input.holdings, input.message)
    rules = expandDiversifyIfNeeded(rules, input.holdings, input.message)
    rules = expandBuyLadderIfNeeded(rules, input.message)
  } else if (parsed.data.kind !== 'propose' && parsed.data.kind !== 'execute') {
    rules = []
  }

  // Model clarified / failed to emit rules, but the prompt is a clear compileable order.
  if (
    rules.length === 0 &&
    (parsed.data.kind === 'clarify' ||
      parsed.data.kind === 'chat' ||
      parsed.data.kind === 'propose' ||
      parsed.data.kind === 'cannot')
  ) {
    const deterministic = proposeFromFallback(input.message)
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
    rule: rules[0] ?? null,
    rules,
    interpretation: rules.length > 0 ? interpretRules(rules) : null,
    provider: llm.provider,
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
function coerceRules(rulesRaw: unknown, ruleRaw: unknown): CompiledRule[] {
  const blobs: unknown[] = []
  if (Array.isArray(rulesRaw)) {
    blobs.push(...rulesRaw)
  }
  if (ruleRaw != null) {
    blobs.push(ruleRaw)
  }

  const out: CompiledRule[] = []
  for (const blob of blobs) {
    const coerced = coerceOneRule(blob)
    if (coerced) out.push(coerced)
  }
  return out
}

function coerceOneRule(raw: unknown): CompiledRule | null {
  const direct = compiledRuleSchema.safeParse(raw)
  if (direct.success) return direct.data

  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
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

function proposeFromFallback(message: string): {
  ok: true
  kind: 'propose'
  reply: string
  rule: CompiledRule | null
  rules: CompiledRule[]
  interpretation: string | null
} | null {
  const compiled = fallbackCompile(message)
  if ('rejection' in compiled) return null
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

/** Expand “sell all stocks to USDC” into one market sell per non-USDC holding. */
function expandLiquidateIfNeeded(
  rules: CompiledRule[],
  holdings: HoldingHint[] | undefined,
  message: string,
): CompiledRule[] {
  const lower = message.toLowerCase()
  const wantsLiquidate =
    /(sell|liquidate).*(all|everything).*(stock|token|asset|holding)|sell\s+all\s+(my\s+)?(stocks?|tokens?|assets?).*usdc|convert\s+everything\s+to\s+usdc/i.test(
      lower,
    )
  if (!wantsLiquidate || !holdings || holdings.length === 0) return rules

  const alreadyMultiMarket =
    rules.length > 1 &&
    rules.every(
      (r) =>
        r.type === 'take_profit' &&
        r.unit === 'amount' &&
        r.value === 0 &&
        r.actionValue === 100,
    )
  if (alreadyMultiMarket) return rules

  const sells: CompiledRule[] = []
  for (const row of holdings) {
    const symbol = normalizeAsset(row.symbol) ?? row.symbol.toUpperCase()
    if (symbol === 'USDC' || symbol === 'SOL') continue
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
  return sells.length > 0 ? sells : rules
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

function explainMissingBalances(
  rules: CompiledRule[],
  holdings?: HoldingHint[],
): string | null {
  const rows = holdings ?? []
  if (rows.length === 0) return null

  const missingSells: string[] = []
  for (const rule of rules.filter(isSellSideRule)) {
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
    return `I can’t arm sells for **${missingSells.join(', ')}** yet — your wallet shows no balance. Use **Faucet** on Spot, then reply **yes**.`
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

  const wallet = context.walletConnected
    ? 'Wallet is connected.'
    : 'Wallet may not be connected.'

  const diversifyHint =
    nonUsdcHoldings.length > 0
      ? `Known non-USDC holdings for diversify defaults: ${nonUsdcHoldings.join(', ')}.`
      : 'If holdings unknown and user says “keep diversified” without %, propose max_allocation 40% for NVDAx only and say they can name more assets.'

  return `You are Mera Autopilot — a programmable portfolio manager.
You turn natural language into ONE OR MORE living rules (a plan), then wait for confirmation before anything runs.

Intent families:
1) Guard (max_allocation) — concentration caps / “keep diversified”
2) Cash floor (min_allocation, usually USDC) — always keep at least $X cash
3) Sell orders — take_profit, stop_loss, sell-all stocks → USDC
   Market sell NOW = take_profit with unit "amount" and value 0 (always triggered).
4) Buy orders — market_buy / limit_buy (and ladders of several limit buys)

Return JSON only (no markdown):
{
  "kind": "clarify" | "propose" | "cannot" | "chat" | "execute",
  "reply": "human message to show in chat",
  "rules": [ /* 1..N compiled rule objects */ ],
  "rule": null
}
Prefer "rules". You may also set "rule" as a single-rule alias (client normalizes).

Kinds:
- clarify — missing critical detail; ask ONE focused question. rules=[]
- propose — explain the plan in plain English; ask them to reply yes/confirm. Include rules.
- execute — user confirmed the pending plan. Include the same rules.
- cannot — impossible (zero balance when holdings listed, wallet needed, unsupported). rules=[]
- chat — general Mera question, not a portfolio action. rules=[]

Rule schema:
- max_allocation | min_allocation | take_profit | stop_loss | market_buy | limit_buy
- NEVER invent types like market_sell — encode market sells as take_profit value 0.
- nvidia/NVDA → asset "NVDAx"; tesla/TSLA → "TSLAx"
- Buys: {"type":"market_buy"|"limit_buy","asset":"NVDAx","unit":"amount","value":<shares>,"payAsset":"USDC","limitPrice":<usd or null>}
- Sells now: {"type":"take_profit","asset":"TSLAx","unit":"amount","value":0,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}
- "Buy 5 nvidia" WITHOUT pay asset → clarify: ask what to exchange / pay with, and LIST available balances from Holdings (qty + ~USD). Do NOT invent balances.
- After pay asset known but price style unknown → clarify: market now OR a fixed/limit USD price?
- Ladder: "buy 2 at $80, 5 at $100, 8 at $105" → MULTIPLE limit_buy rules (same asset + payAsset). If payAsset missing, ask once then propose the full ladder.
- Default payAsset to USDC only when user said "with USDC/cash" or clearly implied; otherwise clarify.
- Sell schema: take_profit / stop_loss (market sell = take_profit amount 0).

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

User: "Keep my portfolio diversified, never let Nvidia exceed 40%, and always keep at least $500 USDC"
→ {"kind":"propose","reply":"I'll activate a portfolio plan: **max 40% NVDAx**, diversify caps, and **at least $500 USDC**. Reply **yes**.","rules":[{"type":"max_allocation","asset":"NVDAx","unit":"percent","value":40},{"type":"min_allocation","asset":"USDC","unit":"amount","value":500}]}

User: "Sell if NVDAx drops to $80"
→ {"kind":"propose","reply":"I'll set a **stop-loss**: sell **100% of NVDAx at or below $80**. Reply **yes**.","rules":[{"type":"stop_loss","asset":"NVDAx","unit":"amount","value":80,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}]}

Rules:
- Prefer holdings tickers; typos like navidia → NVDAx; tesla → TSLAx.
- Be concise. Never claim you already bought/sold unless kind is execute (client still must arm).
- Output JSON only.

${wallet}
Holdings: ${holdings}
${diversifyHint}
${pending}`
}
