import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'

import type { AppClient } from '@/lib/solanaClient'
import { useGetPricesQuery } from '@/store/api'

/**
 * Vault autopilot panel — connect prompt + live market snapshot.
 */
export function VaultAutopilotPanel() {
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const owner = connected?.account.address
  const { data: priceBook } = useGetPricesQuery()

  if (!owner) {
    return (
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Autopilot vault</h2>
        <p className="text-sm text-muted-foreground">
          Connect a wallet to set up your programmable portfolio vault.
        </p>
      </section>
    )
  }

  const movers = (priceBook?.prices ?? [])
    .filter((row) => row.symbol !== 'USDC')
    .slice(0, 3)

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Autopilot vault</h2>
      <p className="text-sm text-muted-foreground">
        Deposit USDC and tokenized stocks into your vault, then set up to eight
        on-chain rules. Open AI Chat to describe a strategy in plain English.
      </p>
      {movers.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Markets:{' '}
          {movers
            .map(
              (row) =>
                `${row.symbol} $${row.priceUsd.toFixed(2)} (${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(1)}%)`,
            )
            .join(' · ')}
        </p>
      ) : null}
    </section>
  )
}
