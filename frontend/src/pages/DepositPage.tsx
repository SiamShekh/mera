import {
  useConnect,
  useConnectedWallet,
  useWalletStatus,
  useWallets,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { DepositQr } from '@/components/deposit/DepositQr'
import { Button } from '@/components/ui/button'
import { ConnectWalletModal } from '@/components/wallet/ConnectWalletModal'
import type { AppClient } from '@/lib/solanaClient'

/**
 * Solana deposit UI — QR + address for the connected wallet.
 */
export function DepositPage() {
  const client = useClient<AppClient>()
  const status = useWalletStatus(client)
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)

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
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading wallet…</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center px-1 py-4">
      <section className="w-full max-w-[420px] space-y-5 rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
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
