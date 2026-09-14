import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

import { TokenIcon } from '@/components/TokenIcon'
import { Button } from '@/components/ui/button'
import { XSTOCKS_CATALOG } from '@/data/xstocks'
import { formatMoney, formatPercent } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useGetPricesQuery } from '@/store/api'

type MarketRow = {
  mint: string
  symbol: string
  name: string
  icon: string
  priceUsd: number
  changePct: number | null
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

/** All tokenized stocks with live prices. */
export function MarketList() {
  const { data: priceBook, isFetching, isError, refetch } = useGetPricesQuery()

  const rows = useMemo((): MarketRow[] => {
    const liveByMint = new Map(
      (priceBook?.prices ?? []).map((row) => [row.mint, row]),
    )
    const liveBySymbol = new Map(
      (priceBook?.prices ?? []).map((row) => [row.symbol.toUpperCase(), row]),
    )

    return XSTOCKS_CATALOG.map((stock) => {
      const live =
        liveByMint.get(stock.mint) ??
        liveBySymbol.get(stock.symbol.toUpperCase())

      return {
        mint: stock.mint,
        symbol: stock.symbol,
        name: stock.name,
        icon: stock.icon,
        priceUsd: live?.priceUsd ?? stock.priceUsd,
        changePct: live?.changePct ?? null,
      }
    }).sort((a, b) => a.symbol.localeCompare(b.symbol))
  }, [priceBook])

  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-4 sm:px-6 lg:px-7">
        <div>
          <h1 className="text-base font-semibold text-foreground lg:text-lg">
            Market
          </h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} stock{rows.length === 1 ? '' : 's'} · live prices
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-8 rounded-xl"
          disabled={isFetching}
          onClick={() => {
            void refetch()
          }}
          aria-label="Refresh prices"
        >
          <RefreshCw className={cn('size-4', isFetching && 'animate-spin')} />
        </Button>
      </div>

      {isError ? (
        <p className="px-5 py-6 text-sm text-destructive sm:px-6 lg:px-7">
          Couldn’t load live prices.
        </p>
      ) : null}

      <ul className="divide-y divide-border lg:hidden">
        {rows.map((row) => (
          <li
            key={row.mint}
            className="flex items-center gap-3 px-5 py-3.5 sm:px-6"
          >
            <TokenIcon symbol={row.symbol} src={row.icon} size="lg" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-foreground">{row.symbol}</p>
              <p className="truncate text-xs text-muted-foreground">
                {row.name}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-foreground">
                {formatMoney(row.priceUsd)}
              </p>
              <ChangeText change={row.changePct} />
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden lg:block">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              <th className="px-7 py-3.5 font-medium">Asset</th>
              <th className="px-4 py-3.5 font-medium">Price</th>
              <th className="px-4 py-3.5 font-medium">Change</th>
              <th className="px-7 py-3.5 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.mint}
                className="border-b border-border last:border-b-0"
              >
                <td className="px-7 py-4">
                  <div className="flex items-center gap-3">
                    <TokenIcon symbol={row.symbol} src={row.icon} size="lg" />
                    <div>
                      <p className="font-semibold text-foreground">
                        {row.symbol}
                      </p>
                      <p className="text-xs text-muted-foreground">{row.name}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="font-semibold text-foreground">
                    {formatMoney(row.priceUsd)}
                  </p>
                </td>
                <td className="px-4 py-4">
                  <ChangeText change={row.changePct} />
                </td>
                <td className="px-7 py-4 text-right">
                  <Link
                    to="/swap"
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
    </section>
  )
}
