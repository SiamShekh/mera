/** Shared display helpers for money / quantities */

export function formatMoney(value: number, showSign = false) {
  const absolute = Math.abs(value)
  const formatted = absolute.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })

  if (!Number.isFinite(value)) {
    return '$0.00'
  }
  if (showSign && value > 0) {
    return `+${formatted}`
  }
  if (showSign && value < 0) {
    return `-${formatted}`
  }
  return value < 0 ? `-${formatted}` : formatted
}

export function formatQty(value: number) {
  if (!Number.isFinite(value)) {
    return '0'
  }
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

export function formatSol(value: number) {
  if (!Number.isFinite(value) || value === 0) {
    return '0 SOL'
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
}

export function formatPercent(value: number | null) {
  if (value == null || !Number.isFinite(value)) {
    return '—'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function shortenAddress(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}
