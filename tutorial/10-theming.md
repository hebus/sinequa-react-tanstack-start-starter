# 10. Thème clair / sombre

Le thème est piloté par des **variables CSS** sur `<html data-theme>`, avec persistance
`localStorage`, un **toggle** et un **script anti-flash**.

## 10.1 Palette par variables CSS

Dans `styles.css`, `:root` définit la palette **sombre** (défaut) et
`:root[data-theme='light']` la surcharge :

```css
/* Default theme = dark */
:root {
  interpolate-size: allow-keywords;
  --bg: #0f172a;
  --panel: #1e293b;
  --inset: #0f172a;   /* fonds de champs / zones en creux */
  --border: #334155;
  --text: #e2e8f0;
  --muted: #94a3b8;
  --accent: #6366f1;
  --accent-hover: #4f46e5;
  --error: #f87171;
  --ok: #34d399;
}

:root[data-theme='light'] {
  --bg: #f8fafc;
  --panel: #ffffff;
  --inset: #f1f5f9;
  --border: #e2e8f0;
  --text: #0f172a;
  --muted: #64748b;
  --accent: #4f46e5;
  --accent-hover: #4338ca;
  --error: #dc2626;
  --ok: #059669;
}
```

> ⚠️ **N'utilisez que des `var(--…)`** dans tout le CSS (jamais de couleur en dur), sinon le
> switch n'agira pas partout. C'est pourquoi on a introduit `--inset` pour les fonds de champs
> (inputs, onglets, select) qui étaient codés en dur au départ.

## 10.2 `src/theme/theme-context.tsx`

```tsx
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
```

## 10.3 Le script anti-flash (rappel `__root.tsx`)

```tsx
const themeScript = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`
// …injecté dans <head> :
<script dangerouslySetInnerHTML={{ __html: themeScript }} />
```

Ce script **synchrone** s'exécute **avant le premier paint** : il lit le thème sauvegardé et
pose `data-theme` sur `<html>`. Sans lui, un utilisateur en thème clair verrait un **flash**
sombre au rechargement (le temps que React s'hydrate).

## 10.4 Pièges : hydratation SSR/client

Deux divergences SSR↔client à neutraliser :

> ⚠️ **L'attribut `data-theme` sur `<html>`.** Le script le modifie **avant** l'hydratation,
> alors que le HTML rendu par le serveur ne l'avait pas → React signale un mismatch. On ajoute
> donc **`suppressHydrationWarning`** sur `<html>` (divergence intentionnelle).

> ⚠️ **Le libellé du bouton.** Au SSR, le thème vaut `dark` ; côté client, il peut valoir
> `light`. Pour éviter un mismatch de texte, `ThemeToggle` affiche un libellé **neutre**
> (`🌓 Thème`) jusqu'au montage (`mounted`), puis le libellé réel. Au SSR et au premier rendu
> client, le texte est identique → pas de warning.

> 💡 `readInitialTheme()` lit l'attribut déjà posé par le script → l'état React est d'emblée
> cohérent avec l'affichage (pas de second flash après hydratation).

Le toggle est placé dans la barre de nav des pages protégées **et** sur l'écran de login.
Dernier chapitre : récapitulatif, vérifications, et l'annexe CSS complète.
