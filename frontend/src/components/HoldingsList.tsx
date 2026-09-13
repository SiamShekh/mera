import { useEffect, useMemo, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react'

import { PortfolioInsights } from '@/components/PortfolioInsights'
import { Button } from '@/components/ui/button'
import { formatMoney, formatPercent, formatQty, formatSol } from '@/lib/format'
import { WSOL_MINT } from '@/lib/portfolio'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'
import type { Holding } from '@/types/holding'

type HoldingsListProps = {
  ownerAddress: string
  /**
   * positions = net worth + PnL + table
   * spot = spot balances table only
   */
  mode?: 'positions' | 'spot'
}

function TokenIcon({ src, label }: { src: string | null; label: string }) {
  const [broken, setBroken] = useState(false)

  if (!src || broken) {
    return (
      <span
        className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
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
      className="size-9 shrink-0 rounded-full bg-secondary object-cover"
      onError={() => {
        setBroken(true)
      }}
    />
  )
}

function tradeUrl(holding: Holding) {
  const mint = holding.mint === 'native' ? WSOL_MINT : holding.mint
  return `https://jup.ag/swap/SOL-${mint}`
}

/**
 * Jupiter-style holdings table on a white theme.
 */
export function HoldingsList({
  ownerAddress,
  mode = 'positions',
}: HoldingsListProps) {
  const dispatch = useAppDispatch()
  const { holdings, loading, error } = useAppSelector(
    (state) => state.portfolio,
  )

  useEffect(() => {
    void dispatch(loadPortfolio(ownerAddress))
  }, [dispatch, ownerAddress])

  const totalValue = useMemo(
    () => holdings.reduce((sum, row) => sum + row.value, 0),
    [holdings],
  )
  const totalSol = useMemo(
    () => holdings.reduce((sum, row) => sum + row.valueInSol, 0),
    [holdings],
  )

  const showOverview = mode === 'positions'

  return (
    <div className="space-y-4">
      {showOverview ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <section className="rounded-2xl bg-card p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">Net worth</p>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8"
                disabled={loading}
                onClick={() => {
                  void dispatch(loadPortfolio(ownerAddress))
                }}
                aria-label="Refresh portfolio"
              >
                <RefreshCw
                  className={cn('size-4', loading && 'animate-spin')}
                />
              </Button>
            </div>

            <p className="text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
              {loading && holdings.length === 0 ? '…' : formatMoney(totalValue)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatSol(totalSol)}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" className="rounded-xl" disabled>
                <ArrowUpRight className="size-4" />
                Send
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl"
                disabled
              >
                <ArrowDownLeft className="size-4" />
                Deposit
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Send / Deposit come next — wallet connect works now.
            </p>
          </section>

          <PortfolioInsights
            key={ownerAddress}
            ownerAddress={ownerAddress}
            holdings={holdings}
          />
        </div>
      ) : null}

      <section className="overflow-hidden rounded-2xl bg-card">
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              {mode === 'spot' ? 'Spot balances' : 'Holdings'}
            </h2>
            <p className="text-sm text-muted-foreground">Wallet</p>
          </div>
          <div className="flex items-center gap-2">
            {!showOverview ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 rounded-xl"
                disabled={loading}
                onClick={() => {
                  void dispatch(loadPortfolio(ownerAddress))
                }}
                aria-label="Refresh spot balances"
              >
                <RefreshCw
                  className={cn('size-4', loading && 'animate-spin')}
                />
              </Button>
            ) : null}
            <p className="text-sm font-medium text-foreground">
              {formatMoney(totalValue)}
            </p>
          </div>
        </div>

        {error ? (
          <p className="px-5 py-6 text-sm text-destructive sm:px-6">{error}</p>
        ) : null}

        {!loading && !error && holdings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
            No tokens found.
          </p>
        ) : null}

        {holdings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-5 py-3 font-medium sm:px-6">Asset</th>
                  <th className="px-3 py-3 font-medium">Value / Balance</th>
                  <th className="px-3 py-3 font-medium">Price / 24h</th>
                  <th className="px-3 py-3 font-medium">Allocation</th>
                  <th className="px-5 py-3 text-right font-medium sm:px-6">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((row) => {
                  const change = row.priceChange24h
                  const changePositive = (change ?? 0) > 0
                  const changeNegative = (change ?? 0) < 0

                  return (
                    <tr
                      key={row.mint}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-5 py-4 sm:px-6">
                        <div className="flex items-center gap-3">
                          <TokenIcon src={row.icon} label={row.asset} />
                          <div>
                            <p className="font-semibold text-foreground">
                              {row.asset}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.allocation.toFixed(1)}% of portfolio
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-foreground">
                          {formatMoney(row.value)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatQty(row.quantity)}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-foreground">
                          {formatMoney(row.price)}
                        </p>
                        <p
                          className={cn(
                            'text-xs font-medium',
                            changePositive && 'text-positive',
                            changeNegative && 'text-destructive',
                            !changePositive &&
                              !changeNegative &&
                              'text-muted-foreground',
                          )}
                        >
                          {formatPercent(change)}
                        </p>
                      </td>
                      <td className="px-3 py-4">
                        <p className="font-semibold text-foreground">
                          {row.allocation.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatSol(row.valueInSol)}
                        </p>
                      </td>
                      <td className="px-5 py-4 text-right sm:px-6">
                        <a
                          href={tradeUrl(row)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-9 items-center rounded-xl bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                        >
                          Trade
                        </a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
