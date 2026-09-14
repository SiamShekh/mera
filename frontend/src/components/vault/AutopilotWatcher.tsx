import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useRef } from 'react'

import type { AppClient } from '@/lib/solanaClient'
import { useKeeperTickMutation } from '@/store/api'

const POLL_MS = 15_000

/**
 * Silent Autopilot loop: while a wallet is connected, periodically settle
 * triggered sell orders. No UI — user should never need Force tick / keeper.
 */
export function AutopilotWatcher() {
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const owner = connected?.account.address
  const [keeperTick] = useKeeperTickMutation()
  const busy = useRef(false)

  useEffect(() => {
    if (!owner) return

    let cancelled = false

    async function cycle() {
      if (cancelled || busy.current) return
      busy.current = true
      try {
        await keeperTick({ userAddress: owner, dryRun: false }).unwrap()
      } catch {
        // Silent — next poll retries
      } finally {
        busy.current = false
      }
    }

    void cycle()
    const id = window.setInterval(() => {
      void cycle()
    }, POLL_MS)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [owner, keeperTick])

  return null
}
