import { z } from 'zod'

import { extractJsonObject, resolveLlmForAgent } from './llm'
import { interpretRule } from './interpret'
import { normalizeAsset } from './assets'
import { compiledRuleSchema, type CompiledRule } from '../validators/compile'
import type { Bindings } from '../types/env'

const agentOutputSchema = z.object({
  kind: z.enum(['clarify', 'propose', 'cannot', 'chat', 'execute']),
  reply: z.string().min(1),
  rule: compiledRuleSchema.optional().nullable(),
})

export type AutopilotAgentResult =
  | {
      ok: true
      kind: 'clarify' | 'propose' | 'cannot' | 'chat' | 'execute'
      reply: string
      rule: CompiledRule | null
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
  },
): Promise<AutopilotAgentResult> {
  const system = buildAutopilotAgentPrompt({
    holdings: input.holdings,
    walletConnected: input.walletConnected,
    pendingRule: input.pendingRule,
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
    return { ok: false, error: llm.reason }
  }

  if (isGarbageModelText(llm.text)) {
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
    // Non-JSON prose from a strong model can still be shown; never show "[object Object]".
    return {
      ok: true,
      kind: 'chat',
      reply: humanizeModelText(llm.text),
      rule: null,
      interpretation: null,
      provider: llm.provider,
    }
  }

  const parsed = agentOutputSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: true,
      kind: 'clarify',
      reply:
        'I want to help, but I need a clearer Autopilot instruction. Which asset, how much (e.g. 50% or all), and at market now or above a USD price?',
      rule: null,
      interpretation: null,
      provider: llm.provider,
    }
  }

  if (isGarbageModelText(parsed.data.reply)) {
    return {
      ok: true,
      kind: 'clarify',
      reply:
        'I want to help, but I need a clearer Autopilot instruction. Which asset, how much (e.g. 50% or all), and at market now or above a USD price?',
      rule: null,
      interpretation: null,
      provider: llm.provider,
    }
  }

  let rule = parsed.data.rule ?? null
  if (
    (parsed.data.kind === 'propose' || parsed.data.kind === 'execute') &&
    rule
  ) {
    const checked = compiledRuleSchema.safeParse(rule)
    if (!checked.success) {
      return {
        ok: true,
        kind: 'clarify',
        reply:
          'I almost had it, but the order details were incomplete. Which asset, how much, and market now vs a price target?',
        rule: null,
        interpretation: null,
        provider: llm.provider,
      }
    }
    rule = checked.data
  } else if (parsed.data.kind !== 'propose' && parsed.data.kind !== 'execute') {
    rule = null
  }

  // If user is confirming and we already have a pending rule, prefer execute
  if (input.pendingRule && parsed.data.kind === 'execute' && !rule) {
    rule = input.pendingRule
  }
  if (
    input.pendingRule &&
    isAffirmative(input.message) &&
    (parsed.data.kind === 'chat' ||
      parsed.data.kind === 'execute' ||
      parsed.data.kind === 'propose')
  ) {
    rule = input.pendingRule
    const blocked = explainMissingBalance(rule, input.holdings)
    if (blocked) {
      return {
        ok: true,
        kind: 'cannot',
        reply: blocked,
        rule: null,
        interpretation: null,
        provider: llm.provider,
      }
    }
    return {
      ok: true,
      kind: 'execute',
      reply:
        parsed.data.reply ||
        'Confirmed — I’ll arm Autopilot with your wallet approval now.',
      rule,
      interpretation: interpretRule(rule),
      provider: llm.provider,
    }
  }

  if (
    rule &&
    (parsed.data.kind === 'propose' || parsed.data.kind === 'execute')
  ) {
    const blocked = explainMissingBalance(rule, input.holdings)
    if (blocked && parsed.data.kind === 'execute') {
      return {
        ok: true,
        kind: 'cannot',
        reply: blocked,
        rule: null,
        interpretation: null,
        provider: llm.provider,
      }
    }
    // Still allow propose so user understands the order; mention balance in reply if empty
    if (blocked && parsed.data.kind === 'propose') {
      return {
        ok: true,
        kind: 'propose',
        reply: `${parsed.data.reply}\n\n⚠️ ${blocked}`,
        rule,
        interpretation: interpretRule(rule),
        provider: llm.provider,
      }
    }
  }

  return {
    ok: true,
    kind: parsed.data.kind,
    reply: parsed.data.reply,
    rule,
    interpretation: rule ? interpretRule(rule) : null,
    provider: llm.provider,
  }
}

