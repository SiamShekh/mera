import { Outlet } from 'react-router-dom'

import { MeraAiProvider } from '@/components/chat/MeraAiContext'
import { MeraChatDrawer } from '@/components/chat/MeraChatDrawer'
import { DesktopSidebar } from '@/components/navigation/DesktopSidebar'
import { DesktopTopBar } from '@/components/navigation/DesktopTopBar'
import { MobileBottomNav } from '@/components/navigation/MobileBottomNav'
import { MobileTopBar } from '@/components/navigation/MobileTopBar'
import { PriceTicker } from '@/components/navigation/PriceTicker'
import { RealtimeBridge } from '@/components/realtime/RealtimeBridge'
import { SyncUserOnConnect } from '@/components/wallet/SyncUserOnConnect'

/**
 * Responsive shell:
 * - Mobile: top bar + bottom nav; AI chat is a full-screen page when open
 * - Desktop: sidebar + main + AI chat as a layout column (open by default;
 *   closing expands main to full width; reopen via sidebar "AI Chat")
 */
export function AppLayout() {
  return (
    <MeraAiProvider>
      <div className="min-h-svh bg-background lg:flex lg:h-svh lg:overflow-hidden">
        <SyncUserOnConnect />
        <RealtimeBridge />
        <DesktopSidebar />

        <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:overflow-y-auto">
          <MobileTopBar />
          <DesktopTopBar />
          <div className="hidden lg:block">
            <PriceTicker />
          </div>

          <main className="mx-auto w-full max-w-lg flex-1 px-3 pt-3 pb-24 lg:mx-0 lg:max-w-none lg:px-5 lg:pt-4 lg:pb-6">
            <Outlet />
          </main>
        </div>

        <MobileBottomNav />
        <MeraChatDrawer />
      </div>
    </MeraAiProvider>
  )
}
