import { useDisconnect } from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowUpRight,
  BadgeCheck,
  Copy,
  Eye,
  EyeOff,
  LogOut,
  X,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TokenIcon } from '@/components/TokenIcon'
import { XSTOCK_BY_SYMBOL } from '@/data/xstocks'
import { formatMoney, formatQty, formatSol, shortenAddress } from '@/lib/format'
import type { AppClient } from '@/lib/solanaClient'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { clearPortfolio, loadPortfolio } from '@/store/portfolioSlice'

type WalletDetailsPanelProps = {
  open: boolean
  ownerAddress: string
  onClose: () => void
}

/**
 * Wallet details slide-over: balance, holdings list, disconnect.
 * Portaled to document.body so backdrop-blur on the top bar does not trap
 * `position: fixed` (which caused overlapping page content).
 */
export function WalletDetailsPanel({
  open,
  ownerAddress,
  onClose,
}: WalletDetailsPanelProps) {
  const client = useClient<AppClient>()
  const disconnect = useDisconnect(client)
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const { holdings, loading, error } = useAppSelector(
    (state) => state.portfolio,
  )

  const [hidden, setHidden] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }
    void dispatch(loadPortfolio(ownerAddress))
  }, [dispatch, open, ownerAddress])

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

  const totalValue = useMemo(
    () => holdings.reduce((sum, row) => sum + row.value, 0),
    [holdings],
  )
  const totalSol = useMemo(
    () => holdings.reduce((sum, row) => sum + row.valueInSol, 0),
    [holdings],
  )

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(ownerAddress)
      setCopied(true)
      window.setTimeout(() => {
        setCopied(false)
      }, 1500)
    } catch {
      // Clipboard may be blocked; ignore
    }
  }

  function handleDisconnect() {
    disconnect.dispatch()
    dispatch(clearPortfolio())
    onClose()
  }

  if (!open) {
    return null
  }

  const balanceLabel = hidden
    ? '••••'
    : loading && holdings.length === 0
      ? '…'
      : formatMoney(totalValue)
  const solLabel = hidden
    ? '••••'
    : `~${formatSol(totalSol).replace(' SOL', '')} SOL`

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/40"
        aria-label="Close wallet details"
        onClick={onClose}
      />

      <aside
        className="relative flex h-full w-full max-w-md flex-col bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-details-title"
      >
        <div className="border-b border-border px-5 pt-4 pb-5">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                void copyAddress()
              }}
              className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground"
              id="wallet-details-title"
            >
              {shortenAddress(ownerAddress)}
              <Copy className="size-3.5 text-muted-foreground" />
              {copied ? (
                <span className="text-xs text-muted-foreground">Copied</span>
              ) : null}
            </button>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={() => {
                  setHidden((value) => !value)
                }}
                aria-label={hidden ? 'Show balances' : 'Hide balances'}
              >
                {hidden ? (
                  <EyeOff className="size-5" />
                ) : (
                  <Eye className="size-5" />
                )}
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="rounded-xl"
                onClick={onClose}
                aria-label="Close"
              >
                <X className="size-5" />
              </Button>
            </div>
          </div>

          <p className="mt-4 text-4xl font-semibold tracking-tight text-foreground">
            {balanceLabel}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">{solLabel}</p>

          <div className="mt-4 flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 rounded-xl"
              onClick={() => {
                onClose()
                navigate('/deposit')
              }}
            >
              <ArrowDownToLine className="size-4" />
              Deposit
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-10 flex-1 rounded-xl"
              onClick={() => {
                onClose()
                navigate('/send')
              }}
            >
              <ArrowUpRight className="size-4" />
              Send
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-10 shrink-0 rounded-xl"
              disabled={disconnect.isRunning}
              onClick={handleDisconnect}
              aria-label="Disconnect wallet"
            >
              <LogOut className="size-4" />
            </Button>
          </div>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          {error ? (
            <p className="px-5 py-4 text-sm text-destructive">{error}</p>
          ) : null}

          {loading && holdings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              Loading holdings…
            </p>
          ) : null}

          {!loading && !error && holdings.length === 0 ? (
            <p className="px-5 py-6 text-sm text-muted-foreground">
              No tokens found in this wallet.
            </p>
          ) : null}

          <ul className="mt-2 divide-y divide-border">
            {holdings.map((row) => (
              <li
                key={row.mint}
                className="flex items-center gap-3 px-5 py-3.5"
              >
                <TokenIcon symbol={row.asset} src={row.icon} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="inline-flex items-center gap-1 font-semibold text-foreground">
                    {displayAssetName(row.asset)}
                    <BadgeCheck className="size-3.5 text-positive" />
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {hidden
                      ? '••••'
                      : `${formatQty(row.quantity)} ${row.asset}`}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-foreground">
                  {hidden ? '••••' : formatMoney(row.value)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>,
    document.body,
  )
}

function displayAssetName(asset: string): string {
  switch (asset) {
    case 'SOL':
      return 'Solana'
    case 'USDC':
      return 'USD Coin'
    case 'SOLx':
      return 'SOL'
    case 'stX':
      return 'Staked X'
    case 'NVDAx':
      return 'NVIDIA xStock'
    default: {
      const stock = XSTOCK_BY_SYMBOL[asset]
      return stock?.name ?? asset
    }
  }
}
