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

  const stopLoss = tryStopLoss(text, lower)
  if (stopLoss) return stopLoss

  const buyOrder = tryBuyOrder(text, lower)
  if (buyOrder) return buyOrder

  const absolutePrice = tryAbsolutePriceSell(text, lower)
  if (absolutePrice) return absolutePrice

  const marketSell = tryMarketSell(text, lower)
  if (marketSell) return marketSell

  const takeProfit = tryTakeProfit(text, lower)
  if (takeProfit) return takeProfit

  const maxAlloc = tryMaxAllocation(text, lower)
  if (maxAlloc) return maxAlloc

  const minAlloc = tryMinAllocation(text, lower)
  if (minAlloc) return minAlloc

  return rejection(
    'unsupported',
    'Could not compile that into a supported rule. Try something like “sell 50% of NVIDIA above $100”, “stop loss NVDAx at $80”, or “keep at least $100 USDC”.',
  )
}

/**
 * Market sell now: "Sell 50% of my NVIDIA" / "sell all my NVIDIA at the current price"
 * Encoded as take_profit unit=amount value=0 (always triggered).
 */
function tryMarketSell(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  // Deferred limit/TP (not "at the current/market price")
  const hasDeferredTrigger =
    /(above|over|reaches|hits|goes above|at or above)\s*\$?\s*\d/i.test(text) ||
    /(when|if).*(up|profit|gain)\s*\d/i.test(text) ||
    /(when|if).*(price|\$).*(above|over|reaches|hits)/i.test(text)
  if (hasDeferredTrigger) return null

  const looksLikeSell = /\bsell\b/i.test(text)
  if (!looksLikeSell) return null

  const actionValue = extractSellSizePercent(lower)
  if (actionValue === null) return null
  if (!(actionValue > 0) || actionValue > 100) {
    return rejection(
      'invalid_percent',
      'Sell size percent must be between 0 and 100.',
    )
  }

  let asset = extractAsset(text)
  if (!asset && /(coin|token|stock|holding)/i.test(text)) {
    asset = normalizeAsset('NVDAx')
  }
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset to sell (e.g. NVIDIA / NVDAx).',
    )
  }

  return {
    type: 'take_profit',
    asset,
    unit: 'amount',
    value: 0,
    actionUnit: 'percent',
    actionValue,
    sellBasis: 'position',
  }
}

/** 50% / all / entire / everything → sell size percent. */
function extractSellSizePercent(lower: string): number | null {
  if (
    /(sell\s+)?(all|everything|the\s+entire|my\s+entire|the\s+whole|my\s+whole)\b/.test(
      lower,
    ) ||
    /\b100\s*%/.test(lower)
  ) {
    return 100
  }

  const sellPctMatch =
    lower.match(/sell\s+(\d+(?:\.\d+)?)\s*%/) ??
    lower.match(/(\d+(?:\.\d+)?)\s*%\s*(of\s+)?(my\s+)?/)
  if (!sellPctMatch) return null
  return Number(sellPctMatch[1])
}

/**
 * Absolute USD price trigger: "Sell 50% of NVIDIA when the price goes above $100."
 * Encoded as take_profit with unit=amount (price USD) + action sell size.
 */
function tryAbsolutePriceSell(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const looksLikePriceTrigger =
    /(sell).*(when|if).*(price|\$)?[^\n.]{0,40}(above|over|reaches|hits|goes above|at or above)/i.test(
      text,
    ) ||
    /(when|if).*(price|\$)?[^\n.]{0,40}(above|over|reaches|hits).{0,40}(sell)/i.test(
      text,
    )
  if (!looksLikePriceTrigger) return null

  const actionValue = extractSellSizePercent(lower)
  const priceMatch =
    lower.match(
      /(?:above|over|reaches|hits|goes above|at or above)\s*\$?\s*(\d+(?:\.\d+)?)/,
    ) ?? lower.match(/\$\s*(\d+(?:\.\d+)?)/)

  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset for this price trigger (e.g. NVIDIA / NVDAx).',
    )
  }
  if (actionValue === null) {
    return rejection(
      'missing_details',
      'Say how much to sell (e.g. “sell 50% …” or “sell all … when price goes above $100”).',
    )
  }
  if (!priceMatch) {
    return rejection(
      'missing_details',
      'Include the USD price trigger (e.g. “above $100”).',
    )
  }

  const value = Number(priceMatch[1])
  if (!(actionValue > 0) || actionValue > 100) {
    return rejection(
      'invalid_percent',
      'Sell size percent must be between 0 and 100.',
    )
  }
  if (!(value > 0)) {
    return rejection('missing_details', 'Price trigger must be greater than 0.')
  }

  return {
    type: 'take_profit',
    asset,
    unit: 'amount',
    value,
    actionUnit: 'percent',
    actionValue,
    sellBasis: 'position',
  }
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

/**
 * Stop-loss: "sell if price drops to $80" / "stop loss at $80" / "if down 15%, sell 50%"
 */
