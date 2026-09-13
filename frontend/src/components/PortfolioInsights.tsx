import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/format'
import {
  createSnapshot,
  diffPortfolios,
  validateLargestPosition,
} from '@/lib/portfolioAnalytics'
import {
  clearSnapshot,
  loadSnapshot,
  saveSnapshot,
} from '@/lib/snapshotStorage'
import { cn } from '@/lib/utils'
import type { Holding } from '@/types/holding'
import type { PortfolioSnapshot } from '@/types/portfolioAnalytics'

type PortfolioInsightsProps = {
  ownerAddress: string
  holdings: Holding[]
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/**
 * Spot PnL card — uses snapshot vs current holdings (localStorage, no extra RPC).
 */
export function PortfolioInsights({
  ownerAddress,
  holdings,
}: PortfolioInsightsProps) {
  const [snapshot, setSnapshot] = useState<PortfolioSnapshot | null>(() =>
    loadSnapshot(ownerAddress),
  )

  const largest = useMemo(() => validateLargestPosition(holdings), [holdings])

  const diff = useMemo(() => {
    if (!snapshot || holdings.length === 0) {
      return null
    }
    return diffPortfolios(snapshot, holdings)
  }, [snapshot, holdings])

  function handleSaveSnapshot() {
    const next = createSnapshot(ownerAddress, holdings)
    saveSnapshot(next)
    setSnapshot(next)
  }

  function handleClearSnapshot() {
    clearSnapshot(ownerAddress)
    setSnapshot(null)
  }

  const pnl = diff?.totalValueChange ?? 0
  const pnlPercent = diff?.totalValueChangePercent ?? 0

  return (
    <section className="rounded-2xl bg-card p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">Spot PnL</p>
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="rounded-xl"
            disabled={holdings.length === 0}
            onClick={handleSaveSnapshot}
          >
            Save snapshot
          </Button>
          {snapshot ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl"
              onClick={handleClearSnapshot}
            >
              Clear
            </Button>
          ) : null}
        </div>
      </div>

      <p
        className={cn(
          'text-4xl font-semibold tracking-tight sm:text-5xl',
          pnl > 0 && 'text-positive',
          pnl < 0 && 'text-destructive',
          pnl === 0 && 'text-foreground',
        )}
      >
        {snapshot ? formatMoney(pnl, true) : '$0.00'}
      </p>
      <p className="mt-2 text-sm text-muted-foreground">
        {snapshot
          ? `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}% since snapshot`
          : 'Save a snapshot to track PnL'}
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-border pt-4">
        <div>
          <p className="text-xs text-muted-foreground">Largest position</p>
          <p
            className={cn(
              'mt-1 text-sm font-medium',
              largest.isConcentrated ? 'text-destructive' : 'text-foreground',
            )}
          >
            {largest.holding
              ? `${largest.holding.asset} · ${largest.allocation.toFixed(1)}%`
              : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Snapshot</p>
          <p className="mt-1 text-sm font-medium text-foreground">
            {snapshot ? formatWhen(snapshot.savedAt) : 'None yet'}
          </p>
        </div>
      </div>

      {diff && (diff.added.length > 0 || diff.removed.length > 0) ? (
        <div className="mt-4 space-y-1 text-xs text-muted-foreground">
          {diff.added.length > 0 ? (
            <p>Added: {diff.added.map((row) => row.asset).join(', ')}</p>
          ) : null}
          {diff.removed.length > 0 ? (
            <p>Removed: {diff.removed.map((row) => row.asset).join(', ')}</p>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
