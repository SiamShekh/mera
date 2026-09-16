import type { CompiledRule } from '../validators/compile'
import { isBuySideRule } from '../validators/compile'

/** 7.09 — Human-readable interpretation of a compiled rule. */
export function interpretRule(rule: CompiledRule, prompt?: string): string {
  const valueLabel = formatMeasure(rule.unit, rule.value)

  if (rule.type === 'max_allocation') {
    return [
      `Cap ${rule.asset} at ${valueLabel} of your portfolio.`,
      `If ${rule.asset} rises above that level, Autopilot trims the excess into USDC.`,
      prompt ? `Based on: “${prompt}”` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }

  if (rule.type === 'min_allocation') {
    const basis =
      rule.unit === 'percent' ? `${valueLabel} of your portfolio` : valueLabel
    return [
      `Keep at least ${basis} in ${rule.asset}.`,
      rule.asset.toUpperCase() === 'USDC'
        ? `If cash falls below that floor, Autopilot sells from your largest stock holding to raise USDC.`
        : `If the balance falls below that floor, the system should top it up.`,
      prompt ? `Based on: “${prompt}”` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }

  if (isBuySideRule(rule)) {
    const qty = trimNumber(rule.value)
    if (rule.type === 'market_buy') {
      return [
        `Buy ${qty} ${rule.asset} at market, paid with ${rule.payAsset}.`,
        `Autopilot locks ${rule.payAsset} and fills as soon as the order is armed.`,
        prompt ? `Based on: “${prompt}”` : null,
      ]
        .filter(Boolean)
        .join(' ')
    }
    return [
      `Buy ${qty} ${rule.asset} when price is at or below $${trimNumber(rule.limitPrice ?? 0)}, paid with ${rule.payAsset}.`,
      `If the limit is already met, Autopilot fills after you approve escrow.`,
      prompt ? `Based on: “${prompt}”` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }

  // take_profit | stop_loss
  const trigger = formatMeasure(rule.unit, rule.value)
  const action = formatMeasure(rule.actionUnit, rule.actionValue)
  const basis =
    rule.sellBasis === 'portfolio'
      ? 'of your total portfolio'
      : `of your ${rule.asset} position`

  if (rule.type === 'stop_loss') {
    const when =
      rule.unit === 'amount'
        ? `When ${rule.asset} trades at or below ${trigger}`
        : `When ${rule.asset} is down ${trigger}`
    return [
      `${when}, sell ${action} ${basis} (stop-loss). If the condition is already true, Autopilot sells automatically.`,
      prompt ? `Based on: “${prompt}”` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }

  const when =
    rule.unit === 'amount'
      ? rule.value > 0
        ? `When ${rule.asset} trades at or above ${trigger}`
        : `Sell ${rule.asset} at market now`
      : `When ${rule.asset} is up ${trigger}`

  return [
    rule.unit === 'amount' && !(rule.value > 0)
      ? `${when}: sell ${action} ${basis}. Autopilot executes as soon as the order is armed.`
      : `${when}, sell ${action} ${basis}. If the condition is already true, Autopilot sells automatically.`,
    prompt ? `Based on: “${prompt}”` : null,
  ]
    .filter(Boolean)
    .join(' ')
}

/** Summarize a multi-rule portfolio plan. */
export function interpretRules(rules: CompiledRule[], prompt?: string): string {
  if (rules.length === 0) return ''
  if (rules.length === 1) return interpretRule(rules[0], prompt)
  return rules
    .map((rule, i) => `${i + 1}. ${interpretRule(rule)}`)
    .join('\n\n')
}

function formatMeasure(unit: 'percent' | 'amount', value: number): string {
  if (unit === 'percent') {
    return `${trimNumber(value)}%`
  }
  return `$${trimNumber(value)}`
}

function trimNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)))
}
