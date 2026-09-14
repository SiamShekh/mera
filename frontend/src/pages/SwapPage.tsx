import { PriceTicker } from '@/components/navigation/PriceTicker'
import { SwapForm } from '@/components/swap/SwapForm'

/**
 * Swap page — centered spot form (mobile ticker above).
 */
export function SwapPage() {
  return (
    <div className="flex w-full flex-1 flex-col">
      <div className="lg:hidden">
        <PriceTicker className="mb-3 border-b-0 px-0" />
      </div>

      <div className="flex flex-1 flex-col items-center justify-center py-4">
        <div className="mx-auto w-full max-w-md">
          <SwapForm />
        </div>
      </div>
    </div>
  )
}
