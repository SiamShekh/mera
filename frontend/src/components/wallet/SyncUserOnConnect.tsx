import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useRef } from 'react'

import type { AppClient } from '@/lib/solanaClient'
import { useUpsertUserMutation } from '@/store/api'

/**
 * When a wallet connects, POST /users once with that address.
 * Fire-and-forget — no UI; failures are logged only.
 */
export function SyncUserOnConnect() {
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const address = connected?.account.address
  const [upsertUser] = useUpsertUserMutation()
  const syncedAddress = useRef<string | null>(null)

  useEffect(() => {
    if (!address) {
      syncedAddress.current = null
      return
    }

    if (syncedAddress.current === address) return
    syncedAddress.current = address

    void upsertUser({ address })
      .unwrap()
      .catch((error: unknown) => {
        console.error('Failed to upsert user on wallet connect', error)
      })
  }, [address, upsertUser])

  return null
}
