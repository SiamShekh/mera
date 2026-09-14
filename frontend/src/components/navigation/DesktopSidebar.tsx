import { NavLink } from 'react-router-dom'

import {
  SidebarBrand,
  SidebarHelpButton,
  SidebarNav,
} from '@/components/navigation/sidebarNav'

/**
 * Desktop left sidebar. Fixed in the viewport; nav scrolls inside.
 * Hidden below lg.
 */
export function DesktopSidebar() {
  return (
    <aside className="hidden h-svh w-56 shrink-0 flex-col border-r border-border bg-background lg:flex">
      <div className="flex shrink-0 items-center gap-2 px-4 py-4">
        <NavLink to="/swap" className="cursor-pointer">
          <SidebarBrand />
        </NavLink>
      </div>

      <SidebarNav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" />

      <div className="shrink-0 border-t border-border px-3 py-3">
        <SidebarHelpButton />
      </div>
    </aside>
  )
}
