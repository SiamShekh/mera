import { useEffect } from 'react'
import { ExternalLink, RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { shortenAddress } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadActivity } from '@/store/activitySlice'

type ActivityPanelProps = {
  ownerAddress: string
}

function formatWhen(blockTime: number | null) {
  if (!blockTime) {
    return 'Unknown time'
  }
  return new Date(blockTime * 1000).toLocaleString()
}

/**
 * Recent on-chain activity for the connected wallet (Mainnet signatures).
 */
export function ActivityPanel({ ownerAddress }: ActivityPanelProps) {
  const dispatch = useAppDispatch()
  const { items, loading, error } = useAppSelector((state) => state.activity)

  useEffect(() => {
    void dispatch(loadActivity(ownerAddress))
  }, [dispatch, ownerAddress])

  return (
    <section className="overflow-hidden rounded-2xl bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4 sm:px-6">
        <div>
          <h2 className="text-base font-semibold text-foreground">Activity</h2>
          <p className="text-sm text-muted-foreground">
            Recent Mainnet transactions
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="rounded-xl"
          disabled={loading}
          onClick={() => {
            void dispatch(loadActivity(ownerAddress))
          }}
          aria-label="Refresh activity"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {error ? (
        <p className="px-5 py-6 text-sm text-destructive sm:px-6">{error}</p>
      ) : null}

      {loading && items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
          Loading activity…
        </p>
      ) : null}

      {!loading && !error && items.length === 0 ? (
        <p className="px-5 py-6 text-sm text-muted-foreground sm:px-6">
          No recent transactions for this wallet.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const failed = item.err != null
            return (
              <li
                key={item.signature}
                className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">
                    {failed ? 'Failed transaction' : 'Confirmed transaction'}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {shortenAddress(item.signature)} ·{' '}
                    {formatWhen(item.blockTime)}
                  </p>
                </div>
                <a
                  href={`https://solscan.io/tx/${item.signature}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-xl bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
                >
                  View
                  <ExternalLink className="size-3.5" />
                </a>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}
