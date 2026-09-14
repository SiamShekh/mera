import { useConnectedWallet } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { API_URL, NETWORK_LABEL } from '@/lib/config'
import {
  derivePortfolioPda,
  MERA_PROGRAM_ID,
  USDC_MINT,
} from '@/lib/meraProgram'
import { mintsConfigured, NVDAX_MINT } from '@/lib/mints'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'
import {
  useGetPricesQuery,
  useKeeperTickMutation,
  useTickPricesMutation,
} from '@/store/api'

/**
 * Autopilot vault hub: PDA link, live market sim, keeper evaluation.
 */
export function VaultPage() {
  const client = useClient<AppClient>()
  const connected = useConnectedWallet(client)
  const owner = connected?.account.address
  const [portfolioPda, setPortfolioPda] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const ready = mintsConfigured()

  const { data: priceBook } = useGetPricesQuery(undefined, {
    pollingInterval: 10_000,
  })
  const [tickPrices, tickState] = useTickPricesMutation()
  const [keeperTick, keeperState] = useKeeperTickMutation()
  const [keeperNote, setKeeperNote] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function run() {
      if (!owner) {
        setPortfolioPda(null)
        return
      }
      const pda = await derivePortfolioPda(owner)
      if (!cancelled) setPortfolioPda(pda)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [owner])

  async function syncPortfolioToBackend() {
    if (!owner || !portfolioPda) return
    setSyncing(true)
    setMessage(null)
    try {
      const res = await fetch(`${API_URL}/keeper/portfolio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: owner,
          portfolioPda,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      setMessage(
        'Portfolio PDA linked on the backend. Next: deploy program and sign initialize_portfolio.',
      )
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Failed to sync portfolio',
      )
    } finally {
      setSyncing(false)
    }
  }

  async function runMarketTick() {
    try {
      await tickPrices().unwrap()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Price tick failed')
    }
  }

  async function runKeeper() {
    setKeeperNote(null)
    try {
      const result = await keeperTick({
        userAddress: owner,
        dryRun: true,
      }).unwrap()
      const fired = result.actionable.filter((row) => row.triggered)
      setKeeperNote(
        fired.length > 0
          ? `${result.note}\n` +
              fired.map((row) => `• ${row.asset}: ${row.reason}`).join('\n')
          : result.note,
      )
    } catch (error) {
      setKeeperNote(
        error instanceof Error ? error.message : 'Keeper tick failed',
      )
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 py-2">
      <header className="space-y-2">
        <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Autopilot vault · {NETWORK_LABEL}
        </p>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Tokenized stock portfolio
        </h1>
        <p className="text-sm text-muted-foreground">
          Deposit mock USDC and mock xStock into your program-owned vault. Rules
          run against a live simulated market (no Jupiter). We never hold your
          private key.
        </p>
      </header>

      <section className="space-y-3 rounded-2xl border border-border bg-card px-4 py-4">
        <div className="flex items-center justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-foreground">
              Market sim live
            </p>
            <p className="text-[11px] text-muted-foreground">
              Random minute bars · auto-updates
              {priceBook?.updatedAt
                ? ` · ${new Date(priceBook.updatedAt).toLocaleTimeString()}`
                : ''}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={tickState.isLoading}
            onClick={() => {
              void runMarketTick()
            }}
          >
            {tickState.isLoading ? 'Ticking…' : 'Force tick'}
          </Button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {(priceBook?.prices ?? []).map((row) => (
            <li
              key={row.mint}
              className="rounded-xl bg-secondary/60 px-3 py-2 text-xs"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-foreground">
                  {row.symbol}
                </span>
                <span
                  className={cn(
                    'font-medium',
                    row.changePct > 0 && 'text-positive',
                    row.changePct < 0 && 'text-destructive',
                    row.changePct === 0 && 'text-muted-foreground',
                  )}
                >
                  {row.changePct > 0 ? '+' : ''}
                  {row.changePct.toFixed(1)}%
                </span>
              </div>
              <p className="mt-0.5 text-muted-foreground">
                ${row.priceUsd.toFixed(row.symbol === 'USDC' ? 2 : 2)}
              </p>
            </li>
          ))}
          {!priceBook?.prices?.length ? (
            <li className="col-span-2 text-xs text-muted-foreground">
              Waiting for mock price oracle…
            </li>
          ) : null}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={keeperState.isLoading}
            onClick={() => {
              void runKeeper()
            }}
          >
            {keeperState.isLoading ? 'Evaluating…' : 'Run keeper tick'}
          </Button>
        </div>
        {keeperNote ? (
          <p className="whitespace-pre-wrap text-xs text-muted-foreground">
            {keeperNote}
          </p>
        ) : null}
      </section>

      {!ready ? (
        <p className="rounded-md border border-border/70 bg-secondary/30 px-4 py-3 text-sm text-muted-foreground">
          Mock mints not configured. Run{' '}
          <code className="text-xs">program/scripts/setup-devnet-mints.sh</code>{' '}
          and set mint env vars in{' '}
          <code className="text-xs">frontend/.env</code>.
        </p>
      ) : null}

      <section
        className={cn(
          'space-y-3 border border-border/70 bg-secondary/30 px-4 py-4',
        )}
      >
        <div className="text-xs text-muted-foreground">Program</div>
        <code className="block break-all text-xs text-foreground">
          {String(MERA_PROGRAM_ID)}
        </code>
        <div className="text-xs text-muted-foreground">Mock USDC mint</div>
        <code className="block break-all text-xs text-foreground">
          {USDC_MINT}
        </code>
        <div className="text-xs text-muted-foreground">Mock NVDAx mint</div>
        <code className="block break-all text-xs text-foreground">
          {NVDAX_MINT}
        </code>
      </section>

      {!owner ? (
        <p className="text-sm text-muted-foreground">
          Connect a Devnet wallet to derive your vault PDA.
        </p>
      ) : (
        <section className="space-y-3 border border-border/70 px-4 py-4">
          <div className="text-xs text-muted-foreground">
            Your Portfolio PDA
          </div>
          <code className="block break-all text-sm text-foreground">
            {portfolioPda ?? 'Deriving…'}
          </code>
          <Button
            type="button"
            disabled={!portfolioPda || syncing}
            onClick={() => {
              void syncPortfolioToBackend()
            }}
          >
            {syncing ? 'Linking…' : 'Link vault to backend'}
          </Button>
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
          <ol className="list-decimal space-y-1 pl-4 text-sm text-muted-foreground">
            <li>
              Deploy the Anchor program (
              <code>cd program && anchor deploy --provider.cluster devnet</code>
              ).
            </li>
            <li>
              Sign <code>initialize_portfolio</code> from this wallet.
            </li>
            <li>Deposit mock USDC / NVDAx into the vault ATAs.</li>
            <li>
              Confirm a rule, then use Run keeper tick — it evaluates against
              the simulated market.
            </li>
          </ol>
        </section>
      )}
    </div>
  )
}
