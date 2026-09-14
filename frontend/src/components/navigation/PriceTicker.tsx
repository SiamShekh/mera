import { TokenIcon } from '@/components/TokenIcon'
import { WalletConnectControl } from '@/components/wallet/WalletConnectControl'
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
  { symbol: 'METAx', priceUsd: 612, changePct: 0 },
  { symbol: 'AMZNx', priceUsd: 228, changePct: 0 },
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

function TickerChip({
  symbol,
  priceUsd,
  changePct,
}: {
  symbol: string
  priceUsd: number
  changePct: number
}) {
  return (
    <div className="flex shrink-0 items-center gap-1.5 text-xs">
      <TokenIcon symbol={symbol} size="sm" />
      <span className="font-medium text-foreground">{symbol}</span>
      <span className="text-muted-foreground">
        {formatTickerPrice(symbol, priceUsd)}
      </span>
      <span
        className={cn(
          'font-medium',
          changePct < 0 && 'text-destructive',
          changePct > 0 && 'text-positive',
          changePct === 0 && 'text-muted-foreground',
        )}
      >
        {changePct > 0 ? '+' : ''}
        {changePct.toFixed(1)}%
      </span>
    </div>
  )
}

/**
 * Marquee price strip + wallet control on the right.
 */
export function PriceTicker({ className }: PriceTickerProps) {
  const { data } = useGetPricesQuery()

  const items =
    data?.prices?.length && data.prices.length > 0
      ? data.prices
          .filter((row) => row.symbol !== 'USDC')
          .map((row) => ({
            symbol: row.symbol,
            priceUsd: row.priceUsd,
            changePct: row.changePct,
          }))
      : [...FALLBACK]

  const loop = [...items, ...items]

  return (
    <div
      className={cn(
        'flex items-center gap-3 border-b border-border bg-background/80 py-2 pr-3 pl-0 backdrop-blur',
        className,
      )}
    >
      <div className="relative min-w-0 flex-1 overflow-hidden">
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-linear-to-r from-background to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-linear-to-l from-background to-transparent" />
        <div className="ticker-marquee flex w-max items-center gap-6 px-4">
          {loop.map((row, index) => (
            <TickerChip
              key={`${row.symbol}-${index}`}
              symbol={row.symbol}
              priceUsd={row.priceUsd}
              changePct={row.changePct}
            />
          ))}
        </div>
      </div>

      <div className="hidden shrink-0 lg:block">
        <WalletConnectControl />
      </div>
    </div>
  )
}