function explainMissingBalance(
  rule: CompiledRule,
  holdings?: HoldingHint[],
): string | null {
  if (rule.type !== 'take_profit') return null
  const rows = holdings ?? []
  // Empty holdings usually means the client never loaded the wallet — not "zero balance".
  if (rows.length === 0) {
    return null
  }

  const want =
    normalizeAsset(rule.asset)?.toUpperCase() ?? rule.asset.toUpperCase()
  const hit = rows.find((row) => {
    const have =
      normalizeAsset(row.symbol)?.toUpperCase() ?? row.symbol.toUpperCase()
    return have === want || symbolsMatchNvidia(have, want)
  })
  if (hit && hit.quantity > 0) return null
  return `I can’t execute a sell of **${rule.asset}** yet — your wallet shows no balance for it. Use **Faucet** on Spot to get mock NVDAx, then reply **yes** to confirm.`
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
  pendingRule?: CompiledRule | null
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

  const pending = context.pendingRule
    ? `A proposed order is waiting for user confirmation: ${JSON.stringify(context.pendingRule)}. If they affirm (yes/confirm/ok), return kind "execute" with that same rule.`
    : 'No pending order awaiting confirmation.'

  const wallet = context.walletConnected
    ? 'Wallet is connected.'
    : 'Wallet may not be connected.'

  return `You are Mera Autopilot — a conversational agent that turns natural language into ONE portfolio rule, then waits for confirmation before anything runs.

Return JSON only (no markdown):
{
  "kind": "clarify" | "propose" | "cannot" | "chat" | "execute",
  "reply": "human message to show in chat",
  "rule": null | { compiled rule object }
}

Kinds:
- clarify — missing asset, size, or trigger; ask ONE focused question. rule=null
- propose — you understand the order; explain it in plain English and ask them to reply yes/confirm. Include rule.
- execute — user confirmed the pending order (or clearly said do it now after a proposal). Include rule.
- cannot — impossible right now only when holdings ARE listed and the asset quantity is clearly 0, or wallet disconnected for execute, or unsupported. Explain why. rule=null
- chat — general Mera question, not an order. rule=null

Rule schema (same as compiler):
- max_allocation | min_allocation | take_profit
- nvidia/NVDA → asset "NVDAx"
- "all" / "everything" / "entire" → take_profit actionValue 100, actionUnit "percent", sellBasis "position"
- "at current price" / "now" / "market" → take_profit unit "amount", value 0
- "above $100" → unit "amount", value 100
- Never set asset to "ALL" or "EVERYTHING" — those are size words, not tickers
- If Holdings line is HOLDINGS_UNKNOWN, still propose clear sell orders — do not invent a faucet lecture.

Examples:
User: "Sell all NVDAx at current price"
→ {"kind":"propose","reply":"I'll sell **100% of your NVDAx at market now**. Reply **yes** to approve in your wallet and run Autopilot.","rule":{"type":"take_profit","asset":"NVDAx","unit":"amount","value":0,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}}

User: "sell all nvdax"
→ {"kind":"propose","reply":"I'll sell **100% of your NVDAx at market now**. Reply **yes** to confirm.","rule":{"type":"take_profit","asset":"NVDAx","unit":"amount","value":0,"actionUnit":"percent","actionValue":100,"sellBasis":"position"}}

User: "sell some nvidia"
→ {"kind":"clarify","reply":"How much of your NVDAx — e.g. 25%, 50%, or all — and at market now or only above a USD price?","rule":null}

Rules:
- ONE rule object only — never invent multi-leg plans (e.g. 50% now + 50% later) unless the user asked for that.
- "all" / "everything" / "entire" → actionValue 100 (not 50).
- If they omit market vs price target but said "sell all X", default to market now (unit amount, value 0) and say so clearly.
- Prefer holdings tickers when present; typos like navidia/nvdia → NVDAx.

${wallet}
Holdings: ${holdings}
${pending}

Be concise. Never claim you already sold unless kind is execute (client still must arm). Output JSON only.`
}
