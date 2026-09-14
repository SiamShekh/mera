import { normalizeAsset } from './assets'
import type { CompiledRule, CompiledRuleRejection } from '../validators/compile'

/**
 * 7.14 — Deterministic fallback when the LLM is unavailable or returns garbage.
 * Handles clear A/B/C patterns only; otherwise returns a rejection.
 */
export function fallbackCompile(
  prompt: string,
): CompiledRule | CompiledRuleRejection {
  const text = prompt.trim()
  if (!text) {
    return rejection('missing_details', 'Prompt is empty.')
  }

  const lower = text.toLowerCase()

  if (isUnsafe(lower)) {
    return rejection(
      'unsafe',
      'That instruction looks unsafe or unsupported (e.g. leverage, wipeout, or off-wallet transfer).',
    )
  }

  if (isVague(lower)) {
    return rejection(
      'ambiguous',
      'That instruction is too vague. Name an asset and a clear percent or dollar amount.',
    )
  }

  const takeProfit = tryTakeProfit(text, lower)
  if (takeProfit) return takeProfit

  const maxAlloc = tryMaxAllocation(text, lower)
  if (maxAlloc) return maxAlloc

  const minAlloc = tryMinAllocation(text, lower)
  if (minAlloc) return minAlloc

  return rejection(
    'unsupported',
    'Could not compile that into a supported rule. Try something like “NVDA never above 40%” or “keep at least $100 USDC”.',
  )
}

function tryMaxAllocation(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const looksLikeCap =
    /(never exceed|not exceed|no more than|at most|maximum|cap|must never be more than|should not be more than)/i.test(
      text,
    )
  if (!looksLikeCap) return null

  const amount = extractDollar(lower)
  const percent = extractPercent(lower)
  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset for this cap rule (e.g. SOL, BONK, NVDA).',
    )
  }

  if (amount !== null) {
    return {
      type: 'max_allocation',
      asset,
      unit: 'amount',
      value: amount,
    }
  }

  if (percent !== null) {
    if (percent > 100) {
      return rejection('invalid_percent', 'Percent cannot exceed 100.')
    }
    return {
      type: 'max_allocation',
      asset,
      unit: 'percent',
      value: percent,
    }
  }

  return rejection(
    'missing_details',
    'Cap rule needs a percent or dollar amount.',
  )
}

function tryMinAllocation(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const looksLikeFloor =
    /(at least|minimum|no less than|keep .* cash|floor)/i.test(text)
  if (!looksLikeFloor) return null

  const amount = extractDollar(lower)
  const percent = extractPercent(lower)
  const asset = extractAsset(text) ?? normalizeAsset('USDC')
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset for this floor rule (e.g. USDC, SOL).',
    )
  }

  if (amount !== null) {
    return {
      type: 'min_allocation',
      asset,
      unit: 'amount',
      value: amount,
    }
  }

  if (percent !== null) {
    if (percent > 100) {
      return rejection('invalid_percent', 'Percent cannot exceed 100.')
    }
    return {
      type: 'min_allocation',
      asset,
      unit: 'percent',
      value: percent,
    }
  }

  return rejection(
    'missing_details',
    'Floor rule needs a percent or dollar amount.',
  )
}

function tryTakeProfit(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const looksLikeTp =
    /(when|if).*(up|profit|gain|rises|increase).*(sell|take profit|take-profit)/i.test(
      text,
    ) || /(sell).*(when|if).*(up|profit|gain)/i.test(text)
  if (!looksLikeTp) return null

  const percents = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) =>
    Number(m[1]),
  )
  const dollars = [...lower.matchAll(/\$\s*(\d+(?:\.\d+)?)/g)].map((m) =>
    Number(m[1]),
  )
  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset for this take-profit rule.',
    )
  }

  if (percents.length >= 2) {
    const [trigger, action] = percents
    if (trigger > 100 || action > 100) {
      return rejection(
        'invalid_percent',
        'Percent values must be between 0 and 100.',
      )
    }
    return {
      type: 'take_profit',
      asset,
      unit: 'percent',
      value: trigger,
      actionUnit: 'percent',
      actionValue: action,
      sellBasis: 'position',
    }
  }

  if (percents.length === 1 && dollars.length >= 1) {
    return {
      type: 'take_profit',
      asset,
      unit: 'percent',
      value: percents[0],
      actionUnit: 'amount',
      actionValue: dollars[0],
      sellBasis: 'position',
    }
  }

  return rejection(
    'missing_details',
    'Take-profit needs a trigger and a sell size (e.g. “up 20%, sell 10%”).',
  )
}

function extractPercent(lower: string): number | null {
  const match = lower.match(/(\d+(?:\.\d+)?)\s*%/)
  return match ? Number(match[1]) : null
}

function extractDollar(lower: string): number | null {
  const match = lower.match(/\$\s*(\d+(?:\.\d+)?)/)
  return match ? Number(match[1]) : null
}

/** Pull any plausible ticker from the prompt (aliases optional, not required). */
function extractAsset(text: string): string | null {
  const stop = new Set([
    'when',
    'if',
    'then',
    'sell',
    'keep',
    'at',
    'least',
    'never',
    'exceed',
    'more',
    'than',
    'must',
    'my',
    'the',
    'of',
    'portfolio',
    'percent',
    'up',
    'in',
    'profit',
  ])

  const tokens = text.match(/[A-Za-z][A-Za-z0-9._-]*/g) ?? []
  for (const token of tokens) {
    if (stop.has(token.toLowerCase())) continue
    const normalized = normalizeAsset(token)
    if (normalized) return normalized
  }

  return normalizeAsset(text)
}

function isUnsafe(lower: string): boolean {
  return /(leverage|margin|short sell|liquidate everything|send (all|everything) to|drain wallet|rug|borrow)/i.test(
    lower,
  )
}

function isVague(lower: string): boolean {
  return /^(manage|optimize|improve|be careful|do what.?s best|help with my portfolio)\b/i.test(
    lower,
  )
}

function rejection(
  code: CompiledRuleRejection['rejection']['code'],
  message: string,
): CompiledRuleRejection {
  return { rejection: { code, message } }
}
