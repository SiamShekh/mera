import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'

type AboutModalProps = {
  open: boolean
  onClose: () => void
}

/** Product overview for Mera. */
export function AboutModal({ open, onClose }: AboutModalProps) {
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

  if (!open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/40"
        aria-label="Close about"
        onClick={onClose}
      />

      <div
        className="relative flex max-h-[min(90vh,40rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
              On Solana
            </p>
            <h2
              id="about-title"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              About Mera
            </h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer rounded-xl"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="size-5" />
          </Button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 text-sm leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            Mera is a programmable portfolio on Solana. Describe a strategy in
            plain English, turn it into on-chain rules, and let Autopilot
            enforce them when market conditions match.
          </p>

          <section className="space-y-1.5">
            <h3 className="text-xs font-medium tracking-wide text-foreground uppercase">
              Trade &amp; hold
            </h3>
            <p>
              Swap spot markets, track tokenized stocks and cash, deposit into
              your wallet, and send assets to any Solana address — all from one
              workspace.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-medium tracking-wide text-foreground uppercase">
              Autopilot
            </h3>
            <p>
              Chat to set buys, sells, take-profit, and allocation guards. Confirm
              once to arm a rule; a keeper watches prices and executes when your
              conditions hit.
            </p>
          </section>

          <section className="space-y-1.5">
            <h3 className="text-xs font-medium tracking-wide text-foreground uppercase">
              On-chain vault
            </h3>
            <p>
              Your portfolio lives in a program-owned vault with up to eight
              packed rules — deposit, withdraw, pause, and enforce without
              handing over custody keys.
            </p>
          </section>
        </div>
      </div>
    </div>,
    document.body,
  )
}
