import { NavLink } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  LineChart,
  Send,
  Wallet,
} from 'lucide-react'

import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/swap', label: 'Swap', icon: ArrowLeftRight },
  { to: '/market', label: 'Market', icon: LineChart },
  { to: '/portfolio', label: 'Holdings', icon: Wallet },
  { to: '/deposit', label: 'Deposit', icon: ArrowDownToLine },
  { to: '/send', label: 'Send', icon: Send },
] as const

/**
 * Fixed bottom nav (mobile). Live routes only.
 */
export function MobileBottomNav() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur lg:hidden">
      <div className="mx-auto grid max-w-lg grid-cols-5 px-1 pt-1 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        {ITEMS.map((item) => {
          const Icon = item.icon

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
