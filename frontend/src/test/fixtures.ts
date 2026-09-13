import type { Holding } from '@/types/holding'

/** Small fake holdings for unit tests (no blockchain / no RPC) */
export function makeHolding(
  partial: Partial<Holding> & Pick<Holding, 'asset' | 'mint' | 'value'>,
): Holding {
  return {
    quantity: partial.quantity ?? 1,
    price: partial.price ?? partial.value,
    valueInSol: partial.valueInSol ?? 0,
    allocation: partial.allocation ?? 0,
    icon: partial.icon ?? null,
    priceChange24h: partial.priceChange24h ?? null,
    ...partial,
  }
}
