import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { checkBackendHealth } from '@/store/healthSlice'

/** Small footer health check — kept quiet so it does not dominate the portfolio UI */
export function BackendHealthPanel() {
  const dispatch = useAppDispatch()
  const { status, loading, error } = useAppSelector((state) => state.health)

  useEffect(() => {
    void dispatch(checkBackendHealth())
  }, [dispatch])

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
      <span>
        Backend /health:{' '}
        <span className="font-medium text-foreground">
          {loading
            ? 'Checking…'
            : error
              ? error
              : status
                ? `status: ${status}`
                : 'No response'}
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-lg"
        disabled={loading}
        onClick={() => {
          void dispatch(checkBackendHealth())
        }}
      >
        Retry
      </Button>
    </div>
  )
}
