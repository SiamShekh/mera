import { ASSET_ALIASES, normalizeAsset } from './assets'
import type { CompiledRule, CompiledRuleRejection } from '../validators/compile'

export type HoldingPriceHint = {
  symbol: string
  quantity: number
  priceUsd: number
}

/**
 * 7.14 — Deterministic fallback when the LLM is unavailable or returns garbage.
 * Handles clear A/B/C patterns only; otherwise returns a rejection.
 */
export function fallbackCompile(
  prompt: string,
  holdings?: HoldingPriceHint[],
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

  return fallbackCompileClause(text, holdings)
}

/**
 * Compile multi-step prompts (numbered lists / several buy+sell legs) into a plan.
 * Returns null when no valid multi-leg plan can be recovered.
 */
export function fallbackCompileMany(
  prompt: string,
  holdings?: HoldingPriceHint[],
): CompiledRule[] | null {
  const text = prompt.trim()
  if (!text || isUnsafe(text.toLowerCase())) return null

  const clauses = splitIntentClauses(text)
  const rules: CompiledRule[] = []

  if (clauses.length >= 2) {
    for (const clause of clauses) {
      const compiled = fallbackCompileClause(clause, holdings)
      if (compiled && !('rejection' in compiled)) {
        rules.push(compiled)
      }
    }
  }

  if (rules.length >= 2) return rules

  const bundled = tryMultiIntentBundle(text, holdings)
  return bundled && bundled.length >= 1 ? bundled : null
}

/**
 * When we understand the stock and intent but need one detail (e.g. share count),
 * return a broker-style clarify — not a generic “I didn’t get that.”
 */
export function brokerClarifyMessage(
  prompt: string,
  holdings?: HoldingPriceHint[],
): string | null {
  const text = prompt.trim()
  if (!text) return null

  const asset = extractAsset(text)
  const lower = text.toLowerCase()
  const wantsMarketBuy =
    /\bbuy\b/.test(lower) &&
    /\b(current\s+price|market\s+price|at\s+market|now)\b/.test(lower)
  const profitPct = extractProfitPercent(lower)

  if (asset && wantsMarketBuy && profitPct != null) {
    const qty = extractShareQuantity(lower)
    const notional = extractUsdcNotionals(lower)[0]
    if (!(qty != null && qty > 0) && !(notional != null && notional > 0)) {
      return `Got it — buy **${asset} at market**, then sell **100%** when it’s up **${profitPct}%**. How many shares should I buy (or how much USDC to spend)?`
    }
  }

  if (asset && wantsMarketBuy && !/\bsell\b/.test(lower)) {
    const qty = extractShareQuantity(lower)
    const notional = extractUsdcNotionals(lower)[0]
    if (!(qty != null && qty > 0) && !(notional != null && notional > 0)) {
      return `Got it — buy **${asset} at market**. How many shares (or how much USDC)?`
    }
  }

  const compiled = fallbackCompile(text, holdings)
  if ('rejection' in compiled && compiled.rejection.code === 'missing_details') {
    return compiled.rejection.message
  }
  return null
}

function fallbackCompileClause(
  text: string,
  holdings?: HoldingPriceHint[],
): CompiledRule | CompiledRuleRejection {
  const lower = text.toLowerCase()

  const dipBuy = tryDipBuy(text, lower, holdings)
  if (dipBuy) return dipBuy

  const stopLoss = tryStopLoss(text, lower)
  if (stopLoss) return stopLoss

  const buyOrder = tryBuyOrder(text, lower, holdings, { allowMultiBuy: true })
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

/** Split "1. … 2. …" / "1) …" style multi-intent prompts into clauses. */
function splitIntentClauses(prompt: string): string[] {
  const lineNumbered = [
    ...prompt.matchAll(/(?:^|\n)\s*\d+[.)]\s*([^\n]+)/g),
  ].map((match) => match[1]!.trim())
  if (lineNumbered.length >= 2) return lineNumbered

  const markers = [...prompt.matchAll(/\b\d+[.)]\s+/g)]
  if (markers.length < 2) return []

  const parts: string[] = []
  for (let i = 0; i < markers.length; i += 1) {
    const start = markers[i]!.index! + markers[i]![0].length
    const end =
      i + 1 < markers.length ? markers[i + 1]!.index! : prompt.length
    const chunk = prompt.slice(start, end).trim()
    if (chunk.length > 0) parts.push(chunk)
  }
  return parts
}

