import { useState } from 'react'
import { NavLink } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  Info,
  LineChart,
  MessageSquare,
  Moon,
  Send,
  Sun,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

import { useMeraAi } from '@/components/chat/MeraAiContext'
import { AboutModal } from '@/components/navigation/AboutModal'
import { useTheme } from '@/components/theme/ThemeProvider'
import { cn } from '@/lib/utils'

type NavItem =
  | {
      kind: 'link'
      to: string
      label: string
      icon: LucideIcon
    }
  | {
      kind: 'action'
      action: 'mera-ai'
      label: string
      icon: LucideIcon
    }

const SIDEBAR_SECTIONS: ReadonlyArray<{
  title: string
  items: readonly NavItem[]
}> = [
  {
    title: 'Trade',
    items: [
      { kind: 'link', to: '/swap', label: 'Swap', icon: ArrowLeftRight },
      { kind: 'link', to: '/market', label: 'Market', icon: LineChart },
    ],
  },
  {
    title: 'Portfolio',
    items: [
      { kind: 'link', to: '/portfolio', label: 'Holdings', icon: Wallet },
      { kind: 'link', to: '/deposit', label: 'Deposit', icon: ArrowDownToLine },
      { kind: 'link', to: '/send', label: 'Send', icon: Send },
    ],
  },
  {
    title: 'Autopilot',
    items: [
      {
        kind: 'action',
        action: 'mera-ai',
        label: 'AI Chat',
        icon: MessageSquare,
      },
    ],
  },
]

const navItemClass =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm font-medium transition-colors'

type SidebarNavProps = {
  onNavigate?: () => void
  className?: string
}

/**
 * Live routes only — desktop sidebar + mobile drawer.
 * AI Chat shows when the chat panel is closed.
 */
export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const { open, openChat } = useMeraAi()

  return (
    <nav className={cn('flex flex-col gap-6', className)}>
      {SIDEBAR_SECTIONS.map((section) => {
        const visibleItems = section.items.filter((item) => {
          if (item.kind === 'action' && item.action === 'mera-ai' && open) {
            return false
          }
          return true
        })
        if (visibleItems.length === 0) {
          return null
        }

        return (
          <div key={section.title}>
            <p className="mb-2 px-2.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
              {section.title}
            </p>
            <ul className="space-y-0.5">
              {visibleItems.map((item) => {
                const Icon = item.icon

                if (item.kind === 'action') {
                  return (
                    <li key={item.label}>
                      <button
                        type="button"
                        onClick={() => {
                          openChat()
                          onNavigate?.()
                        }}
                        className={cn(
                          navItemClass,
                          'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        {item.label}
                      </button>
                    </li>
                  )
                }

                return (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      onClick={onNavigate}
                      className={({ isActive }) =>
                        cn(
                          navItemClass,
                          isActive
                            ? 'bg-secondary text-foreground'
                            : 'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
                        )
                      }
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </nav>
  )
}

type SidebarUtilitiesProps = {
  onNavigate?: () => void
}

/** Theme toggle + About — footer utilities for sidebar / drawer. */
export function SidebarUtilities({ onNavigate }: SidebarUtilitiesProps) {
  const { theme, setTheme } = useTheme()
  const [aboutOpen, setAboutOpen] = useState(false)

  return (
    <div className="space-y-3">
      <p className="px-2.5 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
        Utilities
      </p>

      <div className="rounded-xl border border-border bg-card/60 p-1.5">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
          Appearance
        </p>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => setTheme('light')}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
              theme === 'light'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={theme === 'light'}
          >
            <Sun className="size-3.5" />
            Light
          </button>
          <button
            type="button"
            onClick={() => setTheme('dark')}
            className={cn(
              'flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors',
              theme === 'dark'
                ? 'bg-background text-foreground shadow-sm ring-1 ring-border'
                : 'text-muted-foreground hover:text-foreground',
            )}
            aria-pressed={theme === 'dark'}
          >
            <Moon className="size-3.5" />
            Dark
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          setAboutOpen(true)
          onNavigate?.()
        }}
        className={cn(
          navItemClass,
          'text-muted-foreground hover:bg-secondary/80 hover:text-foreground',
        )}
      >
        <Info className="size-4 shrink-0" />
        About
      </button>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2.5">
      <img
        src="/logo.png"
        alt="Mera"
        className="size-8 shrink-0 rounded-xl object-cover"
      />
      <div className="min-w-0 leading-tight">
        <span className="block text-[15px] font-semibold tracking-tight text-foreground">
          Mera
        </span>
        <span className="block text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
          Autopilot
        </span>
      </div>
    </div>
  )
}
