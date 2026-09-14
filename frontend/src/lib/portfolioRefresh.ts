/** Broadcast so Spot / portfolio UIs refetch after Autopilot fills. */
export const PORTFOLIO_REFRESH_EVENT = 'mera:portfolio-refresh'

export function requestPortfolioRefresh() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(PORTFOLIO_REFRESH_EVENT))
}