/**
 * One-shot recovery for “market buy + dip buy + take profit” in a single message
 * even when numbering is messy.
 */
function tryMultiIntentBundle(
  text: string,
  holdings?: HoldingPriceHint[],
): CompiledRule[] | null {
  const ladder = tryBuyLadderWithTakeProfit(text)
  if (ladder && ladder.length >= 2) return ladder

  const buyThenTp = tryBuyThenPercentTakeProfit(text, holdings)
  if (buyThenTp) return buyThenTp

  const lower = text.toLowerCase()
  const buyCount = (lower.match(/\bbuy\b/g) ?? []).length
  const hasSell = /\bsell\b/.test(lower)
  if (buyCount < 1 || (!hasSell && buyCount < 2)) return null

  const rules: CompiledRule[] = []
  const asset = extractAsset(text)
  if (!asset || asset.toUpperCase() === 'USDC') return null

  const notionals = extractUsdcNotionals(lower)
  const dipPct = extractDipPercent(lower)
  const spot = resolveSpotPrice(asset, holdings)

  const marketNotional = notionals[0]
  if (marketNotional != null && /\b(market|current\s+price|now)\b/.test(lower)) {
    const shares = sharesFromNotional(marketNotional, asset, holdings)
    if (shares != null) {
      rules.push({
        type: 'market_buy',
        asset,
        unit: 'amount',
        value: shares,
        payAsset: 'USDC',
        limitPrice: null,
      })
    }
  }

  if (dipPct != null && spot != null && spot > 0) {
    const dipNotional = notionals[1] ?? notionals[0]
    if (dipNotional != null) {
      const limitPrice = Number((spot * (1 - dipPct / 100)).toFixed(4))
      const shares = sharesFromNotional(
        dipNotional,
        asset,
        holdings,
        limitPrice,
      )
      if (shares != null && limitPrice > 0) {
        rules.push({
          type: 'limit_buy',
          asset,
          unit: 'amount',
          value: shares,
          payAsset: 'USDC',
          limitPrice,
        })
      }
    }
  }

  const sell = tryAbsolutePriceSell(text, lower)
  if (sell && !('rejection' in sell)) {
    rules.push(sell)
  }

  return rules.length >= 2 ? rules : null
}

/**
 * “Buy Apple at the current price and sell when I have 10% profit”
 * → market_buy (+ optional qty) + take_profit unit=percent.
 */
function tryBuyThenPercentTakeProfit(
  text: string,
  holdings?: HoldingPriceHint[],
): CompiledRule[] | null {
  const lower = text.toLowerCase()
  if (!/\bbuy\b/.test(lower) || !/\bsell\b/.test(lower)) return null

  const profitPct = extractProfitPercent(lower)
  const wantsMarket =
    /\b(current\s+(?:market\s+)?price|at\s+market|market\s+price)\b/.test(lower)
  if (profitPct == null || !wantsMarket) return null

  const asset = extractAsset(text)
  if (!asset || asset.toUpperCase() === 'USDC') return null

  let qty = extractShareQuantity(lower)
  const notional = extractUsdcNotionals(lower)[0]
  if (!(qty != null && qty > 0) && notional != null) {
    qty = sharesFromNotional(notional, asset, holdings)
  }
  // Without a size we cannot build the buy leg — brokerClarifyMessage handles ask.
  if (!(qty != null && qty > 0)) return null

  return [
    {
      type: 'market_buy',
      asset,
      unit: 'amount',
      value: qty,
      payAsset: 'USDC',
      limitPrice: null,
    },
    {
      type: 'take_profit',
      asset,
      unit: 'percent',
      value: profitPct,
      actionUnit: 'percent',
      actionValue: 100,
      sellBasis: 'position',
    },
  ]
}

function extractProfitPercent(lower: string): number | null {
  const match =
    lower.match(
      /(\d+(?:\.\d+)?)\s*%\s*(?:profit|gain|return|upside)/,
    ) ??
    lower.match(
      /(?:profit|gain|up)\s*(?:of\s*)?(\d+(?:\.\d+)?)\s*%/,
    ) ??
    lower.match(
      /(?:up|rise[sd]?|increase[sd]?)\s+(\d+(?:\.\d+)?)\s*%/,
    )
  if (!match) return null
  const value = Number(match[1])
  if (!(value > 0) || value > 1000) return null
  return value
}

