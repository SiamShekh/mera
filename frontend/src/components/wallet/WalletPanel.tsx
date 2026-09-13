import { address } from '@solana/kit'
import {
  useConnect,
  useConnectedWallet,
  useDisconnect,
  useWallets,
  useWalletStatus,
} from '@solana/kit-plugin-wallet/react'
import { useClient, useRequest } from '@solana/react'
import { useMemo } from 'react'

import { BackendHealthPanel } from '@/components/BackendHealthPanel'
import { Button } from '@/components/ui/button'
import { NetworkSwitch } from '@/components/wallet/NetworkSwitch'
import { LAMPORTS_PER_SOL } from '@/lib/config'
import { useNetwork } from '@/hooks/useNetwork'
import type { AppClient } from '@/lib/solanaClient'

function shortenAddress(value: string) {
  return `${value.slice(0, 4)}…${value.slice(-4)}`
}

function formatSol(lamports: bigint) {
  const whole = lamports / LAMPORTS_PER_SOL
  const fraction = ((lamports % LAMPORTS_PER_SOL) * 10000n) / LAMPORTS_PER_SOL
  return `${whole}.${fraction.toString().padStart(4, '0')} SOL`
}

export function WalletPanel() {
  const client = useClient<AppClient>()
  const { networkConfig } = useNetwork()

  const status = useWalletStatus(client)
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)
  const disconnect = useDisconnect(client)

  // RPC balance request — only when a wallet is connected
  const owner = connected?.account.address
  const balanceSource = useMemo(() => {
    if (!owner) {
      return null
    }
    return client.rpc.getBalance(address(owner))
  }, [client, owner])

  const balanceRequest = useRequest(balanceSource)

  // Still auto-reconnecting — wait before showing connect UI
  if (status === 'pending') {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-4">
        <p className="text-sm text-muted-foreground">Loading wallet…</p>
      </div>
    )
  }

  const balanceText = (() => {
    if (!owner) {
      return null
    }
    if (balanceRequest.status === 'fetching') {
      return 'Loading…'
    }
    if (balanceRequest.status === 'error' || balanceRequest.error) {
      return 'Could not fetch balance'
    }
    if (balanceRequest.data?.value == null) {
      return 'Loading…'
    }
    return formatSol(balanceRequest.data.value)
  })()

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Solana · {networkConfig.label}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Portfolio Manager
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Connect your wallet to get started. Transfers and portfolio tools come
          next.
        </p>
      </div>

      {/* ON = Devnet, OFF = Mainnet — rebuilds the Kit client */}
      <div className="w-full border-b border-border pb-6">
        <NetworkSwitch />
      </div>

      {/* Connect / disconnect controls */}
      {connected ? (
        <Button
          type="button"
          variant="outline"
          disabled={disconnect.isRunning}
          onClick={() => {
            disconnect.dispatch()
          }}
        >
          {disconnect.isRunning ? 'Disconnecting…' : 'Disconnect'}
        </Button>
      ) : (
        <div className="flex w-full flex-col gap-2">
          {wallets.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              No wallet found. Install Phantom or Solflare, then refresh.
            </p>
          ) : (
            wallets.map((wallet) => (
              <Button
                key={wallet.name}
                type="button"
                disabled={connect.isRunning}
                onClick={() => {
                  connect.dispatch(wallet)
                }}
              >
                {connect.isRunning ? 'Connecting…' : `Connect ${wallet.name}`}
              </Button>
            ))
          )}
        </div>
      )}

      <div className="w-full space-y-3 border-t border-border pt-6 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Network</span>
          <span className="font-medium text-foreground">
            {networkConfig.label}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Status</span>
          <span className="font-medium text-foreground">{status}</span>
        </div>

        {owner ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Address</span>
              <span className="font-mono text-foreground" title={owner}>
                {shortenAddress(owner)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium text-foreground">{balanceText}</span>
            </div>
          </>
        ) : null}
      </div>

      <BackendHealthPanel />
    </div>
  )
}
