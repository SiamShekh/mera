import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useState } from 'react'

import { ActivityPanel } from '@/components/ActivityPanel'
import { AirdropPanel } from '@/components/AirdropPanel'
import { BackendHealthPanel } from '@/components/BackendHealthPanel'
import { HoldingsList } from '@/components/HoldingsList'
import { Button } from '@/components/ui/button'
import { ConnectWalletModal } from '@/components/wallet/ConnectWalletModal'
import { NETWORK_LABEL } from '@/lib/config'
import { shortenAddress } from '@/lib/format'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'

const TABS = ['Positions', 'Spot', 'Activity', 'Airdrop'] as const
type TabId = (typeof TABS)[number]

/**
 * White Jupiter-style portfolio shell:
 * header → tabs → content panels
 */
export function WalletPanel() {
  const client = useClient<AppClient>()

  const status = useWalletStatus(client)
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)
  const disconnect = useDisconnect(client)

  const [connectOpen, setConnectOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<TabId>('Positions')

  const owner = connected?.account.address

  if (status === 'pending') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading wallet…</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      {/* Top header */}
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-lime text-sm font-bold text-lime-foreground">
            P
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate font-semibold text-foreground">
                {owner ? shortenAddress(owner) : 'Portfolio Manager'}
              </p>
              {connected ? (
                <span className="inline-flex items-center rounded-md bg-lime/30 px-2 py-0.5 text-xs font-medium text-lime-foreground">
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center rounded-md bg-secondary px-2 py-0.5 text-xs font-medium text-muted-foreground">
                  Not connected
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Solana · {NETWORK_LABEL}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {connected ? (
            <Button
              type="button"
              variant="outline"
              className="rounded-xl"
              disabled={disconnect.isRunning}
              onClick={() => {
                disconnect.dispatch()
              }}
            >
              {disconnect.isRunning ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          ) : (
            <Button
              type="button"
              className="rounded-xl"
              onClick={() => {
                setConnectOpen(true)
              }}
            >
              Connect Wallet
            </Button>
          )}
        </div>
      </header>

      {/* Tabs */}
      <nav className="flex gap-6 overflow-x-auto border-b border-border">
        {TABS.map((tab) => {
          const active = tab === activeTab
          return (
            <button
              key={tab}
              type="button"
              onClick={() => {
                setActiveTab(tab)
              }}
              className={cn(
                'relative shrink-0 pb-3 text-sm font-medium transition-colors',
                active
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {tab}
              {active ? (
                <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-lime" />
              ) : null}
            </button>
          )
        })}
      </nav>

      {/* Tab content */}
      {!owner ? (
        <section className="rounded-2xl bg-card px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Connect your wallet
          </h1>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
            Open the connect panel to link Phantom, Solflare, or another
            installed wallet.
          </p>
          <Button
            type="button"
            className="mt-6 rounded-xl"
            onClick={() => {
              setConnectOpen(true)
            }}
          >
            Connect Wallet
          </Button>
        </section>
      ) : (
        <>
          {activeTab === 'Positions' ? (
            <HoldingsList ownerAddress={owner} mode="positions" />
          ) : null}
          {activeTab === 'Spot' ? (
            <HoldingsList ownerAddress={owner} mode="spot" />
          ) : null}
          {activeTab === 'Activity' ? (
            <ActivityPanel ownerAddress={owner} />
          ) : null}
          {activeTab === 'Airdrop' ? <AirdropPanel /> : null}
        </>
      )}

      <div className="opacity-70">
        <BackendHealthPanel />
      </div>

      <ConnectWalletModal
        open={connectOpen}
        wallets={wallets}
        connecting={connect.isRunning}
        onClose={() => {
          setConnectOpen(false)
        }}
        onConnect={(wallet) => {
          // Kit connect expects the wallet object from useWallets()
          connect.dispatch(wallet as (typeof wallets)[number])
          setConnectOpen(false)
        }}
      />
    </div>
  )
}