function extractShareQuantity(lower: string): number | null {
  const match =
    lower.match(/\bbuy\s+(\d+(?:\.\d+)?)\s+(?:shares?|stocks?)?\b/) ??
    lower.match(/:\s*(\d+(?:\.\d+)?)\s+(?:shares?|stocks?)\b/) ??
    lower.match(/\b(\d+(?:\.\d+)?)\s+(?:shares?|stocks?)\b/) ??
    lower.match(/\bquantity\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/)
  if (!match) return null
  // Ignore bare "10%" style captures — those include % elsewhere.
  const value = Number(match[1])
  return value > 0 ? value : null
}

/**
 * “Buy Bank of America at $65 (5), at $60 (10), down $2 more (10), sell all at $70”
 * Broker-style natural language → limit buys + take_profit.
 * Proposes even if the user does not hold the asset yet.
 */
function qtyInChunk(chunk: string): number | null {
  const raw =
    chunk.match(/quantity\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)/i)?.[1] ??
    chunk.match(/\bbuy\s+(\d+(?:\.\d+)?)/i)?.[1] ??
    chunk.match(/:\s*(\d+(?:\.\d+)?)\s+(?:stocks?|shares?)/i)?.[1] ??
    chunk.match(
      /(\d+(?:\.\d+)?)\s+(?:more\s+)?(?:stocks?|shares?)/i,
    )?.[1]
  const qty = raw ? Number(raw) : NaN
  return qty > 0 ? qty : null
}

function tryBuyLadderWithTakeProfit(text: string): CompiledRule[] | null {
  if (!/\bbuy\b/i.test(text) && !/quantity\s+is/i.test(text)) return null

  const asset = extractAsset(text)
  if (!asset || asset.toUpperCase() === 'USDC') return null

  const sellBefore =
    text.match(
      /(?:when|if)[\s\S]{0,80}?(?:comes?\s+back(?:\s+again)?\s+(?:at|to)|goes?\s+(?:back\s+)?to|reaches|hits)\s*\$?\s*(\d+(?:\.\d+)?)[\s\S]{0,100}?\bsell\b/i,
    ) ??
    text.match(
      /\bsell\b[\s\S]{0,140}?(?:goes?\s+to|comes?\s+back(?:\s+again)?\s+(?:at|to)|reaches|hits|above|at\s+or\s+above|at)\s*\$?\s*(\d+(?:\.\d+)?)/i,
    )
  const sellClause = text.match(
    /(?:i want to sell|sell\s+all|sell all of)[\s\S]*$/i,
  )?.[0]
  const sellFromClause = sellClause
    ? sellClause.match(
        /(?:goes?\s+to|comes?\s+back(?:\s+again)?\s+(?:at|to)|reaches|hits|above|at)\s*\$?\s*(\d+(?:\.\d+)?)/i,
      )
    : null
  const sellMatch = sellFromClause ?? sellBefore
  const sellPrice = sellMatch ? Number(sellMatch[1]) : null

  const buyLegs: Array<{ qty: number; price: number | 'market' }> = []

  const marketQty = Number(
    text.match(
      /(?:at|@)\s+(?:the\s+)?current(?:\s+market)?\s+price\s*[:\s]+(\d+(?:\.\d+)?)/i,
    )?.[1] ??
      qtyInChunk(
        text.match(
          /(?:at|@)\s+(?:the\s+)?current(?:\s+market)?\s+price([\s\S]{0,48}?)(?=\.|when|if|$)/i,
        )?.[1] ?? '',
      ),
  )
  if (marketQty > 0) {
    buyLegs.push({ qty: marketQty, price: 'market' })
  }

  // Absolute levels, including “goes down to 345” without a $ sign.
  for (const match of text.matchAll(
    /(?:when|if)[\s\S]{0,90}?(?:price\s+)?(?:reaches|goes?\s+(?:down\s+)?to|comes?\s+back(?:\s+again)?\s+(?:at|to)|hits|is|at)\s*\$?\s*(\d+(?:\.\d+)?)([\s\S]{0,160}?)(?=(?:when|if)\b|goes?\s+down\s+by|(?:i want to )?sell\b|$)/gi,
  )) {
    const price = Number(match[1])
    const chunk = match[2] ?? ''
    if (sellPrice != null && price === sellPrice) continue
    if (/\bsell\b/i.test(chunk) && !/\bbuy\b|quantity/i.test(chunk)) continue
    const qty = qtyInChunk(chunk)
    if (qty != null && price > 0) {
      buyLegs.push({ price, qty })
    }
  }

  for (const match of text.matchAll(
    /\bbuy\s+(\d+(?:\.\d+)?).{0,60}?(?:at|@|below|under|reaches|down\s+to)\s*\$?\s*(\d+(?:\.\d+)?)/gi,
  )) {
    const qty = Number(match[1])
    const price = Number(match[2])
    if (sellPrice != null && price === sellPrice) continue
    if (qty > 0 && price > 0) buyLegs.push({ qty, price })
  }

  for (const match of text.matchAll(
    /goes?\s+down\s+by\s*\$?\s*(\d+(?:\.\d+)?)\s*(?:more|further)?([\s\S]{0,100}?)(?=(?:when|if)\b|(?:i want to )?sell\b|$)/gi,
  )) {
    const drop = Number(match[1])
    const qty = qtyInChunk(match[2] ?? '')
    const prev = [...buyLegs].reverse().find((leg) => leg.price !== 'market')
    const base = typeof prev?.price === 'number' ? prev.price : null
    if (base != null && drop > 0 && qty != null) {
      buyLegs.push({ price: Number((base - drop).toFixed(4)), qty })
    }
  }

  const seen = new Set<string>()
  const buys: CompiledRule[] = []
  for (const leg of buyLegs) {
    if (!(leg.qty > 0)) continue
    if (leg.price === 'market') {
      if (seen.has('market')) continue
      seen.add('market')
      buys.push({
        type: 'market_buy',
        asset,
        unit: 'amount',
        value: leg.qty,
        payAsset: 'USDC',
        limitPrice: null,
      })
      continue
    }
    if (sellPrice != null && leg.price === sellPrice) continue
    const key = String(leg.price)
    if (seen.has(key)) continue
    seen.add(key)
    buys.push({
      type: 'limit_buy',
      asset,
      unit: 'amount',
      value: leg.qty,
      payAsset: 'USDC',
      limitPrice: leg.price,
    })
  }

  const rules: CompiledRule[] = [...buys]
  if (sellPrice != null && sellPrice > 0) {
    rules.push({
      type: 'take_profit',
      asset,
      unit: 'amount',
      value: sellPrice,
      actionUnit: 'percent',
      actionValue: 100,
      sellBasis: 'position',
    })
  }

  return rules.length >= 2 ? rules : null
}

