import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Eye,
  History,
  MessageCircle,
  X,
} from 'lucide-react'

import { PriceTicker } from '@/components/navigation/PriceTicker'
import { SwapForm } from '@/components/swap/SwapForm'
import { TokenIcon } from '@/components/TokenIcon'
import { Button } from '@/components/ui/button'
import { useGetPricesQuery } from '@/store/api'

/**
 * Swap page: mobile stack + desktop 3-column Jupiter layout (white theme).
 */
export function SwapPage() {
  const [showBanner, setShowBanner] = useState(true)
  const { data: priceBook } = useGetPricesQuery(undefined, {
    pollingInterval: 10_000,
  })

  const mini = (priceBook?.prices ?? []).filter((row) => row.symbol !== 'USDC')
  const cards =
    mini.length > 0
      ? mini.slice(0, 4)
      : [
          { symbol: 'SOLx', priceUsd: 150, changePct: 0 },
          { symbol: 'stX', priceUsd: 165, changePct: 0 },
          { symbol: 'NVDAx', priceUsd: 120, changePct: 0 },
          { symbol: 'USDC', priceUsd: 1, changePct: 0 },
        ]

  return (
    <div className="relative w-full">
      {/* Mobile ticker (desktop ticker lives in the layout shell) */}
      <div className="lg:hidden">
        <PriceTicker className="mb-3 border-b-0 px-0" />
      </div>

      {/* Mobile: stacked promo + swap */}
      <div className="space-y-3 lg:hidden">
        {showBanner ? (
          <PromoBanner
            onDismiss={() => {
              setShowBanner(false)
            }}
          />
        ) : null}
        <SwapForm />
      </div>

      {/* Desktop: promo | swap | net worth */}
      <div className="hidden gap-4 lg:grid lg:grid-cols-[240px_minmax(0,420px)_220px] lg:items-start lg:justify-center xl:grid-cols-[260px_minmax(0,440px)_240px] xl:gap-6">
        <aside className="overflow-hidden rounded-2xl bg-card">
          <div className="relative flex min-h-[420px] flex-col justify-end bg-gradient-to-b from-secondary to-card p-5">
            <p className="text-lg font-semibold text-foreground">
              Try Portfolio Gacha
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Promo placeholder — packs coming later.
            </p>
            <Button
              type="button"
              className="mt-4 h-11 rounded-xl bg-lime font-semibold text-lime-foreground hover:bg-lime/90"
            >
              Open a pack
            </Button>
            <div className="pointer-events-none absolute inset-x-6 top-8 h-40 rounded-2xl bg-secondary/80" />
          </div>
        </aside>

        <div className="space-y-3">
          {showBanner ? (
            <PromoBanner
              onDismiss={() => {
                setShowBanner(false)
              }}
            />
          ) : null}
          <SwapForm />
          <div className="grid grid-cols-2 gap-3">
            {cards.map((row) => (
              <TokenMiniCard
                key={row.symbol}
                symbol={row.symbol}
                price={`$${row.priceUsd.toFixed(2)}`}
                change={row.changePct}
              />
            ))}
          </div>
        </div>

        <aside className="rounded-2xl bg-card p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Net Worth</p>
            <button
              type="button"
              className="rounded-lg p-1 text-muted-foreground hover:text-foreground"
              aria-label="Toggle balance visibility"
            >
              <Eye className="size-4" />
            </button>
          </div>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
            $0.00
          </p>
          <div className="mt-5 flex justify-between gap-2">
            <QuickAction icon={ArrowDownToLine} label="Deposit" to="/deposit" />
            <QuickAction icon={ArrowUpFromLine} label="Send" to="/send" />
            <QuickAction icon={History} label="View" />
          </div>
        </aside>
      </div>

      <button
        type="button"
        className="fixed right-4 bottom-20 z-30 flex size-12 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-md lg:right-6 lg:bottom-6"
        aria-label="Support chat"
      >
        <MessageCircle className="size-5" />
      </button>
    </div>
  )
}

function PromoBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-card px-4 py-4">
      <button
        type="button"
        className="absolute top-2 right-2 rounded-lg p-1 text-muted-foreground"
        aria-label="Dismiss banner"
        onClick={onDismiss}
      >
        <X className="size-4" />
      </button>
      <p className="pr-6 text-base font-semibold text-foreground">
        Earn over 5% APY on your Stables
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Placeholder promo — lending comes later.
      </p>
      <div className="mt-3 flex justify-center gap-1.5">
        <span className="size-1.5 rounded-full bg-foreground" />
        <span className="size-1.5 rounded-full bg-border" />
      </div>
    </div>
  )
}

function TokenMiniCard({
  symbol,
  price,
  change,
}: {
  symbol: string
  price: string
  change: number
}) {
  return (
    <div className="rounded-2xl bg-card px-3 py-3">
      <div className="flex items-center gap-2">
        <TokenIcon symbol={symbol} size="md" />
        <div>
          <p className="text-sm font-semibold text-foreground">{symbol}</p>
          <p className="text-xs text-muted-foreground">{price}</p>
        </div>
      </div>
      <p
        className={
          change < 0
            ? 'mt-2 text-xs font-medium text-destructive'
            : change > 0
              ? 'mt-2 text-xs font-medium text-positive'
              : 'mt-2 text-xs font-medium text-muted-foreground'
        }
      >
        {change > 0 ? '+' : ''}
        {change.toFixed(1)}%
      </p>
    </div>
  )
}

function QuickAction({
  icon: Icon,
  label,
  to,
}: {
  icon: typeof Eye
  label: string
  to?: string
}) {
  const content = (
    <>
      <span className="flex size-11 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-4" />
      </span>
      <span className="text-[11px] font-medium">{label}</span>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        className="flex flex-1 cursor-pointer flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
      >
        {content}
      </Link>
    )
  }

  return (
    <button
      type="button"
      className="flex flex-1 cursor-pointer flex-col items-center gap-1.5 text-muted-foreground hover:text-foreground"
    >
      {content}
    </button>
  )
}
