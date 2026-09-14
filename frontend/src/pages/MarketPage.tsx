import { MarketList } from '@/components/market/MarketList'
import { PriceTicker } from '@/components/navigation/PriceTicker'

/** Market — all tokenized stock prices from the mock oracle. */
export function MarketPage() {
  return (
    <div className="w-full space-y-4">
      <div className="lg:hidden">
        <PriceTicker className="mb-1 border-b-0 px-0" />
      </div>
      <MarketList />
    </div>
  )
}
