import { X } from 'lucide-react'
import { useEffect } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/** Minimal wallet shape from Wallet Standard / Kit hooks */
export type ConnectableWallet = {
  name: string
  icon?: string
}

type ConnectWalletModalProps = {
  open: boolean
  onClose: () => void
  wallets: readonly ConnectableWallet[]
  connecting: boolean
  onConnect: (wallet: ConnectableWallet) => void
}

/** Known install links when a wallet is not detected yet */
const MORE_WALLETS = [
  {
    name: 'Phantom',
    url: 'https://phantom.app/download',
    hint: 'Browser extension',
  },
  {
    name: 'Solflare',
    url: 'https://solflare.com/download',
    hint: 'Browser extension',
  },
  {
    name: 'Backpack',
    url: 'https://backpack.app/download',
    hint: 'Browser extension',
  },
  {
    name: 'Ledger',
    url: 'https://www.ledger.com/',
    hint: 'Hardware wallet',
  },
] as const

function WalletIcon({ wallet }: { wallet: ConnectableWallet }) {
  const icon = typeof wallet.icon === 'string' ? wallet.icon : undefined
  if (icon) {
    return (
      <img
        src={icon}
        alt=""
        className="size-10 rounded-xl bg-secondary object-cover"
      />
    )
  }
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-lime text-sm font-bold text-lime-foreground">
      {wallet.name.slice(0, 1)}
    </span>
  )
}

/**
 * Jupiter-style connect panel (right slide-over) on our white theme.
 */
export function ConnectWalletModal({
  open,
  onClose,
  wallets,
  connecting,
  onConnect,
}: ConnectWalletModalProps) {
  // Close on Escape
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  // Prevent background scroll while open
  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) {
    return null
  }

  const installedNames = new Set(
    wallets.map((wallet) => wallet.name.toLowerCase()),
  )
  const moreWallets = MORE_WALLETS.filter(
    (wallet) => !installedNames.has(wallet.name.toLowerCase()),
  )

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close connect wallet"
        onClick={onClose}
      />

      <aside
        className="relative flex h-full w-full max-w-md flex-col bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="connect-wallet-title"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2
            id="connect-wallet-title"
            className="text-2xl font-semibold tracking-tight text-foreground"
          >
            Connect
          </h2>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="rounded-xl cursor-pointer"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </div>

        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          {/* Recommended primary action */}
          <section className="space-y-3">
            {wallets[0] ? (
              <button
                type="button"
                disabled={connecting}
                onClick={() => {
                  onConnect(wallets[0])
                }}
                className="flex w-full items-center cursor-pointer gap-3 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:bg-secondary disabled:opacity-60"
              >
                <WalletIcon wallet={wallets[0]} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-foreground">
                      {wallets[0].name}
                    </p>
                    <span className="rounded-md bg-lime px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-lime-foreground">
                      Recommended
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Instant connect with your installed wallet
                  </p>
                </div>
              </button>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4">
                <p className="font-semibold text-foreground">No wallet found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Install Phantom or Solflare, then refresh this page.
                </p>
              </div>
            )}
          </section>

          {/* Installed wallets grid */}
          <section className="space-y-3">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Installed
            </p>
            {wallets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                None detected in this browser.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {wallets.map((wallet) => (
                  <button
                    key={wallet.name}
                    type="button"
                    disabled={connecting}
                    onClick={() => {
                      onConnect(wallet)
                    }}
                    className={cn(
                      'flex flex-col cursor-pointer items-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition-colors hover:bg-secondary',
                      'disabled:opacity-60',
                    )}
                  >
                    <WalletIcon wallet={wallet} />
                    <span className="line-clamp-2 text-xs font-medium text-foreground">
                      {wallet.name}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* More wallets / install links */}
          {moreWallets.length > 0 ? (
            <section className="space-y-3">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                More wallets
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {moreWallets.map((wallet) => (
                  <a
                    key={wallet.name}
                    href={wallet.url}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-3 rounded-2xl border border-border bg-card px-3 py-3 transition-colors hover:bg-secondary"
                  >
                    <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-xs font-bold text-foreground">
                      {wallet.name.slice(0, 1)}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {wallet.name}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {wallet.hint}
                      </span>
                    </span>
                  </a>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        {connecting ? (
          <div className="border-t border-border px-5 py-3 text-sm text-muted-foreground">
            Connecting… approve in your wallet extension.
          </div>
        ) : null}
      </aside>
    </div>
  )
}
