import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { PortfolioInsights } from '@/components/PortfolioInsights'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'

type HoldingsListProps = {
  /** Connected wallet address */
  ownerAddress: string
}

function formatMoney(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '$0.00'
  }
  return value.toLocaleString(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  })
}

function formatQty(value: number) {
  if (value >= 1000) {
    return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
  }
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 })
}

function formatSol(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 SOL'
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 6 })} SOL`
}

function TokenIcon({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false)

  if (!src || broken) {
    return (
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground"
        aria-hidden
      >
        {label.slice(0, 1)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt=""
      className="size-8 shrink-0 rounded-full bg-muted object-cover"
      onError={() => {
        setBroken(true)
      }}
    />
  )
}

/**
 * Shows the connected wallet's holdings bucket:
 * icon, asset, quantity, USD price/value, SOL value, allocation %
 */
export function HoldingsList({ ownerAddress }: HoldingsListProps) {
  const dispatch = useAppDispatch()
  const { holdings, loading, error } = useAppSelector(
    (state) => state.portfolio,
  )

  useEffect(() => {
    void dispatch(loadPortfolio(ownerAddress))
  }, [dispatch, ownerAddress])

  const totalValue = holdings.reduce((sum, row) => sum + row.value, 0)
  const totalSol = holdings.reduce((sum, row) => sum + row.valueInSol, 0)

  return (
    <div className="w-full space-y-4 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-foreground">Holdings</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            void dispatch(loadPortfolio(ownerAddress))
          }}
        >
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {!loading && !error && holdings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No tokens found.</p>
      ) : null}

      {holdings.length > 0 ? (
        <div className="space-y-3">
          <div className="space-y-1 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Total (USD)</span>
              <span className="font-medium text-foreground">
                {formatMoney(totalValue)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Total (SOL)</span>
              <span className="font-medium text-foreground">
                {formatSol(totalSol)}
              </span>
            </div>
          </div>

          <ul className="space-y-3">
            {holdings.map((row) => (
              <li
                key={row.mint}
                className="space-y-1 border-b border-border pb-3 text-sm last:border-b-0 last:pb-0"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <TokenIcon src={row.icon} label={row.asset} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">
                        {row.asset}
                      </p>
                      <p className="text-muted-foreground">
                        {formatQty(row.quantity)} · {formatMoney(row.price)}
                      </p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-medium text-foreground">
                      {formatMoney(row.value)}
                    </p>
                    <p className="text-muted-foreground">
                      {formatSol(row.valueInSol)} · {row.allocation.toFixed(1)}%
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <PortfolioInsights
            key={ownerAddress}
            ownerAddress={ownerAddress}
            holdings={holdings}
          />
        </div>
      ) : null}
    </div>
  )
}
