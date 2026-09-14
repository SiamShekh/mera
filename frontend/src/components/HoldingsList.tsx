import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react'

import { PortfolioInsights } from '@/components/PortfolioInsights'
import { TokenIcon } from '@/components/TokenIcon'
import { Button } from '@/components/ui/button'
import { formatMoney, formatPercent, formatQty, formatSol } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useGetPricesQuery } from '@/store/api'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'

type HoldingsListProps = {
  ownerAddress: string
  /**
   * positions = net worth + PnL + table
   * spot = spot balances table only
   */
  mode?: 'positions' | 'spot'
}

function tradeUrl() {
  return '/swap'
}

function ChangeText({ change }: { change: number | null }) {
  const changePositive = (change ?? 0) > 0
  const changeNegative = (change ?? 0) < 0

  return (
    <p
      className={cn(
        'text-xs font-medium',
        changePositive && 'text-positive',
        changeNegative && 'text-destructive',
        !changePositive && !changeNegative && 'text-muted-foreground',
      )}
    >
      {formatPercent(change)}
    </p>
  )
}

/**
 * Holdings: mobile card rows + desktop full-width table.
 */
export function HoldingsList({
  ownerAddress,
  mode = 'positions',
}: HoldingsListProps) {
  const dispatch = useAppDispatch()
  const { holdings, loading, error } = useAppSelector(
    (state) => state.portfolio,
  )
  const { data: priceBook } = useGetPricesQuery(undefined, {
    pollingInterval: 10_000,
  })

  useEffect(() => {
    void dispatch(loadPortfolio(ownerAddress))
  }, [dispatch, ownerAddress])

  // Refresh holdings USD when the mock oracle advances
  useEffect(() => {
    if (!priceBook?.updatedAt) {
      return
    }
    void dispatch(loadPortfolio(ownerAddress))
  }, [dispatch, ownerAddress, priceBook?.updatedAt])

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
    <div className="space-y-4 lg:space-y-5">
      {showOverview ? (
        <div className="grid gap-4 lg:grid-cols-2 lg:gap-5">
          <section className="rounded-2xl bg-card p-5 sm:p-6 lg:p-7">
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

            <p className="text-4xl font-semibold tracking-tight text-foreground lg:text-5xl">
              {loading && holdings.length === 0 ? '…' : formatMoney(totalValue)}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {formatSol(totalSol)}
            </p>

            <div className="mt-6 flex flex-wrap gap-2">
              <Button type="button" className="rounded-xl" asChild>
                <Link to="/send">
                  <ArrowUpRight className="size-4" />
                  Send
                </Link>
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="rounded-xl"
                asChild
              >
                <Link to="/deposit">
                  <ArrowDownLeft className="size-4" />
                  Deposit
                </Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Send transfers on Devnet · Deposit shows your Solana QR.
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
        <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 lg:px-7">
          <div>
            <h2 className="text-base font-semibold text-foreground lg:text-lg">
              {mode === 'spot' ? 'Spot balances' : 'Holdings'}
            </h2>
            <p className="text-sm text-muted-foreground">
              {holdings.length} asset{holdings.length === 1 ? '' : 's'}
            </p>
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
            <p className="text-sm font-medium text-foreground lg:text-base">
              {formatMoney(totalValue)}
            </p>
          </div>
        </div>

        {error ? (
          <p className="px-5 py-6 text-sm text-destructive sm:px-6 lg:px-7">
            {error}
          </p>
        ) : null}

        {!loading && !error && holdings.length === 0 ? (
          <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6 lg:px-7">
            No tokens found.
          </p>
        ) : null}

        {/* Mobile: compact rows (no forced horizontal scroll) */}
        {holdings.length > 0 ? (
          <ul className="divide-y divide-border lg:hidden">
            {holdings.map((row) => (
              <li
                key={row.mint}
                className="flex items-center gap-3 px-5 py-3.5 sm:px-6"
              >
                <TokenIcon symbol={row.asset} src={row.icon} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-foreground">{row.asset}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatQty(row.quantity)} ·{' '}
                    {formatPercent(row.priceChange24h)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold text-foreground">
                    {formatMoney(row.value)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {row.allocation.toFixed(1)}%
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {/* Desktop: full table */}
        {holdings.length > 0 ? (
          <div className="hidden lg:block">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-muted-foreground">
                  <th className="px-7 py-3.5 font-medium">Asset</th>
                  <th className="px-4 py-3.5 font-medium">Balance</th>
                  <th className="px-4 py-3.5 font-medium">Price / 24h</th>
                  <th className="px-4 py-3.5 font-medium">Value</th>
                  <th className="px-4 py-3.5 font-medium">Allocation</th>
                  <th className="px-7 py-3.5 text-right font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {holdings.map((row) => (
                  <tr
                    key={row.mint}
                    className="border-b border-border last:border-b-0"
                  >
                    <td className="px-7 py-4">
                      <div className="flex items-center gap-3">
                        <TokenIcon
                          symbol={row.asset}
                          src={row.icon}
                          size="lg"
                        />
                        <div>
                          <p className="font-semibold text-foreground">
                            {row.asset}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatSol(row.valueInSol)}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-medium text-foreground">
                        {formatQty(row.quantity)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-foreground">
                        {formatMoney(row.price)}
                      </p>
                      <ChangeText change={row.priceChange24h} />
                    </td>
                    <td className="px-4 py-4">
                      <p className="font-semibold text-foreground">
                        {formatMoney(row.value)}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full bg-lime"
                            style={{
                              width: `${Math.min(100, Math.max(0, row.allocation))}%`,
                            }}
                          />
                        </div>
                        <span className="text-sm font-medium text-foreground">
                          {row.allocation.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-7 py-4 text-right">
                      <Link
                        to={tradeUrl()}
                        className="inline-flex h-9 cursor-pointer items-center rounded-xl bg-secondary px-3 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
                      >
                        Trade
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
