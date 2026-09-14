import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type OpenChatOptions = {
  /** Prefill the composer (e.g. Autopilot starter). */
  draft?: string
  /** Optional first-message hint shown as empty-state starter focus. */
  intent?: 'autopilot'
}

type MeraAiContextValue = {
  open: boolean
  draftPrefill: string | null
  intent: 'autopilot' | null
  openChat: (options?: OpenChatOptions) => void
  closeChat: () => void
  consumeDraftPrefill: () => string | null
}

const MeraAiContext = createContext<MeraAiContextValue | null>(null)

/**
 * Opens the Mera AI panel from anywhere (sidebar, Autopilot button, etc.).
 * Chat starts open as a layout column; closing expands the main area.
 * Reopen anytime via the sidebar "AI Chat" item.
 */
export function MeraAiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(true)
  const [draftPrefill, setDraftPrefill] = useState<string | null>(null)
  const [intent, setIntent] = useState<'autopilot' | null>(null)

  const openChat = useCallback((options?: OpenChatOptions) => {
    setDraftPrefill(options?.draft ?? null)
    setIntent(options?.intent ?? null)
    setOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setOpen(false)
    setIntent(null)
  }, [])

  const consumeDraftPrefill = useCallback(() => {
    const value = draftPrefill
    setDraftPrefill(null)
    return value
  }, [draftPrefill])

  const value = useMemo(
    () => ({
      open,
      draftPrefill,
      intent,
      openChat,
      closeChat,
      consumeDraftPrefill,
    }),
    [open, draftPrefill, intent, openChat, closeChat, consumeDraftPrefill],
  )

  return (
    <MeraAiContext.Provider value={value}>{children}</MeraAiContext.Provider>
  )
}

/** Hook for opening / closing the Mera AI panel */
// eslint-disable-next-line react-refresh/only-export-components -- paired with provider
export function useMeraAi() {
  const ctx = useContext(MeraAiContext)
  if (!ctx) {
    throw new Error('useMeraAi must be used within MeraAiProvider')
  }
  return ctx
}
