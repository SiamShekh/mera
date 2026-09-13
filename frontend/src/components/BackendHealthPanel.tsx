import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { checkBackendHealth } from '@/store/healthSlice'

/**
 * Simple panel that calls GET /health on the backend via Redux Toolkit.
 */
export function BackendHealthPanel() {
  const dispatch = useAppDispatch()
  const { status, loading, error } = useAppSelector((state) => state.health)

  // Call the backend once when this component first shows up
  useEffect(() => {
    void dispatch(checkBackendHealth())
  }, [dispatch])

  return (
    <div className="w-full max-w-md space-y-4 border-t border-border pt-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium text-foreground">Backend API</h2>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={loading}
          onClick={() => {
            void dispatch(checkBackendHealth())
          }}
        >
          {loading ? 'Checking…' : 'Retry'}
        </Button>
      </div>

      <div className="flex items-center justify-between gap-4 text-sm">
        <span className="text-muted-foreground">/health</span>
        <span className="font-medium text-foreground">
          {loading
            ? 'Loading…'
            : error
              ? error
              : status
                ? `status: ${status}`
                : 'No response yet'}
        </span>
      </div>
    </div>
  )
}