/**
 * Market sell now: "Sell 50% of my NVIDIA" / "sell all my NVIDIA at the current price"
 * Encoded as take_profit unit=amount value=0 (always triggered).
 */
function tryMarketSell(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const hasDeferredTrigger =
    /(above|over|reaches|hits|goes above|at or above)\s*\$?\s*\d/i.test(text) ||
    /(when|if).*(up|profit|gain)\s*\d/i.test(text) ||
    /(when|if).*(price|\$).*(above|over|reaches|hits)/i.test(text)
  if (hasDeferredTrigger) return null

  const looksLikeSell = /\bsell\b/i.test(text)
  if (!looksLikeSell) return null

  const actionValue = extractSellSizePercent(lower) ?? 100
  if (!(actionValue > 0) || actionValue > 100) {
    return rejection(
      'invalid_percent',
      'Sell size percent must be between 0 and 100.',
    )
  }

  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset to sell (e.g. NVIDIA / NVDAx).',
    )
  }
  // “Convert into USDC” names the destination, not the sell asset.
  if (
    asset.toUpperCase() === 'USDC' &&
    /(into|to)\s+usdc|convert.{0,40}usdc/i.test(text)
  ) {
    return null
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

/**
 * Sell size percent — only from explicit sell sizing, never from buy-dip “down 5%”.
 * Returns null when omitted so callers can default to 100%.
 */
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
    lower.match(/\bsell\s+(\d+(?:\.\d+)?)\s*%/) ??
    lower.match(/\bsell\s+(\d+(?:\.\d+)?)\s*percent\b/)
  if (!sellPctMatch) return null
  return Number(sellPctMatch[1])
}

/**
 * Absolute USD price trigger: "Sell NVIDIA when the price reaches $125."
 * Encoded as take_profit with unit=amount (price USD) + action sell size.
 */
