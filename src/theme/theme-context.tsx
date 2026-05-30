import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'theme'

type ThemeContextValue = { theme: Theme; toggle: () => void }

const ThemeContext = createContext<ThemeContextValue | null>(null)

// Reads the theme already applied to <html> by the pre-paint script (see __root.tsx),
// falling back to dark. Returns dark during SSR (no document) to match the server output.
function readInitialTheme(): Theme {
  if (typeof document === 'undefined') return 'dark'
  return document.documentElement.getAttribute('data-theme') === 'light'
    ? 'light'
    : 'dark'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(readInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(STORAGE_KEY, theme)
    } catch {
      // ignore storage failures (private mode, etc.)
    }
  }, [theme])

  const toggle = useCallback(
    () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')),
    [],
  )

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}

export function ThemeToggle() {
  const { theme, toggle } = useTheme()
  // Avoid an SSR/client label mismatch: show a neutral label until mounted.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const label = !mounted
    ? '🌓 Thème'
    : theme === 'dark'
      ? '☀️ Clair'
      : '🌙 Sombre'

  return (
    <button
      type="button"
      className="ghost theme-toggle"
      onClick={toggle}
      aria-label="Basculer le thème clair/sombre"
      title="Basculer le thème clair/sombre"
    >
      {label}
    </button>
  )
}
