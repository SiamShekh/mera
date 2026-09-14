import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import type { AppClient } from '@/lib/solanaClient'
import { MERA_PROGRAM_ID, MINTS, portfolioSeedBytes } from '@/lib/meraPortfolio'
import { API_URL } from '@/lib/config'
import { useGetPricesQuery } from '@/store/api'

/**
 * Vault autopilot panel — initialize / link portfolio PDA + market sim hint.
 */
export function VaultAutopilotPanel() {
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const owner = connected?.account.address
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { data: priceBook } = useGetPricesQuery(undefined, {
    pollingInterval: 30_000,
  })

  async function linkPortfolioPlaceholder() {
    if (!owner) return
    setBusy(true)
    setStatus(null)
    try {
      const { programId } = portfolioSeedBytes(owner)
      setStatus(
        `Program ${programId}. After you run initialize_portfolio on-chain, call POST ${API_URL}/keeper/portfolio/link with ownerAddress + portfolioPda.`,
      )
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed')
    } finally {
      setBusy(false)
    }
  }

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
        Deposit USDC and tokenized stocks into your program vault, then enable
        on-chain rules. Program id:{' '}
        <code className="text-xs">{MERA_PROGRAM_ID}</code>
      </p>
      {movers.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          Market sim:{' '}
          {movers
            .map(
              (row) =>
                `${row.symbol} $${row.priceUsd.toFixed(2)} (${row.changePct >= 0 ? '+' : ''}${row.changePct.toFixed(1)}%)`,
            )
            .join(' · ')}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Supported cash mint: mock USDC ({MINTS.USDC}). Mock NVDAx: {MINTS.NVDAx}
        . Run `program/scripts/setup-devnet-mints.sh` if these still look like
        placeholders.
      </p>
      <Button
        type="button"
        disabled={busy}
        onClick={() => void linkPortfolioPlaceholder()}
      >
        {busy ? 'Working…' : 'Show vault setup next step'}
      </Button>
      {status ? (
        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
          {status}
        </p>
      ) : null}
    </section>
  )
}
