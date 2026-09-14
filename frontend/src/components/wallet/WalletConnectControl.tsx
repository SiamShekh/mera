import {
  useConnect,
  useConnectedWallet,
  useWalletStatus,
  useWallets,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { ChevronDown } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { ConnectWalletModal } from '@/components/wallet/ConnectWalletModal'
import { WalletDetailsPanel } from '@/components/wallet/WalletDetailsPanel'
import { shortenAddress } from '@/lib/format'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'

type WalletConnectControlProps = {
  className?: string
  /** Compact for mobile top bar */
  compact?: boolean
}

/**
 * Connect button / address pill + connect modal / wallet details panel.
 * Clicking a connected address opens holdings + balance (does not disconnect).
 */
export function WalletConnectControl({
  className,
  compact = false,
}: WalletConnectControlProps) {
  const client = useClient<AppClient>()
  const status = useWalletStatus(client)
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)

  const [connectOpen, setConnectOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const owner = connected?.account.address

  return (
    <>
      {status === 'pending' ? (
        <span
          className={cn(
            'rounded-full bg-secondary px-3 text-xs leading-9 text-muted-foreground',
            compact ? 'h-9' : 'h-10',
            className,
          )}
        >
          …
        </span>
      ) : connected && owner ? (
        <button
          type="button"
          onClick={() => {
            setDetailsOpen(true)
          }}
          className={cn(
            'flex shrink-0 items-center cursor-pointer gap-1.5 rounded-full bg-secondary px-2.5 text-xs font-medium text-foreground',
            compact ? 'h-9 max-w-30' : 'h-10 max-w-36 px-3 text-sm',
            className,
          )}
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-lime text-[10px] font-bold text-lime-foreground">
            W
          </span>
          <span className="truncate">{shortenAddress(owner)}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      ) : (
        <Button
          type="button"
          size="sm"
          className={cn(
            'shrink-0 rounded-full px-3 cursor-pointer',
            compact ? 'h-9' : 'h-10 px-4',
            className,
          )}
          onClick={() => {
            setConnectOpen(true)
          }}
        >
          Connect
        </Button>
      )}

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

      {owner ? (
        <WalletDetailsPanel
          open={detailsOpen}
          ownerAddress={owner}
          onClose={() => {
            setDetailsOpen(false)
          }}
        />
      ) : null}
    </>
  )
}
