import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { LAMPORTS_PER_SOL } from '@solana/web3.js'
import { useEffect, useState } from 'react'

import { BackendHealthPanel } from '@/components/BackendHealthPanel'
import { NETWORK_LABEL } from '@/lib/solana'
import { cn } from '@/lib/utils'

function shortenAddress(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

export function WalletPanel() {
  const { connection } = useConnection()
  const { publicKey, connected, connecting } = useWallet()
  const [balance, setBalance] = useState<number | null>(null)
  const [balanceError, setBalanceError] = useState<string | null>(null)

  useEffect(() => {
    if (!publicKey) {
      return
    }

    let cancelled = false

    const loadBalance = async () => {
      try {
        const lamports = await connection.getBalance(publicKey)
        if (!cancelled) {
          setBalance(lamports / LAMPORTS_PER_SOL)
          setBalanceError(null)
        }
      } catch {
        if (!cancelled) {
          setBalance(null)
          setBalanceError('Could not fetch balance')
        }
      }
    }

    void loadBalance()

    const subscriptionId = connection.onAccountChange(publicKey, (account) => {
      setBalance(account.lamports / LAMPORTS_PER_SOL)
      setBalanceError(null)
    })

    return () => {
      cancelled = true
      connection.removeAccountChangeListener(subscriptionId)
    }
  }, [connection, publicKey])

  const shownBalance = publicKey ? balance : null
  const shownError = publicKey ? balanceError : null

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-8">
      <div className="text-center">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">
          Solana · {NETWORK_LABEL}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">
          Portfolio Manager
        </h1>
        <p className="mt-3 text-base text-muted-foreground">
          Connect your wallet to get started. Transfers and portfolio tools come
          next.
        </p>
      </div>

      <WalletMultiButton
        className={cn(
          '!h-11 !rounded-md !bg-primary !px-6 !font-medium !text-primary-foreground',
          'hover:!bg-primary/90',
        )}
      />

      <div className="w-full space-y-3 border-t border-border pt-6 text-sm">
        <div className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Status</span>
          <span className="font-medium text-foreground">
            {connecting
              ? 'Connecting…'
              : connected
                ? 'Connected'
                : 'Not connected'}
          </span>
        </div>

        {publicKey ? (
          <>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Address</span>
              <span
                className="font-mono text-foreground"
                title={publicKey.toBase58()}
              >
                {shortenAddress(publicKey.toBase58())}
              </span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-medium text-foreground">
                {shownError
                  ? shownError
                  : shownBalance === null
                    ? 'Loading…'
                    : `${shownBalance.toFixed(4)} SOL`}
              </span>
            </div>
          </>
        ) : null}
      </div>

      <BackendHealthPanel />
    </div>
  )
}
