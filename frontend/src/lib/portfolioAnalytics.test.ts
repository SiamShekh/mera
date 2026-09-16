import { describe, expect, it } from 'vitest'

import {
  createSnapshot,
  diffPortfolios,
  findLargestPosition,
  getTotalValue,
  validateLargestPosition,
} from '@/lib/portfolioAnalytics'
import { makeHolding } from '@/test/fixtures'

describe('portfolio analytics', () => {
  const sol = makeHolding({
    asset: 'SOL',
    mint: 'native',
    quantity: 2,
    price: 100,
    value: 200,
    valueInSol: 2,
    allocation: 80,
  })

  const usdc = makeHolding({
    asset: 'USDC',
    mint: 'usdc-mint',
    quantity: 50,
    price: 1,
    value: 50,
    valueInSol: 0.5,
    allocation: 20,
  })

  it('sums total USD value', () => {
    expect(getTotalValue([sol, usdc])).toBe(250)
  })

  it('creates a snapshot without mutating later edits', () => {
    const holdings = [sol, usdc]
    const snapshot = createSnapshot(
      'Wallet111',
      holdings,
      '2026-01-01T00:00:00.000Z',
    )

    expect(snapshot.owner).toBe('Wallet111')
    expect(snapshot.totalValue).toBe(250)
    expect(snapshot.totalValueInSol).toBe(2.5)
    expect(snapshot.savedAt).toBe('2026-01-01T00:00:00.000Z')

    // Mutating the original array must not change the snapshot copy
    holdings[0] = { ...sol, value: 999 }
    expect(snapshot.holdings[0].value).toBe(200)
  })

  it('finds the largest position by USD value', () => {
    expect(findLargestPosition([sol, usdc])?.asset).toBe('SOL')
    expect(findLargestPosition([])).toBeNull()
  })

  it('validates concentration when one asset is too large', () => {
    const result = validateLargestPosition([sol, usdc], 50)
    expect(result.holding?.asset).toBe('SOL')
    expect(result.isConcentrated).toBe(true)
    expect(result.message).toContain('80.0%')
  })

  it('passes validation when below the threshold', () => {
    const balancedSol = makeHolding({
      ...sol,
      value: 120,
      allocation: 48,
    })
    const balancedUsdc = makeHolding({
      ...usdc,
      value: 130,
      allocation: 52,
    })

    const result = validateLargestPosition([balancedSol, balancedUsdc], 60)
    expect(result.isConcentrated).toBe(false)
    expect(result.holding?.asset).toBe('USDC')
  })

  it('diffs snapshot vs current holdings', () => {
    const snapshot = createSnapshot(
      'Wallet111',
      [sol, usdc],
      '2026-01-01T00:00:00.000Z',
    )

    const solLater = makeHolding({
      ...sol,
      quantity: 3,
      value: 300,
      allocation: 75,
    })
    const jup = makeHolding({
      asset: 'JUP',
      mint: 'jup-mint',
      quantity: 10,
      price: 1,
      value: 10,
      allocation: 2.5,
    })

    // USDC removed, SOL grew, JUP added
    const diff = diffPortfolios(snapshot, [solLater, jup])

    expect(diff.totalValueBefore).toBe(250)
    expect(diff.totalValueAfter).toBe(310)
    expect(diff.totalValueChange).toBe(60)
    expect(diff.totalValueChangePercent).toBeCloseTo(24, 5)

    expect(diff.added.map((row) => row.asset)).toEqual(['JUP'])
    expect(diff.removed.map((row) => row.asset)).toEqual(['USDC'])

    const solDiff = diff.changed.find((row) => row.mint === 'native')
    expect(solDiff?.quantityChange).toBe(1)
    expect(solDiff?.valueChange).toBe(100)
    expect(solDiff?.allocationBefore).toBe(80)
    expect(solDiff?.allocationAfter).toBe(75)
  })

  it('treats locked escrow as the same net worth', () => {
    const available = makeHolding({
      ...usdc,
      quantity: 20,
      value: 20,
      allocation: 8,
    })
    const locked = makeHolding({
      ...usdc,
      quantity: 30,
      value: 30,
      allocation: 12,
      locked: true,
    })
    const snapshot = createSnapshot('Wallet111', [sol, usdc])
    const diff = diffPortfolios(snapshot, [sol, available, locked])

    expect(diff.totalValueAfter).toBe(250)
    expect(diff.totalValueChange).toBe(0)
    const usdcDiff = diff.changed.find((row) => row.mint === 'usdc-mint')
    expect(usdcDiff?.quantityChange).toBe(0)
    expect(usdcDiff?.valueChange).toBe(0)
  })
})
