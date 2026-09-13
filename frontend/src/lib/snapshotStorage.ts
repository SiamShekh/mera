import type { PortfolioSnapshot } from '@/types/portfolioAnalytics'

const STORAGE_PREFIX = 'portfolio-snapshot:'

function storageKey(owner: string) {
  return `${STORAGE_PREFIX}${owner}`
}

/** Load a saved snapshot for this wallet (or null) */
export function loadSnapshot(owner: string): PortfolioSnapshot | null {
  try {
    const raw = localStorage.getItem(storageKey(owner))
    if (!raw) {
      return null
    }
    return JSON.parse(raw) as PortfolioSnapshot
  } catch {
    return null
  }
}

/** Save a snapshot for this wallet */
export function saveSnapshot(snapshot: PortfolioSnapshot): void {
  localStorage.setItem(storageKey(snapshot.owner), JSON.stringify(snapshot))
}

/** Delete the saved snapshot for this wallet */
export function clearSnapshot(owner: string): void {
  localStorage.removeItem(storageKey(owner))
}
