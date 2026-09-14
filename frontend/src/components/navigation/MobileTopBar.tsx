import { useState } from 'react'
import { Menu, Search } from 'lucide-react'

import { MobileSidebarDrawer } from '@/components/navigation/MobileSidebarDrawer'
import { WalletConnectControl } from '@/components/wallet/WalletConnectControl'

/**
 * Mobile top bar: menu opens the sidebar drawer.
 * Hidden from lg breakpoint up (desktop uses sidebar + DesktopTopBar).
 */
export function MobileTopBar() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur lg:hidden">
        <div className="mx-auto flex w-full max-w-lg items-center gap-2 px-3 py-2.5">
          <button
            type="button"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-xl text-foreground"
            aria-label="Open menu"
            aria-expanded={menuOpen}
            onClick={() => {
              setMenuOpen(true)
            }}
          >
            <Menu className="size-5" />
          </button>

          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-lime text-xs font-bold text-lime-foreground">
            P
          </div>

          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search"
              className="h-9 w-full rounded-full border border-border bg-card pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
            />
          </label>

          <WalletConnectControl compact />
        </div>
      </header>

      <MobileSidebarDrawer
        open={menuOpen}
        onClose={() => {
          setMenuOpen(false)
        }}
      />
    </>
  )
}
