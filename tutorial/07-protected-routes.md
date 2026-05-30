# 7. Routes protégées, document racine & profil

On monte les providers dans le **document racine**, puis on protège un groupe de routes avec
**un seul** garde via un **layout pathless** TanStack Router.

## 7.1 `src/routes/__root.tsx` — document HTML + providers

```tsx
/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import {
  Outlet,
  createRootRoute,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { AuthProvider } from '../auth/auth-context'
import { ThemeProvider } from '../theme/theme-context'
import appCss from '../styles.css?url'

// Runs before paint to apply the saved theme on <html>, avoiding a flash of the wrong theme.
const themeScript = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Sinequa Login Demo' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <AuthProvider>
          <Outlet />
        </AuthProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // The pre-paint script mutates data-theme before hydration; that divergence is expected.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

(Le `themeScript` et `suppressHydrationWarning` sont expliqués au chapitre **Thème**.)

## 7.2 La structure des routes

```text
src/routes/
  __root.tsx          # document HTML + providers (public)
  login.tsx           # /login (public)
  _protected.tsx      # layout pathless : garde + barre de nav
  _protected/
    index.tsx         # /          accueil
    profile.tsx       # /profile   infos du principal
    search.tsx        # /search    recherche
```

> 💡 Un **layout pathless** (préfixe `_`) n'ajoute **pas** de segment d'URL : il enveloppe ses
> enfants d'un layout commun. Idéal pour mutualiser la garde d'authentification.

## 7.3 `src/routes/_protected.tsx` — la garde unique

```tsx
import { useEffect } from 'react'
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import { useAuth } from '../auth/auth-context'
import { ThemeToggle } from '../theme/theme-context'

export const Route = createFileRoute('/_protected')({
  component: ProtectedLayout,
})

// Single auth guard shared by every child route. The check is client-side because
// the session lives in the browser (sessionStorage), so it runs after bootstrap.
function ProtectedLayout() {
  const navigate = useNavigate()
  const { initializing, authenticated, principal, signOut } = useAuth()

  useEffect(() => {
    if (!initializing && !authenticated) void navigate({ to: '/login' })
  }, [initializing, authenticated, navigate])

  if (initializing) {
    return (
      <div className="center">
        <p className="subtitle">Vérification de la session…</p>
      </div>
    )
  }

  if (!authenticated) return null // redirecting to /login

  return (
    <div className="layout">
      <nav className="topbar">
        <div className="nav-links">
          <Link to="/" activeOptions={{ exact: true }} className="nav-link">
            Accueil
          </Link>
          <Link to="/profile" className="nav-link">
            Profil
          </Link>
          <Link to="/search" className="nav-link">
            Recherche
          </Link>
        </div>
        <div className="nav-right">
          <span className="nav-user">
            {principal?.fullName || principal?.name || ''}
          </span>
          <ThemeToggle />
          <button className="ghost" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
```

> ⚠️ **La garde est dans un `useEffect`, pas dans un `loader`.** Un `loader` TanStack
> s'exécute **côté serveur** (SSR), où `isAuthenticated()` n'a pas accès au `sessionStorage`.
> On garde donc côté client : pendant `initializing`, on affiche un écran d'attente ; ensuite,
> si non authentifié, on redirige vers `/login`.

## 7.4 Accueil — `src/routes/_protected/index.tsx`

```tsx
import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../../auth/auth-context'

export const Route = createFileRoute('/_protected/')({
  component: HomePage,
})

function HomePage() {
  const { principal } = useAuth()

  return (
    <div className="page">
      <span className="badge">✓ Authentifié</span>
      <h1>Bienvenue{principal?.fullName ? `, ${principal.fullName}` : ''}</h1>
      <p className="subtitle">Vous êtes connecté au backend Sinequa.</p>

      <div className="cards">
        <Link to="/profile" className="link-card">
          <h2>Profil</h2>
          <p>Voir les informations de votre compte (principal).</p>
        </Link>
        <Link to="/search" className="link-card">
          <h2>Recherche</h2>
          <p>Interroger l'index Sinequa.</p>
        </Link>
      </div>
    </div>
  )
}
```

> 💡 **Convention de nommage** : `createFileRoute('/_protected/')` pour l'index (le `/` final),
> `'/_protected/profile'`, `'/_protected/search'`. Le plugin TanStack régénère
> `routeTree.gen.ts` automatiquement au `dev`/`build`.

## 7.5 Profil — `src/routes/_protected/profile.tsx`

```tsx
import { Fragment } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../../auth/auth-context'

export const Route = createFileRoute('/_protected/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { principal } = useAuth()

  if (!principal) {
    return (
      <div className="page">
        <h1>Profil</h1>
        <p className="subtitle">Aucune information principal disponible.</p>
      </div>
    )
  }

  const fields: Array<[string, string]> = [
    ['Nom complet', principal.fullName],
    ['Nom', principal.name],
    ['Nom long', principal.longName],
    ['Identifiant (userId)', principal.userId],
    ['Id', principal.id],
    ['Email', principal.email],
    ['Administrateur', principal.isAdministrator ? 'Oui' : 'Non'],
    ['Admin délégué', principal.isDelegatedAdmin ? 'Oui' : 'Non'],
  ]

  return (
    <div className="page">
      <h1>Profil</h1>
      <p className="subtitle">Informations du compte (principal Sinequa).</p>

      <dl className="kv">
        {fields
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
      </dl>

      <details className="raw">
        <summary>Voir l'objet principal complet (JSON)</summary>
        <pre>{JSON.stringify(principal, null, 2)}</pre>
      </details>
    </div>
  )
}
```

Le principal vient du `useAuth()` (chargé par `fetchPrincipal()` au bootstrap). Chapitre
suivant : la **recherche** et sa **pagination**.
