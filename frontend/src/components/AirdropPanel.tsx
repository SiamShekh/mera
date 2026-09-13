import { Gift } from 'lucide-react'

/**
 * Airdrop tab — Mainnet has no faucet; show a clear working empty state.
 */
export function AirdropPanel() {
  return (
    <section className="rounded-2xl bg-card px-6 py-14 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-lime">
        <Gift className="size-6 text-lime-foreground" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-foreground">Airdrops</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        No claimable airdrops right now. This app runs on Solana Mainnet, so
        there is no test faucet here. When campaigns are available, they will
        show up in this tab.
      </p>
    </section>
  )
}