function tryAbsolutePriceSell(
  text: string,
  lower: string,
): CompiledRule | CompiledRuleRejection | null {
  const looksLikePriceTrigger =
    /(sell).*(when|if|once)?.{0,60}(price|\$)?[^\n.]{0,40}(above|over|reaches|hits|goes(?:\s+above|\s+to)|at or above)/i.test(
      text,
    ) ||
    /(when|if).*(price|\$)?[^\n.]{0,40}(above|over|reaches|hits|goes(?:\s+above|\s+to)).{0,40}(sell)/i.test(
      text,
    ) ||
    /\bsell\b.{0,80}\b(reaches|goes\s+to|hits)\b/i.test(text)
  if (!looksLikePriceTrigger) return null

  const actionValue = extractSellSizePercent(lower) ?? 100
  const priceMatch =
    lower.match(
      /(?:above|over|reaches|hits|goes(?:\s+above|\s+to)|at or above)\s*\$?\s*(\d+(?:\.\d+)?)/,
    ) ?? lower.match(/\$\s*(\d+(?:\.\d+)?)/)

  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset for this price trigger (e.g. NVIDIA / NVDAx).',
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
  // Buy-the-dip language is not a stop-loss.
  if (/\bbuy\b/.test(lower) && !/\bstop[\s-]?loss\b/.test(lower)) {
    return null
  }

  const looksLikeStop =
    /\bstop[\s-]?loss\b/i.test(text) ||
    /(sell).*(when|if).*(price|\$)?[^\n.]{0,40}(below|under|drops? to|falls? to|goes below|at or below)/i.test(
      text,
    ) ||
    /(when|if).*(price|\$)?[^\n.]{0,40}(below|under|drops? to|falls? to|goes below).{0,40}(sell)/i.test(
      text,
    ) ||
    /(sell).*(when|if).*(down|drops?|falls?|loses?).{0,20}\d/.test(text)
  if (!looksLikeStop) return null

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
      return rejection(
        'missing_details',
        'Stop-loss price must be greater than 0.',
      )
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
    const trigger = percents[0]!
    const action = percents.length >= 2 ? percents[1]! : actionValue
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
 * Buy-the-dip: "when price goes down 5%, buy another $2000 of Nvidia with USDC"
 */
function tryDipBuy(
  text: string,
  lower: string,
  holdings?: HoldingPriceHint[],
): CompiledRule | CompiledRuleRejection | null {
  if (!/\bbuy\b/.test(lower)) return null
  const dipPct = extractDipPercent(lower)
  if (dipPct == null) return null

  const asset = extractAsset(text)
  if (!asset) {
    return rejection(
      'missing_details',
      'Name the asset to buy on the dip (e.g. NVIDIA / NVDAx).',
    )
  }
  if (asset.toUpperCase() === 'USDC') {
    return rejection('unsupported', 'Buy a tokenized stock, not USDC itself.')
  }

  const spot = resolveSpotPrice(asset, holdings)
  if (!(spot != null && spot > 0)) {
    return rejection(
      'missing_details',
      `I need a live ${asset} price to turn a ${dipPct}% dip into a limit buy. Connect a wallet or name an absolute limit price.`,
    )
  }

  const limitPrice = Number((spot * (1 - dipPct / 100)).toFixed(4))
  const notional = extractUsdcNotionals(lower)[0]
  const qtyMatch =
    lower.match(/\bbuy\s+(\d+(?:\.\d+)?)\s+/) ??
    lower.match(/\banother\s+(\d+(?:\.\d+)?)\s+/)

  let shares: number | null = null
  if (notional != null) {
    shares = sharesFromNotional(notional, asset, holdings, limitPrice)
  } else if (qtyMatch) {
    shares = Number(qtyMatch[1])
  }

  if (!(shares != null && shares > 0)) {
    return rejection(
      'missing_details',
      'Say how much to buy on the dip (e.g. “buy another $2,000 …” or “buy 5 shares …”).',
    )
  }

  let payAsset = normalizeAsset('USDC')
  const withMatch = text.match(
    /\b(?:with|using|paid?\s+with)\s+([A-Za-z][A-Za-z0-9._-]*)/i,
  )
  if (withMatch) {
    payAsset = normalizeAsset(withMatch[1]!) ?? payAsset
  }
  if (!payAsset) {
    return rejection('missing_details', 'Name the pay asset (usually USDC).')
  }

  return {
    type: 'limit_buy',
    asset,
    unit: 'amount',
    value: shares,
    payAsset,
    limitPrice,
  }
}

/**
 * Buy: "buy 5 nvidia with usdc" / "buy $2000 of nvidia with USDC" / "buy 2 nvdax at $80"
 */
function tryBuyOrder(
  text: string,
  lower: string,
  holdings?: HoldingPriceHint[],
  options: { allowMultiBuy?: boolean } = {},
): CompiledRule | CompiledRuleRejection | null {
  if (!/\bbuy\b/i.test(text)) return null
  if (
    !options.allowMultiBuy &&
    (lower.match(/\bbuy\b/g) ?? []).length > 1
  ) {
    return null
  }

  const qtyMatch =
    lower.match(/\bbuy\s+(\d+(?:\.\d+)?)\s+(?:shares?\s+(?:of\s+)?)?/) ??
    lower.match(/\b(\d+(?:\.\d+)?)\s+(?:shares?\s+of\s+)/)
  const notional = extractUsdcNotionals(lower)[0]
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

  let payAsset = normalizeAsset('USDC')
  const withMatch = text.match(
    /\b(?:with|using|paid?\s+with)\s+([A-Za-z][A-Za-z0-9._-]*)/i,
  )
  if (withMatch) {
    payAsset = normalizeAsset(withMatch[1]!) ?? payAsset
  } else if (!market && !priceMatch && notional == null) {
    return rejection(
      'missing_details',
      'Say what to pay with (e.g. USDC) and whether this is market or a limit price.',
    )
  }

  if (!payAsset) {
    return rejection('missing_details', 'Name the pay asset (usually USDC).')
  }

  let qty =
    qtyMatch && !looksLikeUsdcNotionalQty(lower, qtyMatch)
      ? Number(qtyMatch[1])
      : null
  if (!(qty != null && qty > 0) && notional != null) {
    const limitHint =
      priceMatch && !market ? Number(priceMatch[1]) : undefined
    qty = sharesFromNotional(notional, asset, holdings, limitHint)
  }
  if (!(qty != null && qty > 0)) {
    return rejection(
      'missing_details',
      'Say how many shares to buy, or a USDC amount (e.g. “buy 5 NVDAx …” or “buy $2,000 of Nvidia with USDC”).',
    )
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

  if (market || (withMatch && !priceMatch) || notional != null) {
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
    ) ||
    /(sell).*(when|if).*(up|profit|gain|have)/i.test(text) ||
    /(\d+(?:\.\d+)?)\s*%\s*(?:profit|gain)/i.test(text)
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
    if (trigger! > 100 || action! > 100) {
      return rejection(
        'invalid_percent',
        'Percent values must be between 0 and 100.',
      )
    }
    return {
      type: 'take_profit',
      asset,
      unit: 'percent',
      value: trigger!,
      actionUnit: 'percent',
      actionValue: action!,
      sellBasis: 'position',
    }
  }

  if (percents.length === 1 && dollars.length >= 1) {
    return {
      type: 'take_profit',
      asset,
      unit: 'percent',
      value: percents[0]!,
      actionUnit: 'amount',
      actionValue: dollars[0]!,
      sellBasis: 'position',
    }
  }

  // “Sell when I have 10% profit” → sell 100% of position at +10%.
  if (percents.length === 1) {
    const trigger = percents[0]!
    if (!(trigger > 0) || trigger > 1000) {
      return rejection(
        'invalid_percent',
        'Profit percent must be greater than 0.',
      )
    }
    return {
      type: 'take_profit',
      asset,
      unit: 'percent',
      value: trigger,
      actionUnit: 'percent',
      actionValue: 100,
      sellBasis: 'position',
    }
  }

  return rejection(
    'missing_details',
    'Take-profit needs a trigger (e.g. “when up 10%, sell all”).',
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

/** Pull USDC notionals like "$2,000", "2000 USDC", "using 2,000 USDC". */
function extractUsdcNotionals(lower: string): number[] {
  const out: number[] = []
  const patterns = [
    /\$\s*([\d,]+(?:\.\d+)?)/g,
    /([\d,]+(?:\.\d+)?)\s*usdc\b/g,
    /using\s+([\d,]+(?:\.\d+)?)\s*(?:usdc|usd)?/g,
  ]
  for (const re of patterns) {
    for (const match of lower.matchAll(re)) {
      const value = Number(match[1]!.replace(/,/g, ''))
      if (value > 0) out.push(value)
    }
  }
  return out
}

function extractDipPercent(lower: string): number | null {
  const match =
    lower.match(
      /(?:goes?\s+)?(?:down|drops?|falls?|decreases?)\s+(\d+(?:\.\d+)?)\s*%/,
    ) ??
    lower.match(/(\d+(?:\.\d+)?)\s*%\s*(?:dip|drop|below|cheaper|lower)/) ??
    lower.match(/down\s+(\d+(?:\.\d+)?)\s*%\s*from/)
  if (!match) return null
  const value = Number(match[1])
  if (!(value > 0) || value >= 100) return null
  return value
}

function looksLikeUsdcNotionalQty(
  lower: string,
  qtyMatch: RegExpMatchArray,
): boolean {
  const raw = qtyMatch[1] ?? ''
  const idx = lower.indexOf(raw)
  if (idx < 0) return false
  const window = lower.slice(Math.max(0, idx - 12), idx + raw.length + 12)
  return /\$|usdc|usd/.test(window)
}

function resolveSpotPrice(
  asset: string,
  holdings?: HoldingPriceHint[],
): number | null {
  const want = stripTicker(asset)
  for (const row of holdings ?? []) {
    const have = stripTicker(normalizeAsset(row.symbol) ?? row.symbol)
    if (have === want || nvidiaPair(have, want)) {
      if (row.priceUsd > 0) return row.priceUsd
    }
  }
  const anchors: Record<string, number> = {
    USDC: 1,
    NVDAX: 120,
    SOLX: 150,
    STX: 165,
    TSLAX: 363.92,
    AAPLX: 334.71,
    AMZNX: 253.54,
  }
  return anchors[want] ?? null
}

function sharesFromNotional(
  usd: number,
  asset: string,
  holdings?: HoldingPriceHint[],
  limitPrice?: number,
): number | null {
  const px =
    limitPrice != null && limitPrice > 0
      ? limitPrice
      : resolveSpotPrice(asset, holdings)
  if (!(px != null && px > 0) || !(usd > 0)) return null
  const shares = usd / px
  if (!(shares > 0)) return null
  return Number(shares.toFixed(6))
}

function stripTicker(symbol: string): string {
  return symbol.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function nvidiaPair(a: string, b: string): boolean {
  const nvidia = new Set(['NVDA', 'NVDAX', 'NVIDIA', 'NVIDIAXSTOCK'])
  return nvidia.has(a) && nvidia.has(b)
}

/** Prefer known catalog aliases; never treat English filler words as tickers. */
function extractAsset(text: string): string | null {
  const lower = text.toLowerCase()
  const usdcIsDestination =
    /(into|to)\s+usdc|convert.{0,40}\busdc\b|paid?\s+with\s+usdc|using\s+usdc/i.test(
      lower,
    )

  let best: { symbol: string; len: number } | null = null
  for (const entry of ASSET_ALIASES) {
    if (usdcIsDestination && entry.symbol.toUpperCase() === 'USDC') {
      continue
    }
    const candidates = [entry.symbol.toLowerCase(), ...entry.aliases]
    for (const alias of candidates) {
      if (alias.length < 2) continue
      if (!includesAsWord(lower, alias)) continue
      if (!best || alias.length > best.len) {
        best = { symbol: entry.symbol, len: alias.length }
      }
    }
  }
  if (best) return best.symbol

  const stop = new Set([
    'when',
    'if',
    'then',
    'sell',
    'buy',
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
    'and',
    'or',
    'all',
    'everything',
    'entire',
    'whole',
    'current',
    'need',
    'needs',
    'needed',
    'no',
    'not',
    'yes',
    'yeah',
    'like',
    'likes',
    'take',
    'multiple',
    'actions',
    'action',
    'using',
    'another',
    'from',
    'reaches',
    'reach',
    'market',
    'please',
    'with',
    'for',
    'this',
    'that',
    'have',
    'has',
    'will',
    'would',
    'should',
    'could',
    'into',
    'after',
    'before',
    'once',
    'down',
    'drop',
    'drops',
  ])

  const tokens = text.match(/[A-Za-z][A-Za-z0-9._-]*/g) ?? []
  for (const token of tokens) {
    if (stop.has(token.toLowerCase())) continue
    if (token.length < 2) continue
    const normalized = normalizeAsset(token)
    if (normalized) return normalized
  }

  return null
}

function includesAsWord(haystack: string, needle: string): boolean {
  if (needle.includes(' ')) {
    return haystack.includes(needle)
  }
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
}

function isUnsafe(lower: string): boolean {
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
