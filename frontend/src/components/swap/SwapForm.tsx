import {
  useConnect,
  useConnectedWallet,
  useWallets,
} from '@solana/kit-plugin-wallet/react'
import { useClient } from '@solana/react'
import { useEffect, useMemo, useState } from 'react'
import { ArrowDownUp, ChevronDown, Settings2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { TokenIcon } from '@/components/TokenIcon'
import { ConnectWalletModal } from '@/components/wallet/ConnectWalletModal'
import { formatQty } from '@/lib/format'
import { listSwapAssets, quoteMockSwap, type SwapAsset } from '@/lib/mints'
import { iconForSymbol } from '@/lib/tokenIcons'
import { sendHoldingTransfer } from '@/lib/sendTransfer'
import type { AppClient } from '@/lib/solanaClient'
import { cn } from '@/lib/utils'
import {
  useCompleteSwapMutation,
  useGetPricesQuery,
  useSwapConfigQuery,
} from '@/store/api'
import { useAppDispatch, useAppSelector } from '@/store/hooks'
import { loadPortfolio } from '@/store/portfolioSlice'
import { PORTFOLIO_REFRESH_EVENT } from '@/lib/portfolioRefresh'
import type { Holding } from '@/types/holding'

type SwapFormProps = {
  className?: string
}

/** Spot market swap. */
export function SwapForm({ className }: SwapFormProps) {
  const client = useClient<AppClient>()
  const wallets = useWallets(client)
  const connected = useConnectedWallet(client)
  const connect = useConnect(client)
  const dispatch = useAppDispatch()
  const holdings = useAppSelector((state) => state.portfolio.holdings)

  const { data: swapConfig } = useSwapConfigQuery(undefined, {
    pollingInterval: 15_000,
  })
  const { data: priceBook } = useGetPricesQuery()
  const [completeSwap] = useCompleteSwapMutation()

  const assets = useMemo(() => {
    const priceByMint = new Map(
      (priceBook?.prices ?? []).map((row) => [row.mint, row.priceUsd]),
    )
    const base =
      swapConfig?.tokens?.length && swapConfig.tokens.length > 0
        ? swapConfig.tokens.map((token) => ({
            symbol: token.symbol,
            mint: token.mint,
            decimals: token.decimals,
            priceUsd: priceByMint.get(token.mint) ?? token.priceUsd,
            icon: iconForSymbol(token.symbol),
          }))
        : listSwapAssets().map((row) => ({
            ...row,
            priceUsd: priceByMint.get(row.mint) ?? row.priceUsd,
          }))
    return base
  }, [swapConfig, priceBook])

  const [sellAmount, setSellAmount] = useState('')
  const [sellMintOverride, setSellMintOverride] = useState<string | null>(null)
  const [buyMintOverride, setBuyMintOverride] = useState<string | null>(null)
  const [picker, setPicker] = useState<'sell' | 'buy' | null>(null)
  const [connectOpen, setConnectOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const owner = connected?.account.address
  const signer = connected?.signer
  const treasury = swapConfig?.treasury ?? null

  useEffect(() => {
    if (!owner) {
      return
    }
    void dispatch(loadPortfolio(owner))
    const id = window.setInterval(() => {
      void dispatch(loadPortfolio(owner))
    }, 8_000)
    const onRefresh = () => {
      void dispatch(loadPortfolio(owner))
    }
    window.addEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh)
    return () => {
      window.clearInterval(id)
      window.removeEventListener(PORTFOLIO_REFRESH_EVENT, onRefresh)
    }
  }, [dispatch, owner])

  const sellMint = sellMintOverride ?? assets[0]?.mint ?? null
  const buyMint =
    buyMintOverride && buyMintOverride !== sellMint
      ? buyMintOverride
      : (assets.find((a) => a.mint !== sellMint)?.mint ?? null)

  const sellAsset = assets.find((a) => a.mint === sellMint) ?? assets[0]
  const buyAsset =
    assets.find((a) => a.mint === buyMint && a.mint !== sellAsset?.mint) ??
    assets.find((a) => a.mint !== sellAsset?.mint) ??
    assets[1]

  const sellHolding = useMemo(
    () => holdings.find((row) => row.mint === sellAsset?.mint) ?? null,
    [holdings, sellAsset?.mint],
  )

  const buyBalance = useMemo(
    () => holdings.find((row) => row.mint === buyAsset?.mint)?.quantity ?? 0,
    [holdings, buyAsset?.mint],
  )

  const sellQty = Number(String(sellAmount).replace(/,/g, ''))
  const buyAmount =
    sellAsset && buyAsset && Number.isFinite(sellQty) && sellQty > 0
      ? quoteMockSwap(sellAsset, buyAsset, sellQty)
      : 0

  function flipTokens() {
    if (!sellAsset || !buyAsset) {
      return
    }
    setSellMintOverride(buyAsset.mint)
    setBuyMintOverride(sellAsset.mint)
    setSellAmount('')
    setError(null)
    setSuccess(null)
  }

  function setMax() {
    if (!sellHolding) {
      return
    }
    setSellAmount(
      sellHolding.quantity.toFixed(Math.min(sellHolding.decimals, 6)),
    )
  }

  function apiErrorMessage(err: unknown, fallback: string): string {
    if (err && typeof err === 'object') {
      const data = (err as { data?: unknown }).data
      if (data && typeof data === 'object') {
        if ('message' in data && data.message) {
          return String(data.message)
        }
        if ('error' in data && data.error) {
          return String(data.error)
        }
      }
      if (err instanceof Error && err.message) {
        return err.message
      }
    }
    return fallback
  }

  async function onSwap() {
    setError(null)
    setSuccess(null)

    if (!owner || !signer) {
      setConnectOpen(true)
      return
    }
    if (!sellAsset || !buyAsset) {
      setError('Select tokens to swap.')
      return
    }
    if (!treasury) {
      setError('Swap is temporarily unavailable. Try again later.')
      return
    }
    if (owner === treasury) {
      setError(
        'You are connected as the swap treasury wallet. Connect a different wallet to swap.',
      )
      return
    }
    const parsedSell = Number(String(sellAmount).replace(/,/g, ''))
    if (!(parsedSell > 0)) {
      setError('Enter an amount')
      return
    }
    if (!sellHolding || sellHolding.quantity < parsedSell) {
      setError(`Not enough ${sellAsset.symbol}.`)
      return
    }
    if (!sellHolding.tokenProgram) {
      setError('Missing token program for this asset')
      return
    }

    setBusy(true)
    try {
      const holding: Holding = sellHolding
      const depositSignature = await sendHoldingTransfer({
        client,
        signer,
        holding,
        recipient: treasury,
        uiAmount: String(parsedSell),
      })

      // Single complete call — backend claim lock prevents double mint on retries.
      let result
      try {
        result = await completeSwap({
          userAddress: owner,
          sellMint: sellAsset.mint,
          buyMint: buyAsset.mint,
          sellAmount: parsedSell,
          depositSignature,
        }).unwrap()
      } catch (err) {
        const message = apiErrorMessage(err, '')
        if (
          message.includes('not found') ||
          message.includes('wait a moment')
        ) {
          await new Promise((resolve) => setTimeout(resolve, 500))
          result = await completeSwap({
            userAddress: owner,
            sellMint: sellAsset.mint,
            buyMint: buyAsset.mint,
            sellAmount: parsedSell,
            depositSignature,
          }).unwrap()
        } else {
          throw err
        }
      }

      setSuccess(
        `Swapped ${parsedSell} ${sellAsset.symbol} → ${result.buyAmount} ${buyAsset.symbol}`,
      )
      setSellAmount('')
      void dispatch(loadPortfolio(owner))
    } catch (err) {
      const message = apiErrorMessage(err, 'Swap failed')
      const lower = message.toLowerCase()
      if (
        lower.includes('insufficient') ||
        lower.includes('no sol') ||
        lower.includes('lamport') ||
        lower.includes('fund')
      ) {
        setError('Not enough SOL for network fees.')
      } else {
        setError(message)
      }
    } finally {
      setBusy(false)
    }
  }

  const buttonLabel = !owner
    ? 'Connect wallet'
    : busy
      ? 'Swapping…'
      : !sellAmount
        ? 'Enter an amount'
        : `Swap ${sellAsset?.symbol ?? ''} → ${buyAsset?.symbol ?? ''}`

  return (
    <section className={cn('rounded-2xl bg-card p-3 sm:p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-foreground">Market</p>
      </div>

      <TokenLeg
        label="Sell"
        amount={sellAmount}
        onAmountChange={setSellAmount}
        asset={sellAsset}
        balance={sellHolding?.quantity ?? 0}
        onMax={setMax}
        onPick={() => {
          setPicker('sell')
        }}
        editable
      />

      <div className="relative z-10 -my-3 flex justify-center">
        <button
          type="button"
          onClick={flipTokens}
          className="flex size-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm"
          aria-label="Flip tokens"
        >
          <ArrowDownUp className="size-4" />
        </button>
      </div>

      <TokenLeg
        label="Buy"
        amount={buyAmount > 0 ? String(buyAmount) : ''}
        asset={buyAsset}
        balance={buyBalance}
        onPick={() => {
          setPicker('buy')
        }}
        editable={false}
      />

      {sellAsset && buyAsset && buyAmount > 0 ? (
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          1 {sellAsset.symbol} ≈ {quoteMockSwap(sellAsset, buyAsset, 1)}{' '}
          {buyAsset.symbol}
        </p>
      ) : null}

      {error ? (
        <p className="mt-2 text-center text-xs text-destructive">{error}</p>
      ) : null}
      {success ? (
        <p className="mt-2 text-center text-xs text-positive">{success}</p>
      ) : null}

      <Button
        type="button"
        disabled={busy || (Boolean(owner) && !sellAmount)}
        onClick={() => {
          if (!owner) {
            setConnectOpen(true)
            return
          }
          void onSwap()
        }}
        className="mt-3 h-12 w-full rounded-2xl bg-lime text-base font-semibold text-lime-foreground hover:bg-lime/90 disabled:opacity-70"
      >
        {buttonLabel}
      </Button>

      {picker && sellAsset && buyAsset ? (
        <TokenPicker
          assets={assets}
          excludeMint={picker === 'sell' ? buyAsset.mint : sellAsset.mint}
          onClose={() => {
            setPicker(null)
          }}
          onSelect={(asset) => {
            if (picker === 'sell') {
              setSellMintOverride(asset.mint)
            } else {
              setBuyMintOverride(asset.mint)
            }
            setPicker(null)
            setSellAmount('')
          }}
        />
      ) : null}

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
    </section>
  )
}

function TokenLeg({
  label,
  amount,
  onAmountChange,
  asset,
  balance,
  onMax,
  onPick,
  editable,
}: {
  label: string
  amount: string
  onAmountChange?: (value: string) => void
  asset?: SwapAsset
  balance: number
  onMax?: () => void
  onPick: () => void
  editable: boolean
}) {
  return (
    <div className="rounded-2xl bg-background p-4">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-muted-foreground">
          {formatQty(balance)} {asset?.symbol ?? '—'}{' '}
          {editable && onMax ? (
            <button
              type="button"
              onClick={onMax}
              className="font-semibold text-foreground"
            >
              MAX
            </button>
          ) : null}
        </span>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {editable ? (
          <input
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(event) => {
              onAmountChange?.(event.target.value)
            }}
            placeholder="0.0"
            className="w-full min-w-0 bg-transparent text-3xl font-semibold text-foreground outline-none placeholder:text-muted-foreground/50"
          />
        ) : (
          <p
            className={cn(
              'text-3xl font-semibold',
              amount ? 'text-foreground' : 'text-muted-foreground/50',
            )}
          >
            {amount || '0.0'}
          </p>
        )}
        <button
          type="button"
          onClick={onPick}
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-2.5 py-2 text-sm font-semibold text-foreground"
        >
          <TokenIcon
            symbol={asset?.symbol ?? '?'}
            src={asset?.icon}
            size="sm"
          />
          {asset?.symbol ?? 'Token'}
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </div>
    </div>
  )
}

function TokenPicker({
  assets,
  excludeMint,
  onSelect,
  onClose,
}: {
  assets: SwapAsset[]
  excludeMint: string
  onSelect: (asset: SwapAsset) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Close token picker"
        onClick={onClose}
      />
      <div className="relative z-10 flex max-h-[min(70vh,32rem)] w-full max-w-md flex-col rounded-t-2xl bg-card p-4 sm:rounded-2xl">
        <p className="mb-3 shrink-0 text-sm font-semibold text-foreground">
          Select token
        </p>
        <ul className="min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
          {assets
            .filter((asset) => asset.mint !== excludeMint)
            .map((asset) => (
              <li key={asset.mint}>
                <button
                  type="button"
                  onClick={() => {
                    onSelect(asset)
                  }}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-3 text-left hover:bg-secondary"
                >
                  <span className="flex items-center gap-2">
                    <TokenIcon
                      symbol={asset.symbol}
                      src={asset.icon}
                      size="md"
                    />
                    <span>
                      <span className="block text-sm font-semibold">
                        {asset.symbol}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">
                        $
                        {asset.priceUsd.toFixed(
                          asset.symbol === 'USDC' ? 2 : 2,
                        )}{' '}
                        live
                      </span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
        </ul>
      </div>
    </div>
  )
}
