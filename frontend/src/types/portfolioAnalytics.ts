import type { Holding } from '@/types/holding'

/** A frozen copy of the portfolio at one moment in time */
export type PortfolioSnapshot = {
  /** When this snapshot was saved (ISO string) */
  savedAt: string
  /** Wallet address this snapshot belongs to */
  owner: string
  totalValue: number
  totalValueInSol: number
  holdings: Holding[]
}

/** How one token changed between snapshot and now */
export type HoldingDiff = {
  mint: string
  asset: string
  quantityBefore: number
  quantityAfter: number
  quantityChange: number
  valueBefore: number
  valueAfter: number
  valueChange: number
  allocationBefore: number
  allocationAfter: number
}

/** Full comparison: snapshot → current holdings */
export type PortfolioDiff = {
  totalValueBefore: number
  totalValueAfter: number
  totalValueChange: number
  /** Percent change of total USD value (e.g. 10 = +10%) */
  totalValueChangePercent: number
  /** Tokens present in both snapshot and current */
  changed: HoldingDiff[]
  /** Tokens that appeared after the snapshot */
  added: Holding[]
  /** Tokens that disappeared after the snapshot */
  removed: Holding[]
}

/** Result of checking the biggest holding */
export type LargestPositionValidation = {
  holding: Holding | null
  allocation: number
  /** true when one asset is above the warning threshold */
  isConcentrated: boolean
  message: string
}

/** Warn when one asset is more than this % of the portfolio */
export const DEFAULT_CONCENTRATION_THRESHOLD = 50
