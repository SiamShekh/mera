import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
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
import type { Holding } from '@/types/holding'
import type { PortfolioSnapshot } from '@/types/portfolioAnalytics'

type PortfolioInsightsProps = {
  ownerAddress: string
  holdings: Holding[]
}

function formatMoney(value: number) {
  const absolute = Math.abs(value)
  const formatted = absolute.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
  if (value > 0) {
    return `+${formatted}`
  }
  if (value < 0) {
    return `-${formatted}`
  }
  return formatted
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/**
 * Snapshot / diff / largest-position tools.
 * Snapshots are stored in localStorage (no extra RPC calls).
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

  if (holdings.length === 0) {
    return null
  }

  return (
    <div className="w-full space-y-4 border-t border-border pt-6 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-medium text-foreground">Portfolio tools</h2>
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={handleSaveSnapshot}>
            Save snapshot
          </Button>
          {snapshot ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={handleClearSnapshot}
            >
              Clear snapshot
            </Button>
          ) : null}
        </div>
      </div>

      {/* Largest position validation */}
      <div className="space-y-1">
        <p className="text-muted-foreground">Largest position</p>
        <p
          className={
            largest.isConcentrated
              ? 'font-medium text-destructive'
              : 'font-medium text-foreground'
          }
        >
          {largest.message}
        </p>
      </div>

      {/* Snapshot + difference */}
      {snapshot ? (
        <div className="space-y-2">
          <p className="text-muted-foreground">
            Snapshot from {formatWhen(snapshot.savedAt)}
          </p>

          {diff ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Value change</span>
                <span className="font-medium text-foreground">
                  {formatMoney(diff.totalValueChange)} (
                  {diff.totalValueChangePercent >= 0 ? '+' : ''}
                  {diff.totalValueChangePercent.toFixed(1)}%)
                </span>
              </div>

              {diff.added.length > 0 ? (
                <p className="text-muted-foreground">
                  Added: {diff.added.map((row) => row.asset).join(', ')}
                </p>
              ) : null}

              {diff.removed.length > 0 ? (
                <p className="text-muted-foreground">
                  Removed: {diff.removed.map((row) => row.asset).join(', ')}
                </p>
              ) : null}

              {diff.changed.some((row) => row.valueChange !== 0) ? (
                <ul className="space-y-1">
                  {diff.changed
                    .filter((row) => row.valueChange !== 0)
                    .map((row) => (
                      <li
                        key={row.mint}
                        className="flex items-center justify-between gap-4"
                      >
                        <span className="text-foreground">{row.asset}</span>
                        <span className="text-muted-foreground">
                          {formatMoney(row.valueChange)} ·{' '}
                          {row.allocationAfter.toFixed(1)}% (was{' '}
                          {row.allocationBefore.toFixed(1)}%)
                        </span>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="text-muted-foreground">
                  No value changes vs snapshot yet.
                </p>
              )}
            </div>
          ) : null}
        </div>
      ) : (
        <p className="text-muted-foreground">
          Save a snapshot to compare later (stored in this browser only).
        </p>
      )}
    </div>
  )
}
