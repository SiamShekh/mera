import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

import {
  SidebarBrand,
  SidebarNav,
  SidebarUtilities,
} from '@/components/navigation/sidebarNav'
import { Button } from '@/components/ui/button'

type MobileSidebarDrawerProps = {
  open: boolean
  onClose: () => void
}

/**
 * Mobile hamburger drawer — same nav as the desktop sidebar.
 */
export function MobileSidebarDrawer({
  open,
  onClose,
}: MobileSidebarDrawerProps) {
  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose])

  useEffect(() => {
    if (!open) {
      return
    }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [open])

  if (!open) {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <button
        type="button"
        className="absolute inset-0 cursor-pointer bg-black/40"
        aria-label="Close menu"
        onClick={onClose}
      />

      <aside
        className="relative flex h-full w-[min(100%,18rem)] flex-col bg-background shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
      >
        <div className="flex shrink-0 items-center justify-between px-4 py-4">
          <SidebarBrand />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="cursor-pointer rounded-xl"
            onClick={onClose}
            aria-label="Close menu"
          >
            <X className="size-5" />
          </Button>
        </div>

        <SidebarNav
          onNavigate={onClose}
          className="min-h-0 flex-1 overflow-y-auto px-3 pb-4"
        />

        <div className="shrink-0 border-t border-border px-3 py-4">
          <SidebarUtilities onNavigate={onClose} />
        </div>
      </aside>
    </div>,
    document.body,
  )
}
