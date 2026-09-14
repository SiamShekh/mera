import {
  useConnectedWallet,
  useWalletStatus,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useState } from 'react'

import { ActivityPanel } from '@/components/ActivityPanel'
import { HoldingsList } from '@/components/HoldingsList'
import { NETWORK_LABEL } from '@/lib/config'
import { shortenAddress } from '@/lib/format'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'

const TABS = ['Positions', 'Spot', 'Activity'] as const
type TabId = (typeof TABS)[number]

/**
 * Portfolio page — narrow stack on mobile, wide dashboard on desktop.
 */
export function WalletPanel() {
  const client = useClient<AppClient>()
  const status = useWalletStatus(client)
  const connected = useConnectedWallet(client)

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
    <div className="mx-auto w-full max-w-lg space-y-5 lg:mx-0 lg:max-w-6xl lg:space-y-6">
      <header className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">
            Portfolio
          </h1>
          <p className="text-xs text-muted-foreground lg:text-sm">
            Solana · {NETWORK_LABEL}
            {owner ? ` · ${shortenAddress(owner)}` : ' · Not connected'}
          </p>
        </div>
      </header>

      <nav className="flex gap-5 overflow-x-auto border-b border-border lg:gap-8">
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
                'relative shrink-0 cursor-pointer pb-3 text-sm font-medium transition-colors lg:text-base',
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

      {!owner ? (
        <section className="rounded-2xl bg-card px-6 py-14 text-center lg:px-10 lg:py-20">
          <h2 className="text-xl font-semibold tracking-tight text-foreground lg:text-2xl">
            Connect your wallet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground lg:text-base">
            Use Connect in the top bar to link Phantom, Solflare, or another
            installed wallet.
          </p>
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
        </>
      )}
    </div>
  )
}
