import { PriceTicker } from '@/components/navigation/PriceTicker'
import { SwapForm } from '@/components/swap/SwapForm'

/**
 * Swap page — just the swap form (mobile ticker + centered form on desktop).
 */
export function SwapPage() {
  return (
    <div className="w-full">
      <div className="lg:hidden">
        <PriceTicker className="mb-3 border-b-0 px-0" />
      </div>

      <div className="mx-auto w-full max-w-md lg:pt-2">
        <SwapForm />
      </div>
    </div>
  )
}
