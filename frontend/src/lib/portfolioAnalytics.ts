import type { Holding } from '@/types/holding'
import type {
  HoldingDiff,
  LargestPositionValidation,
  PortfolioDiff,
  PortfolioSnapshot,
} from '@/types/portfolioAnalytics'
import { DEFAULT_CONCENTRATION_THRESHOLD } from '@/types/portfolioAnalytics'

/** Sum USD values across holdings */
export function getTotalValue(holdings: Holding[]): number {
  return holdings.reduce((sum, row) => sum + row.value, 0)
}

/** Sum SOL values across holdings */
export function getTotalValueInSol(holdings: Holding[]): number {
  return holdings.reduce((sum, row) => sum + row.valueInSol, 0)
}

/**
 * Create a portfolio snapshot from the current holdings list.
 * Pure function — easy to unit test (no network).
 */
export function createSnapshot(
  owner: string,
  holdings: Holding[],
  savedAt: string = new Date().toISOString(),
): PortfolioSnapshot {
  return {
    savedAt,
    owner,
    totalValue: getTotalValue(holdings),
    totalValueInSol: getTotalValueInSol(holdings),
    // Copy so later edits to Redux state cannot mutate the snapshot
    holdings: holdings.map((row) => ({ ...row })),
  }
}

/** Combine wallet + locked lots of the same mint for PnL / concentration. */
export function aggregateHoldingsByMint(holdings: Holding[]): Holding[] {
  const byMint = new Map<string, Holding>()
  for (const row of holdings) {
    const existing = byMint.get(row.mint)
    if (!existing) {
      byMint.set(row.mint, {
        ...row,
        id: row.mint,
        locked: false,
      })
      continue
    }
    byMint.set(row.mint, {
      ...existing,
      quantity: existing.quantity + row.quantity,
      value: existing.value + row.value,
      valueInSol: existing.valueInSol + row.valueInSol,
      allocation: existing.allocation + row.allocation,
    })
  }
  return [...byMint.values()]
}

/**
 * Compare an old snapshot to the latest holdings.
 * Shows value/quantity/allocation differences per token.
 */
export function diffPortfolios(
  snapshot: PortfolioSnapshot,
  current: Holding[],
): PortfolioDiff {
  const beforeByMint = new Map(
    aggregateHoldingsByMint(snapshot.holdings).map(
      (row) => [row.mint, row] as const,
    ),
  )
  const afterByMint = new Map(
    aggregateHoldingsByMint(current).map((row) => [row.mint, row] as const),
  )

  const changed: HoldingDiff[] = []
  const added: Holding[] = []
  const removed: Holding[] = []

  for (const [mint, after] of afterByMint) {
    const before = beforeByMint.get(mint)
    if (!before) {
      added.push(after)
      continue
    }

    changed.push({
      mint,
      asset: after.asset,
      quantityBefore: before.quantity,
      quantityAfter: after.quantity,
      quantityChange: after.quantity - before.quantity,
      valueBefore: before.value,
      valueAfter: after.value,
      valueChange: after.value - before.value,
      allocationBefore: before.allocation,
      allocationAfter: after.allocation,
    })
  }

  for (const [mint, before] of beforeByMint) {
    if (!afterByMint.has(mint)) {
      removed.push(before)
    }
  }

  const totalValueBefore = snapshot.totalValue
  const totalValueAfter = getTotalValue(current)
  const totalValueChange = totalValueAfter - totalValueBefore
  const totalValueChangePercent =
    totalValueBefore > 0 ? (totalValueChange / totalValueBefore) * 100 : 0

  return {
    totalValueBefore,
    totalValueAfter,
    totalValueChange,
    totalValueChangePercent,
    changed,
    added,
    removed,
  }
}

/** Find the holding with the highest USD value (largest position) */
export function findLargestPosition(holdings: Holding[]): Holding | null {
  const aggregated = aggregateHoldingsByMint(holdings)
  if (aggregated.length === 0) {
    return null
  }

  return aggregated.reduce((best, row) => (row.value > best.value ? row : best))
}

/**
 * Validate concentration risk:
 * if the largest position is above the threshold %, flag it.
 */
export function validateLargestPosition(
  holdings: Holding[],
  thresholdPercent: number = DEFAULT_CONCENTRATION_THRESHOLD,
): LargestPositionValidation {
  const holding = findLargestPosition(holdings)

  if (!holding) {
    return {
      holding: null,
      allocation: 0,
      isConcentrated: false,
      message: 'No positions to validate.',
    }
  }

  const isConcentrated = holding.allocation >= thresholdPercent

  return {
    holding,
    allocation: holding.allocation,
    isConcentrated,
    message: isConcentrated
      ? `${holding.asset} is ${holding.allocation.toFixed(1)}% of the portfolio (above ${thresholdPercent}%).`
      : `${holding.asset} is the largest position at ${holding.allocation.toFixed(1)}% (within ${thresholdPercent}% limit).`,
  }
}
