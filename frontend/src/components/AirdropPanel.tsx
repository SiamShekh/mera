import { Gift } from 'lucide-react'

/**
 * Airdrop / faucet tab — Devnet SOL faucet + mock token setup.
 */
export function AirdropPanel() {
  return (
    <section className="rounded-2xl bg-card px-6 py-14 text-center lg:px-10 lg:py-20">
      <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-lime lg:size-14">
        <Gift className="size-6 text-lime-foreground lg:size-7" />
      </div>
      <h2 className="mt-4 text-xl font-semibold text-foreground lg:text-2xl">
        Devnet faucet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground lg:text-base">
        This app runs on Solana Devnet. Get free SOL from the{' '}
        <a
          className="underline underline-offset-2"
          href="https://faucet.solana.com"
          rel="noreferrer"
          target="_blank"
        >
          Solana faucet
        </a>
        , then run{' '}
        <code className="text-xs">program/scripts/setup-devnet-mints.sh</code>{' '}
        to mint mock USDC and NVDAx into your wallet.
      </p>
    </section>
  )
}
