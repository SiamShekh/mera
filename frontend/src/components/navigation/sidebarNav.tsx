import { NavLink } from 'react-router-dom'
import {
  ArrowDownToLine,
  ArrowLeftRight,
  BookOpen,
  CircleHelp,
  Coins,
  LayoutGrid,
  LineChart,
  MessageSquare,
  PiggyBank,
  Send,
  Sparkles,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { useMeraAi } from '@/components/chat/MeraAiContext'
import { cn } from '@/lib/utils'

type NavItem =
  | {
      kind: 'link'
      to: string
      label: string
      icon: LucideIcon
      enabled: boolean
    }
  | {
      kind: 'action'
      action: 'mera-ai'
      label: string
      icon: LucideIcon
      enabled: boolean
    }

const SIDEBAR_SECTIONS: ReadonlyArray<{
  title: string
  items: readonly NavItem[]
}> = [
  {
    title: 'Trade',
    items: [
      {
        kind: 'link',
        to: '/swap',
        label: 'Spot',
        icon: ArrowLeftRight,
        enabled: true,
      },
      { kind: 'link', to: '#', label: 'Perps', icon: Zap, enabled: false },
      {
        kind: 'link',
        to: '#',
        label: 'Predict',
        icon: LineChart,
        enabled: false,
      },
      { kind: 'link', to: '#', label: 'Gacha', icon: Sparkles, enabled: false },
    ],
  },
  {
    title: 'Earn',
    items: [
      { kind: 'link', to: '#', label: 'Lend', icon: PiggyBank, enabled: false },
      {
        kind: 'link',
        to: '#',
        label: 'Offerbook',
        icon: BookOpen,
        enabled: false,
      },
      {
        kind: 'link',
        to: '#',
        label: 'Stake SOL',
        icon: Coins,
        enabled: false,
      },
      {
        kind: 'link',
        to: '#',
        label: 'Stake JUP',
        icon: Coins,
        enabled: false,
      },
    ],
  },
  {
    title: 'Manage',
    items: [
      {
        kind: 'link',
        to: '/portfolio',
        label: 'Portfolio',
        icon: Wallet,
        enabled: true,
      },
      {
        kind: 'action',
        action: 'mera-ai',
        label: 'AI Chat',
        icon: MessageSquare,
        enabled: true,
      },
      { kind: 'link', to: '/send', label: 'Send', icon: Send, enabled: true },
      {
        kind: 'link',
        to: '/deposit',
        label: 'Deposit',
        icon: ArrowDownToLine,
        enabled: true,
      },
      {
        kind: 'link',
        to: '#',
        label: 'More',
        icon: LayoutGrid,
        enabled: false,
      },
    ],
  },
]

type SidebarNavProps = {
  onNavigate?: () => void
  className?: string
}

/**
 * Shared Trade / Earn / Manage links for desktop sidebar + mobile drawer.
 * AI Chat appears only while the panel is closed (reopen entry).
 */
export function SidebarNav({ onNavigate, className }: SidebarNavProps) {
  const { open, openChat } = useMeraAi()

  return (
    <nav className={cn('flex flex-col gap-5', className)}>
      {SIDEBAR_SECTIONS.map((section) => (
        <div key={section.title}>
          <p className="mb-1.5 px-2 text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon
              if (!item.enabled) {
                return (
                  <li key={item.label}>
                    <span className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground/50">
                      <Icon className="size-4" />
                      {item.label}
                    </span>
                  </li>
                )
              }

              if (item.kind === 'action') {
                // Only show AI Chat when the panel is closed — reopen entry point.
                if (open) {
                  return null
                }
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={() => {
                        openChat()
                        onNavigate?.()
                      }}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/70 hover:text-foreground"
                    >
                      <Icon className="size-4" />
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
                        'flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                        isActive
                          ? 'bg-secondary text-foreground'
                          : 'text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                      )
                    }
                  >
                    <Icon className="size-4" />
                    {item.label}
                  </NavLink>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

export function SidebarHelpButton() {
  return (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2 py-2 text-sm text-muted-foreground hover:bg-secondary/70 hover:text-foreground"
    >
      <CircleHelp className="size-4" />
      Get Help
    </button>
  )
}

export function SidebarBrand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex size-8 items-center justify-center rounded-full bg-lime text-xs font-bold text-lime-foreground">
        P
      </div>
      <span className="text-sm font-semibold tracking-tight">Portfolio</span>
    </div>
  )
}
