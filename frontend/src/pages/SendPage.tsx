import {
  useConnect,
  useConnectedWallet,
  useWalletStatus,
  useWallets,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ExternalLink, Wallet } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ConnectWalletModal } from '@/components/wallet/ConnectWalletModal'
import { formatMoney, formatQty, shortenAddress } from '@/lib/format'
import {
  isValidSolanaAddress,
  parseUiAmountToRaw,
  sendHoldingTransfer,
  SOL_FEE_RESERVE,
} from '@/lib/sendTransfer'
import type { AppClient } from '@/lib/solanaClient'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'
import { availableHoldings, findAvailableHolding, type Holding } from '@/types/holding'

type LocalActivity = {
  id: string
  asset: string
  amount: string
  to: string
  signature: string
  icon: string | null
}

/**
 * Send page — transfer SOL or tokens to any Solana address.
 */
export function SendPage() {
  const client = useClient<AppClient>()
  const status = useWalletStatus(client)
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)
  const dispatch = useAppDispatch()

  const { holdings, loading: holdingsLoading } = useAppSelector(
    (state) => state.portfolio,
  )

  const [connectOpen, setConnectOpen] = useState(false)
  const [selectedMint, setSelectedMint] = useState<string | null>(null)
  const [amount, setAmount] = useState('')
  const [recipient, setRecipient] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activity, setActivity] = useState<LocalActivity[]>([])

  const owner = connected?.account.address
  const signer = connected?.signer

  useEffect(() => {
    if (!owner) {
      return
    }
    void dispatch(loadPortfolio(owner))
  }, [dispatch, owner])

  const spendable = useMemo(() => availableHoldings(holdings), [holdings])

  const activeMint =
    selectedMint && spendable.some((row) => row.mint === selectedMint)
      ? selectedMint
      : (spendable[0]?.mint ?? 'native')

  const selected = useMemo(
    () => findAvailableHolding(holdings, activeMint),
    [holdings, activeMint],
  )

  const usdPreview = useMemo(() => {
    const n = Number(amount)
    if (!selected || !Number.isFinite(n) || n <= 0) {
      return 0
    }
    return n * selected.price
  }, [amount, selected])

  function setHalf() {
    if (!selected) {
      return
    }
    setAmount(formatSendAmount(selected.quantity / 2, selected.decimals))
  }

  function setMax() {
    if (!selected) {
      return
    }
    if (selected.mint === 'native') {
      const maxRaw = parseUiAmountToRaw(
        selected.quantity.toFixed(selected.decimals),
        selected.decimals,
      )
      const spendable = maxRaw > SOL_FEE_RESERVE ? maxRaw - SOL_FEE_RESERVE : 0n
      setAmount(formatRawToUi(spendable, selected.decimals))
      return
    }
    setAmount(formatSendAmount(selected.quantity, selected.decimals))
  }

  async function handleSend() {
    setError(null)
    if (!owner || !signer || !selected) {
      setError('Connect a Solana wallet first')
      return
    }
    if (!amount.trim()) {
      setError('Enter an amount')
      return
    }
    if (!isValidSolanaAddress(recipient.trim())) {
      setError('Enter a valid Solana recipient address')
      return
    }

    setSending(true)
    try {
      const signature = await sendHoldingTransfer({
        client,
        signer,
        holding: selected,
        recipient: recipient.trim(),
        uiAmount: amount.trim(),
      })

      setActivity((prev) =>
        [
          {
            id: signature,
            asset: selected.asset,
            amount: amount.trim(),
            to: recipient.trim(),
            signature,
            icon: selected.icon,
          },
          ...prev,
        ].slice(0, 8),
      )

      setAmount('')
      void dispatch(loadPortfolio(owner))
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Transfer failed — try again'
      setError(message)
    } finally {
      setSending(false)
    }
  }

  const canSend =
    Boolean(owner && signer && selected && amount.trim() && recipient.trim()) &&
    !sending

  if (status === 'pending') {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading wallet…</p>
      </div>
    )
  }

  return (
    <div className="flex w-full flex-1 flex-col items-center justify-center px-1 py-4">
      <section className="w-full max-w-[420px] rounded-3xl border border-border bg-card p-4 shadow-sm sm:p-5">
        {!owner ? (
          <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-10 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-lime">
              <Wallet className="size-6 text-lime-foreground" />
            </div>
            <p className="mt-4 text-base font-semibold text-foreground">
              Connect a Solana wallet
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              You need a wallet to send SOL or tokens.
            </p>
            <Button
              type="button"
              className="mt-5 rounded-xl"
              onClick={() => {
                setConnectOpen(true)
              }}
            >
              Connect wallet
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <h1 className="bg-gradient-to-r from-[#14F195] to-[#9945FF] bg-clip-text text-2xl font-semibold tracking-tight text-transparent">
                Send
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Send money to any Solana wallet address
              </p>
            </div>

            <div className="rounded-2xl bg-background p-4">
              <div className="mb-3 flex items-center justify-between gap-2 text-xs">
                <span className="text-muted-foreground">Sending</span>
                <span className="text-muted-foreground">
                  {selected
                    ? `${formatQty(selected.quantity)} ${selected.asset}`
                    : holdingsLoading
                      ? 'Loading…'
                      : '0'}{' '}
                  <button
                    type="button"
                    className="cursor-pointer font-semibold text-foreground"
                    onClick={setHalf}
                  >
                    HALF
                  </button>{' '}
                  <button
                    type="button"
                    className="cursor-pointer font-semibold text-foreground"
                    onClick={setMax}
                  >
                    MAX
                  </button>
                </span>
              </div>

              <div className="flex items-center gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setPickerOpen((open) => !open)
                    }}
                    className="flex cursor-pointer items-center gap-1.5 rounded-full bg-secondary px-2.5 py-2 text-sm font-semibold text-foreground"
                  >
                    <TokenAvatar holding={selected} />
                    {selected?.asset ?? 'Token'}
                    <ChevronDown className="size-4 text-muted-foreground" />
                  </button>
                  {pickerOpen ? (
                    <div className="absolute top-full left-0 z-20 mt-2 max-h-56 w-48 overflow-y-auto rounded-2xl border border-border bg-card p-1 shadow-lg">
                      {spendable.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          No balances
                        </p>
                      ) : (
                        spendable.map((row) => (
                          <button
                            key={row.mint}
                            type="button"
                            className="flex w-full cursor-pointer items-center gap-2 rounded-xl px-2 py-2 text-left text-sm hover:bg-secondary"
                            onClick={() => {
                              setSelectedMint(row.mint)
                              setAmount('')
                              setPickerOpen(false)
                            }}
                          >
                            <TokenAvatar holding={row} />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              {row.asset}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 text-right">
                  <input
                    type="text"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={amount}
                    onChange={(event) => {
                      setAmount(event.target.value)
                      setError(null)
                    }}
                    className="w-full bg-transparent text-right text-3xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/40"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatMoney(usdPreview)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-background px-4 py-3">
              <label className="flex items-center gap-2 text-sm">
                <span className="shrink-0 text-muted-foreground">To:</span>
                <input
                  type="text"
                  spellCheck={false}
                  placeholder="Enter recipient address"
                  value={recipient}
                  onChange={(event) => {
                    setRecipient(event.target.value)
                    setError(null)
                  }}
                  className="min-w-0 flex-1 bg-transparent font-mono text-sm text-foreground outline-none placeholder:font-sans placeholder:text-muted-foreground"
                />
              </label>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <Button
              type="button"
              disabled={!canSend}
              className="h-12 w-full rounded-2xl bg-lime text-base font-semibold text-lime-foreground hover:bg-lime/90 disabled:opacity-50"
              onClick={() => {
                void handleSend()
              }}
            >
              {sending ? 'Confirm in wallet…' : 'Send'}
            </Button>

            <div className="pt-2">
              <p className="mb-2 text-sm font-semibold text-foreground">
                Activity
              </p>
              {activity.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Your recent sends from this session show up here.
                </p>
              ) : (
                <ul className="divide-y divide-border rounded-2xl border border-border">
                  {activity.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 px-3 py-3"
                    >
                      {item.icon ? (
                        <img
                          src={item.icon}
                          alt=""
                          className="size-8 rounded-full bg-secondary object-cover"
                        />
                      ) : (
                        <span className="flex size-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                          {item.asset.slice(0, 1)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">
                          {item.amount} {item.asset}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          to {shortenAddress(item.to)}
                        </p>
                      </div>
                      <a
                        href={`https://solscan.io/tx/${item.signature}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-lg p-2 text-muted-foreground hover:text-foreground"
                        aria-label="View on Solscan"
                      >
                        <ExternalLink className="size-4" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
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

function TokenAvatar({ holding }: { holding: Holding | null }) {
  if (holding?.icon) {
    return (
      <img
        src={holding.icon}
        alt=""
        className="size-6 rounded-full bg-card object-cover"
      />
    )
  }
  return (
    <span className="flex size-6 items-center justify-center rounded-full bg-card text-[10px] font-bold">
      {holding?.asset.slice(0, 1) ?? '?'}
    </span>
  )
}

function formatSendAmount(value: number, decimals: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return '0'
  }
  const fixed = value.toFixed(Math.min(decimals, 9))
  return fixed.replace(/\.?0+$/, '') || '0'
}

function formatRawToUi(raw: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals)
  const whole = raw / scale
  const frac = (raw % scale).toString().padStart(decimals, '0')
  const trimmed = frac.replace(/0+$/, '')
  return trimmed ? `${whole}.${trimmed}` : whole.toString()
}
