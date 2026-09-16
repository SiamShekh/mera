import { ASSET_ALIASES, normalizeAsset } from './assets'

export type OpenOrderHint = {
  id: string
  type: string
  asset: string
  payAsset: string | null
  value: number
  unit: string
  actionValue: number | null
  limitPrice: number | null
  escrowAmount: number | null
  escrowMint: string | null
  prompt: string | null
}

export type CancelTurn = {
  kind: 'propose' | 'cancel' | 'clarify' | 'chat'
  reply: string
  cancelRuleIds: string[]
  clearPending: boolean
}

function assetKey(symbol: string): string {
  return (normalizeAsset(symbol) ?? symbol)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function nvidiaPair(a: string, b: string): boolean {
  const nvidia = new Set(['NVDA', 'NVDAX', 'NVIDIA', 'NVIDIAXSTOCK'])
  return nvidia.has(a) && nvidia.has(b)
}

function assetsMatch(a: string, b: string): boolean {
  const left = assetKey(a)
  const right = assetKey(b)
  return left === right || nvidiaPair(left, right)
}

/** Bare “no / never mind / cancel” with no extra trade instruction. */
export function isSimpleAbort(message: string): boolean {
  return /^(no|nope|nah|never ?mind|forget it|stop|cancel( it| that| this)?|don't|dont)\s*[.!]?\s*$/i.test(
    message.trim(),
  )
}

/**
 * User wants to drop a draft, cancel an armed order, or return locked funds.
 * “No I meant Google” is a correction, not a cancel.
 */
export function isCancelIntent(message: string): boolean {
  const lower = message.trim().toLowerCase()
  if (!lower) return false
  if (
    /^(no|nope)\b/.test(lower) &&
    /\b(meant|actually|instead|google|apple|buy|sell)\b/.test(lower)
  ) {
    return false
  }
  if (isSimpleAbort(message)) return true
  return (
    /\b(cancel|cancelled|canceled|cancelling|canceling)\b/.test(lower) ||
    /\b(delete|remove|drop|void|undo)\s+(that|this|it|the)\b/.test(lower) ||
    /\b(delete|remove|drop|void|undo)\b.{0,48}\b(order|orders|rule|rules|plan|buy|sell|trade|escrow|lock|locked|scrolls?)\b/.test(
      lower,
    ) ||
    /\b(unlock|refund|release|return)\b.{0,48}\b(order|money|usdc|funds?|tokens?|wallet|escrow|lock|locked)\b/.test(
      lower,
    ) ||
    /\bput .{0,32}(back|back in).{0,24}(wallet|usdc)\b/.test(lower)
  )
}

export function summarizeOpenOrder(order: OpenOrderHint): string {
  if (order.type === 'market_buy') {
    return `market buy ${trimNumber(order.value)} ${order.asset}${order.payAsset ? ` with ${order.payAsset}` : ''}`
  }
  if (order.type === 'limit_buy') {
    const limit =
      order.limitPrice != null ? ` ≤ $${trimNumber(order.limitPrice)}` : ''
    return `limit buy ${trimNumber(order.value)} ${order.asset}${limit}`
  }
  if (order.type === 'stop_loss') {
    return `stop-loss on ${order.asset}`
  }
  if (order.type === 'take_profit') {
    return order.unit === 'amount' && !(order.value > 0)
      ? `market sell of ${order.asset}`
      : `take-profit on ${order.asset}`
  }
  if (order.type === 'max_allocation') {
    return `cap on ${order.asset}`
  }
  if (order.type === 'min_allocation') {
    return `floor on ${order.asset}`
  }
  return `${order.type} on ${order.asset}`
}

export function refundLabel(order: OpenOrderHint): string | null {
  if (!(order.escrowAmount != null && order.escrowAmount > 0)) return null
  const symbol = order.payAsset ?? order.asset
  return `${trimNumber(order.escrowAmount)} ${symbol}`
}

function mentionedAsset(message: string): string | null {
  const normalized = normalizeAsset(message)
  if (normalized) return normalized

  const lower = message.toLowerCase()
  let best: { symbol: string; len: number } | null = null
  for (const entry of ASSET_ALIASES) {
    const candidates = [entry.symbol.toLowerCase(), ...entry.aliases]
    for (const alias of candidates) {
      if (alias.length < 2) continue
      if (!lower.includes(alias)) continue
      if (!best || alias.length > best.len) {
        best = { symbol: entry.symbol, len: alias.length }
      }
    }
  }
  return best?.symbol ?? null
}

export function matchOpenOrdersForCancel(
  message: string,
  orders: OpenOrderHint[],
): OpenOrderHint[] {
  if (orders.length === 0) return []
  const lower = message.toLowerCase()
  if (/\b(all|everything)\b/.test(lower)) return orders

  const asset = mentionedAsset(message)
  if (asset) {
    const hits = orders.filter(
      (order) =>
        assetsMatch(order.asset, asset) ||
        (order.payAsset ? assetsMatch(order.payAsset, asset) : false),
    )
    if (hits.length > 0) return hits
  }

  if (
    orders.length === 1 ||
    /\b(that|this|it|the order|the rule|the plan)\b/.test(lower)
  ) {
    return [orders[0]!]
  }
  return []
}

function describeMatches(orders: OpenOrderHint[]): string {
  return orders
    .map((order) => {
      const refund = refundLabel(order)
      return refund
        ? `- **${summarizeOpenOrder(order)}** — return **${refund}** to your wallet`
        : `- **${summarizeOpenOrder(order)}**`
    })
    .join('\n')
}

/**
 * Deterministic cancel brain — runs before the LLM so “cancel my order”
 * never compiles as a new buy/sell.
 */
export function resolveCancelTurn(input: {
  message: string
  pendingRulesCount: number
  pendingCancelIds: string[]
  openOrders: OpenOrderHint[]
}): CancelTurn | null {
  const { message, pendingRulesCount, pendingCancelIds, openOrders } = input

  if (pendingCancelIds.length > 0) {
    if (/^(yes|y|yeah|yep|confirm|ok|okay|sure|do it|go ahead|proceed)\b/i.test(
      message.trim(),
    )) {
      const matched = openOrders.filter((order) =>
        pendingCancelIds.includes(order.id),
      )
      const ids = matched.length > 0 ? matched.map((row) => row.id) : pendingCancelIds
      return {
        kind: 'cancel',
        cancelRuleIds: ids,
        clearPending: true,
        reply:
          ids.length > 1
            ? `Cancelling **${ids.length} orders** and returning locked tokens to your wallet.`
            : 'Cancelling that order and returning locked tokens to your wallet.',
      }
    }
    if (isSimpleAbort(message)) {
      return {
        kind: 'chat',
        cancelRuleIds: [],
        clearPending: true,
        reply:
          'Okay — I’ll keep the order open. Locked funds stay in Autopilot until it fills or you cancel.',
      }
    }
  }

  if (!isCancelIntent(message)) return null

  if (pendingRulesCount > 0 && (isSimpleAbort(message) || openOrders.length === 0)) {
    return {
      kind: 'cancel',
      cancelRuleIds: [],
      clearPending: true,
      reply:
        'Okay — I dropped that draft. Nothing was locked, so your spendable wallet is unchanged.',
    }
  }

  if (openOrders.length === 0) {
    if (pendingRulesCount > 0) {
      return {
        kind: 'cancel',
        cancelRuleIds: [],
        clearPending: true,
        reply:
          'Okay — I dropped that draft. Nothing was locked, so your spendable wallet is unchanged.',
      }
    }
    return {
      kind: 'chat',
      cancelRuleIds: [],
      clearPending: true,
      reply:
        'You don’t have an open Autopilot order to cancel. If something is still a draft, tell me a new instruction and I’ll start over.',
    }
  }

  const matches = matchOpenOrdersForCancel(message, openOrders)
  if (matches.length === 0) {
    return {
      kind: 'clarify',
      cancelRuleIds: [],
      clearPending: false,
      reply: `Which open order should I cancel?\n\n${describeMatches(openOrders)}\n\nSay the stock (or **cancel all**).`,
    }
  }

  const refunds = matches
    .map((order) => refundLabel(order))
    .filter((row): row is string => Boolean(row))

  return {
    kind: 'propose',
    cancelRuleIds: matches.map((order) => order.id),
    clearPending: false,
    reply:
      matches.length === 1
        ? `I’ll **cancel** this Autopilot order:\n${describeMatches(matches)}\n\n${
            refunds.length > 0
              ? `Locked **${refunds.join(', ')}** goes back to your spendable wallet (not left in Autopilot).`
              : 'This rule has nothing locked — I’ll just delete it.'
          }\n\nReply **yes** to confirm.`
        : `I’ll **cancel ${matches.length} orders**:\n${describeMatches(matches)}\n\nLocked tokens return to your spendable wallet. Reply **yes** to confirm.`,
  }
}

function trimNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)))
}
