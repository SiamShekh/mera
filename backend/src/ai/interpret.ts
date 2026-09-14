import type { CompiledRule } from '../validators/compile'

/** 7.09 — Human-readable interpretation of a compiled rule. */
export function interpretRule(rule: CompiledRule, prompt?: string): string {
  const valueLabel = formatMeasure(rule.unit, rule.value)

  if (rule.type === 'max_allocation') {
    return [
      `Cap ${rule.asset} at ${valueLabel} of your portfolio.`,
      `If ${rule.asset} rises above that level, the system should reduce the position until it is back within the limit.`,
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
      `If the balance falls below that floor, the system should top it up.`,
      prompt ? `Based on: “${prompt}”` : null,
    ]
      .filter(Boolean)
      .join(' ')
  }

  const trigger = formatMeasure(rule.unit, rule.value)
  const action = formatMeasure(rule.actionUnit, rule.actionValue)
  const basis =
    rule.sellBasis === 'portfolio'
      ? 'of your total portfolio'
      : `of your ${rule.asset} position`

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
