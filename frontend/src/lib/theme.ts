export type Theme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'mera-theme'

/** Read preferred theme from storage, else system preference. */
export function getPreferredTheme(): Theme {
  if (typeof window === 'undefined') {
    return 'light'
  }
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    if (stored === 'light' || stored === 'dark') {
      return stored
    }
  } catch {
    // ignore
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Apply theme class on <html> and persist. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}
