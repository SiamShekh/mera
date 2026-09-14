import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react'

type MeraAiContextValue = {
  open: boolean
  openChat: () => void
  closeChat: () => void
}

const MeraAiContext = createContext<MeraAiContextValue | null>(null)

/**
 * Opens the Mera AI slide-over from anywhere (sidebar, buttons, etc.).
 */
export function MeraAiProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const openChat = useCallback(() => {
    setOpen(true)
  }, [])

  const closeChat = useCallback(() => {
    setOpen(false)
  }, [])

  const value = useMemo(
    () => ({ open, openChat, closeChat }),
    [open, openChat, closeChat],
  )

  return (
    <MeraAiContext.Provider value={value}>{children}</MeraAiContext.Provider>
  )
}

/** Hook for opening / closing the Mera AI drawer */
// eslint-disable-next-line react-refresh/only-export-components -- paired with provider
export function useMeraAi() {
  const ctx = useContext(MeraAiContext)
  if (!ctx) {
    throw new Error('useMeraAi must be used within MeraAiProvider')
  }
  return ctx
}
