import { Search } from 'lucide-react'

import { WalletConnectControl } from '@/components/wallet/WalletConnectControl'

/**
 * Desktop top header: search + wallet connect.
 */
export function DesktopTopBar() {
  return (
    <header className="hidden items-center gap-3 border-b border-border px-5 py-3 lg:flex">
      <label className="relative mx-auto w-full max-w-xl flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Search anything"
          className="h-10 w-full rounded-full border border-border bg-card pr-12 pl-10 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
        />
        <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          /
        </kbd>
      </label>

      <WalletConnectControl />
    </header>
  )
}
