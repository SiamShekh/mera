import { NavLink } from 'react-router-dom'
import {
  ArrowLeftRight,
  CandlestickChart,
  Landmark,
  LineChart,
  Wallet,
} from 'lucide-react'

import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/swap', label: 'Spot', icon: ArrowLeftRight, enabled: true },
  { to: '#', label: 'Perps', icon: CandlestickChart, enabled: false },
  { to: '#', label: 'Lend', icon: Landmark, enabled: false },
  { to: '#', label: 'Predict', icon: LineChart, enabled: false },
  { to: '/portfolio', label: 'Portfolio', icon: Wallet, enabled: true },
] as const

/**
 * Fixed bottom nav (mobile Jupiter-style).
 * Only Spot + Portfolio are live routes for now.
 */
export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {ITEMS.map((item) => {
          const Icon = item.icon

          if (!item.enabled) {
            return (
              <span
                key={item.label}
                className="flex flex-col items-center gap-0.5 py-2 text-muted-foreground/50"
              >
                <Icon className="size-5" />
                <span className="text-[10px] font-medium">{item.label}</span>
              </span>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors',
                  isActive ? 'text-foreground' : 'text-muted-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn('size-5', isActive && 'text-foreground')}
                    strokeWidth={isActive ? 2.5 : 2}
                  />
                  <span>{item.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
