import {
  useConnect,
  useConnectedWallet,
  useWalletStatus,
  useWallets,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useState } from 'react'
import { ArrowLeftRight, Check, ChevronDown, Copy, Grid2x2 } from 'lucide-react'

import { DepositQr } from '@/components/deposit/DepositQr'
import { Button } from '@/components/ui/button'
import { ConnectWalletModal } from '@/components/wallet/ConnectWalletModal'
import { NETWORK_LABEL } from '@/lib/config'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'

type DepositTab = 'deposit' | 'bridge'

/**
 * Jupiter-style Solana deposit UI — centered card, white theme.
 */
export function DepositPage() {
  const client = useClient<AppClient>()
  const status = useWalletStatus(client)
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)

  const [tab, setTab] = useState<DepositTab>('deposit')
  const [connectOpen, setConnectOpen] = useState(false)
  const [copied, setCopied] = useState(false)

  const owner = connected?.account.address

  async function copyAddress() {
    if (!owner) {
      return
    }
    try {
      await navigator.clipboard.writeText(owner)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch {
      // Clipboard may be blocked
    }
  }

  if (status === 'pending') {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading wallet…</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-col items-center px-1 py-6 lg:min-h-[calc(100svh-11rem)] lg:justify-center lg:py-10">
      <header className="mb-6 max-w-xl text-center lg:mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
          Bring your funds to{' '}
          <span className="bg-gradient-to-r from-[#9945FF] to-[#14F195] bg-clip-text text-transparent">
            Solana
          </span>
          , all in one place
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          Solana deposits only · {NETWORK_LABEL}
        </p>
      </header>

      <section className="w-full max-w-[420px] rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-secondary p-1">
          <button
            type="button"
            onClick={() => {
              setTab('deposit')
            }}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
              tab === 'deposit'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Grid2x2 className="size-4" />
            Deposit crypto
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('bridge')
            }}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors',
              tab === 'bridge'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <ArrowLeftRight className="size-4" />
            Bridge &amp; swap
          </button>
        </div>

        {tab === 'bridge' ? (
          <div className="px-2 py-16 text-center">
            <p className="text-base font-semibold text-foreground">
              Coming soon
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Bridge &amp; swap is not available yet. Use Deposit crypto for
              Solana transfers.
            </p>
            <Button
              type="button"
              className="mt-5 rounded-xl"
              onClick={() => {
                setTab('deposit')
              }}
            >
              Back to deposit
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-5">
            <div>
              <p className="mb-2 text-sm text-muted-foreground">Chains</p>
              <div className="flex h-12 w-full items-center gap-2.5 rounded-2xl border border-border bg-background px-3">
                <span className="flex size-7 items-center justify-center rounded-full bg-[#9945FF]/15">
                  <SolanaMark />
                </span>
                <span className="flex-1 text-left text-sm font-semibold text-foreground">
                  Solana
                </span>
                <ChevronDown className="size-4 text-muted-foreground opacity-40" />
              </div>
            </div>

            {!owner ? (
              <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-10 text-center">
                <p className="text-base font-semibold text-foreground">
                  Select a Solana wallet
                </p>
                <p className="mx-auto mt-2 max-w-xs text-sm text-muted-foreground">
                  Connect to generate your deposit QR and address.
                </p>
                <Button
                  type="button"
                  className="mt-5 h-11 rounded-2xl px-6"
                  onClick={() => {
                    setConnectOpen(true)
                  }}
                >
                  Connect Solana wallet
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-center rounded-2xl bg-background py-6">
                  <DepositQr address={owner} size={220} />
                </div>

                <div>
                  <p className="mb-2 text-sm text-muted-foreground">
                    Your Solana wallet address
                  </p>
                  <div className="rounded-2xl border border-border bg-background px-3 py-3">
                    <p className="break-all font-mono text-xs leading-relaxed text-foreground sm:text-sm">
                      {owner}
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="mt-3 h-12 w-full rounded-2xl text-base font-semibold"
                    onClick={() => {
                      void copyAddress()
                    }}
                  >
                    {copied ? (
                      <>
                        <Check className="size-4" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="size-4" />
                        Copy address
                      </>
                    )}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <ConnectWalletModal
        open={connectOpen}
        wallets={wallets}
        connecting={connect.isRunning}
        onClose={() => {
          setConnectOpen(false)
        }}
        onConnect={(wallet) => {
          connect.dispatch(wallet as (typeof wallets)[number])
          setConnectOpen(false)
        }}
      />
    </div>
  )
}

function SolanaMark() {
  return (
    <svg
      viewBox="0 0 397.7 311.7"
      className="size-3.5 text-[#9945FF]"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7zM64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8zM333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
      />
    </svg>
  )
}