function tryStopLoss(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const looksLikeStop =
    /\bstop[\s-]?loss\b/i.test(text) ||
    /(sell).*(when|if).*(price|\$)?[^\n.]{0,40}(below|under|drops? to|falls? to|goes below|at or below)/i.test(
      text,
    ) ||
    /(when|if).*(price|\$)?[^\n.]{0,40}(below|under|drops? to|falls? to|goes below).{0,40}(sell)/i.test(
      text,
    ) ||
    /(when|if).*(down|drops?|falls?|loses?).{0,20}\d/.test(text)
  if (!looksLikeStop) return null

  // Prefer absolute USD floor when present with below/drop language
  const priceMatch =
    lower.match(
      /(?:below|under|drops?\s+to|falls?\s+to|goes\s+below|at\s+or\s+below|stop[\s-]?loss(?:\s+at)?)\s*\$?\s*(\d+(?:\.\d+)?)/,
    ) ??
    (/\b(below|under|drops?\s+to|falls?\s+to)\b/.test(lower)
      ? lower.match(/\$\s*(\d+(?:\.\d+)?)/)
      : null)

  const percents = [...lower.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) =>
    Number(m[1]),
  )
  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset for this stop-loss (e.g. NVIDIA / NVDAx).',
    )
  }

  let actionValue = extractSellSizePercent(lower)
  if (actionValue === null) {
    actionValue = 100
  }
  if (!(actionValue > 0) || actionValue > 100) {
    return rejection(
      'invalid_percent',
      'Sell size percent must be between 0 and 100.',
    )
  }

  if (priceMatch) {
    const value = Number(priceMatch[1])
    if (!(value > 0)) {
      return rejection('missing_details', 'Stop-loss price must be greater than 0.')
    }
    return {
      type: 'stop_loss',
      asset,
      unit: 'amount',
      value,
      actionUnit: 'percent',
      actionValue,
      sellBasis: 'position',
    }
  }

  if (percents.length >= 1) {
    const trigger = percents[0]
    const action = percents.length >= 2 ? percents[1] : actionValue
    if (trigger > 100 || action > 100) {
      return rejection(
        'invalid_percent',
        'Percent values must be between 0 and 100.',
      )
    }
    return {
      type: 'stop_loss',
      asset,
      unit: 'percent',
      value: trigger,
      actionUnit: 'percent',
      actionValue: action,
      sellBasis: 'position',
    }
  }

  return rejection(
    'missing_details',
    'Stop-loss needs a price floor (e.g. “drops to $80”) or a loss % (e.g. “down 15%”).',
  )
}

/**
 * Buy: "buy 5 nvidia with usdc" / "buy 2 nvdax at $80"
 * Single-leg only in fallback; ladders need the Autopilot agent.
 */
function tryBuyOrder(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  if (!/\bbuy\b/i.test(text)) return null
  // Skip multi-leg ladders — agent handles those
  if ((lower.match(/\bbuy\b/g) ?? []).length > 1) return null

  const qtyMatch =
    lower.match(/\bbuy\s+(\d+(?:\.\d+)?)\s+/) ??
    lower.match(/\b(\d+(?:\.\d+)?)\s+(?:shares?\s+of\s+)?/)
  const priceMatch =
    lower.match(
      /(?:at|@|below|under|limit(?:\s+of)?)\s*\$?\s*(\d+(?:\.\d+)?)/,
    ) ?? null
  const market = /\b(market|now|current\s+price)\b/.test(lower)

  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset to buy (e.g. NVIDIA / NVDAx).',
    )
  }
  if (asset.toUpperCase() === 'USDC') {
    return rejection('unsupported', 'Buy a tokenized stock, not USDC itself.')
  }

  const qty = qtyMatch ? Number(qtyMatch[1]) : null
  if (!(qty != null && qty > 0)) {
    return rejection(
      'missing_details',
      'Say how many shares to buy (e.g. “buy 5 NVDAx …”).',
    )
  }

  let payAsset = normalizeAsset('USDC')
  const withMatch = text.match(
    /\b(?:with|using|paid?\s+with|from)\s+([A-Za-z][A-Za-z0-9._-]*)/i,
  )
  if (withMatch) {
    payAsset = normalizeAsset(withMatch[1]) ?? payAsset
  } else if (!market && !priceMatch) {
    // Missing pay asset AND price — reject so agent clarify can list balances
    return rejection(
      'missing_details',
      'Say what to pay with (e.g. USDC) and whether this is market or a limit price.',
    )
  }

  if (!payAsset) {
    return rejection('missing_details', 'Name the pay asset (usually USDC).')
  }

  if (priceMatch && !market) {
    const limitPrice = Number(priceMatch[1])
    if (!(limitPrice > 0)) {
      return rejection('missing_details', 'Limit price must be greater than 0.')
    }
    return {
      type: 'limit_buy',
      asset,
      unit: 'amount',
      value: qty,
      payAsset,
      limitPrice,
    }
  }

  if (market || (withMatch && !priceMatch)) {
    return {
      type: 'market_buy',
      asset,
      unit: 'amount',
      value: qty,
      payAsset,
      limitPrice: null,
    }
  }

  return rejection(
    'missing_details',
    'Say market now or a limit price (e.g. “at $100”).',
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
    'want',
    'to',
    'i',
    'a',
    'an',
    'coin',
    'coins',
    'token',
    'tokens',
    'stock',
    'stocks',
    'price',
    'goes',
    'above',
    'below',
    'over',
    'under',
    'when',
    'and',
    'or',
    'all',
    'everything',
    'entire',
    'whole',
    'current',
  ])

  const tokens = text.match(/[A-Za-z][A-Za-z0-9._-]*/g) ?? []
  for (const token of tokens) {
    if (stop.has(token.toLowerCase())) continue
    if (token.length < 2) continue
    const normalized = normalizeAsset(token)
    if (normalized) return normalized
  }

  return normalizeAsset(text)
}

function isUnsafe(lower: string): boolean {
  // Allow in-app “sell all stocks / liquidate to USDC”; still block off-wallet drains.
  if (
    /(sell|liquidate).*(all|everything).*(to\s+)?usdc|sell\s+all\s+(my\s+)?(stocks?|tokens?|assets?)/i.test(
      lower,
    )
  ) {
    return /(send (all|everything) to|drain wallet|rug|leverage|margin|short sell|borrow)/i.test(
      lower,
    )
  }
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
