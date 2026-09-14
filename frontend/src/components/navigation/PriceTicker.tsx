import { Plus, Settings2 } from 'lucide-react'

import { TokenIcon } from '@/components/TokenIcon'
import { cn } from '@/lib/utils'
import { useGetPricesQuery } from '@/store/api'

type PriceTickerProps = {
  className?: string
}

const FALLBACK = [
  { symbol: 'TSLAx', priceUsd: 363.92, changePct: 0 },
  { symbol: 'AAPLx', priceUsd: 334.71, changePct: 0 },
  { symbol: 'GOOGLx', priceUsd: 345, changePct: 0 },
  { symbol: 'NVDAx', priceUsd: 120, changePct: 0 },
  { symbol: 'MSFTx', priceUsd: 504.34, changePct: 0 },
  { symbol: 'SPYx', priceUsd: 761.33, changePct: 0 },
  { symbol: 'USDC', priceUsd: 1, changePct: 0 },
] as const

function formatTickerPrice(symbol: string, price: number): string {
  if (symbol === 'USDC') {
    return `$${price.toFixed(2)}`
  }
  if (price >= 100) {
    return `$${price.toFixed(2)}`
  }
  return `$${price.toFixed(3)}`
}

/**
 * Horizontal price strip fed by the mock oracle (Socket.io + initial REST).
 */
export function PriceTicker({ className }: PriceTickerProps) {
  const { data } = useGetPricesQuery()

  const items =
    data?.prices?.length && data.prices.length > 0
      ? data.prices.map((row) => ({
          symbol: row.symbol,
          priceUsd: row.priceUsd,
          changePct: row.changePct,
        }))
      : [...FALLBACK]

  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border px-3 py-2',
        className,
      )}
    >
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        aria-label="Ticker settings"
      >
        <Settings2 className="size-4" />
      </button>
      <div className="scrollbar-none flex min-w-0 flex-1 items-center gap-4 overflow-x-auto">
        {items.map((row) => (
          <div
            key={row.symbol}
            className="flex shrink-0 items-center gap-1.5 text-xs"
          >
            <TokenIcon symbol={row.symbol} size="sm" />
            <span className="font-medium text-foreground">{row.symbol}</span>
            <span className="text-muted-foreground">
              {formatTickerPrice(row.symbol, row.priceUsd)}
            </span>
            <span
              className={cn(
                'font-medium',
                row.changePct < 0 && 'text-destructive',
                row.changePct > 0 && 'text-positive',
                row.changePct === 0 && 'text-muted-foreground',
              )}
            >
              {row.changePct > 0 ? '+' : ''}
              {row.changePct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="flex size-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground"
        aria-label="Add token to ticker"
      >
        <Plus className="size-4" />
      </button>
    </div>
  )
}
