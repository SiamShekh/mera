import { useState } from 'react'
import { Menu } from 'lucide-react'

import { MobileSidebarDrawer } from '@/components/navigation/MobileSidebarDrawer'
import { WalletConnectControl } from '@/components/wallet/WalletConnectControl'

/**
 * Mobile top bar: menu + logo + wallet.
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

          <img
            src="/logo.png"
            alt="Mera"
            className="size-8 shrink-0 rounded-xl object-cover"
          />

          <div className="min-w-0 flex-1" />

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
