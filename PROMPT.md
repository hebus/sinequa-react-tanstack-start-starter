# Démo — Authentification Sinequa avec TanStack Start

Guide reproductible (humain ou IA) pour scaffolder une application **React / TanStack
Start** qui authentifie un utilisateur sur un backend **Sinequa** via la librairie
`@sinequa/atomic`, puis affiche un écran « authentifié ».

Trois méthodes d'authentification sont proposées :

- **Login / mot de passe** (JWT via `api/v1/security.webtoken`)
- **Bearer token**
- **SSO** via un provider **SAML** ou **OAuth**

---

## 0. Contexte & décisions d'architecture

Avant de coder, deux points structurants :

1. **L'auth Sinequa est 100 % navigateur** : elle s'appuie sur `sessionStorage`, des
   événements DOM (`'authenticated'`) et des redirections. TanStack Start fait du SSR ;
   on garde donc TanStack Start mais **toute la logique d'auth s'exécute côté client**
   (dans `useEffect` / handlers d'événements, jamais pendant le rendu serveur).

2. **On passe par un proxy Vite** pour atteindre le serveur de démo. Les helpers de la
   lib construisent leurs URLs ainsi : `url = ${backendUrl}/${endpoint}`. En laissant
   `backendUrl` se remplir automatiquement avec `window.location.origin`
   (`https://localhost:4200`), tous les appels partent en same-origin vers
   `/api/...` et le proxy Vite les relaie vers Sinequa → les cookies/CSRF fonctionnent.

3. **Le dev server tourne en HTTPS sur le port 4200** (voir §3.2). Ce n'est pas un détail
   esthétique : le provider OAuth de dev (`identity-dev`) est enregistré côté serveur avec
   `redirect_uri = https://localhost:4200/auth/redirect`. Le retour de redirection après
   login Keycloak ne boucle sur l'app que si l'origine correspond exactement.

Serveur de démo utilisé : `https://su-sba.demo.sinequa.com`.

---

## 1. Comprendre l'API d'authentification `@sinequa/atomic`

> Doc locale (si disponible) : `C:\dev\atomic\docs` et source `C:\dev\atomic\src`.
> Doc publique : <https://sinequa.github.io/sba-mint/atomic/features/configurations>
> (certaines pages renvoient 404 — préférer la source locale ou inspecter le package).

Fonctions clés (toutes exportées depuis `@sinequa/atomic`) :

| Fonction | Rôle |
|---|---|
| `setGlobalConfig(partial)` | Fusionne la config globale (`app`, `backendUrl`, `bearerToken`, `autoOAuthProvider`, `autoSAMLProvider`, `useCredentials`, `useSSO`, …). |
| `globalConfig` | Objet de config courant (lecture). |
| `appInitializerFn()` | À appeler au démarrage : détecte `backendUrl`/`app` depuis l'URL et récupère la config **pré-login** du serveur (dont les providers SSO). |
| `login(credentials?)` | Avec `{username, password}` → login JWT. Sans argument → tente SSO puis redirige vers OAuth/SAML si configuré. Émet l'événement `'authenticated'`. |
| `getJWToken()` | Sans argument : utilise `globalConfig.bearerToken` (header `Authorization: Bearer`) pour obtenir et stocker le token CSRF. |
| `getCsrfToken()` | Récupère le token CSRF du serveur **sans rediriger** ; le stocke. Sert à récupérer silencieusement une session existante / un retour de redirection SSO. |
| `isAuthenticated()` | `true` si un token CSRF est présent en `sessionStorage` (présence uniquement). |
| `fetchPrincipal()` | Renvoie l'utilisateur courant (`Principal`). |
| `logout()` | Vide les tokens, supprime le cookie côté serveur, renvoie l'URL de logout éventuelle. |
| `emitAuthenticatedEvent(bool)` | Émet l'événement `'authenticated'` (sur `window` via `dispatchEvent` global). |

**Flux retenu :**
- Au boot (client) : `setGlobalConfig({ app })` → `appInitializerFn()` → `getCsrfToken()`
  (silencieux) → `isAuthenticated()` → si OK, `fetchPrincipal()`.
- Login/mdp → `login({ username, password })`.
- Bearer → `setGlobalConfig({ bearerToken })` puis `getJWToken()` puis `emitAuthenticatedEvent(true)`.
- SSO → `login()` (redirige).
- On écoute l'événement `'authenticated'` (sur `window` **et** `document`) comme source
  de vérité de l'état.

> ⚠️ **Ne jamais appeler `login()` (sans args) automatiquement au boot** : s'il n'y a pas
> de session et qu'un provider est configuré, il **redirige** → boucle de redirection.
> On n'appelle `login()` que sur clic explicite « SSO ».

---

## 2. Prérequis

- **Node.js ≥ 20** (testé avec Node 24, npm 11).
- Accès npm au package `@sinequa/atomic` (propriétaire).

---

## 3. Étapes de scaffolding

### 3.1 `package.json`

> **Piège de versions** : `@tanstack/react-start` exige `vite >= 7`, et
> `@vitejs/plugin-react@6` exige `vite ^8`. Utiliser **vite 8 + plugin-react 6**.
> Un `vite@^6` provoque un `ERESOLVE`.

```json
{
  "name": "demo-login",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite dev",
    "build": "vite build",
    "start": "node .output/server/index.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@sinequa/atomic": "^1.1.0",
    "@tanstack/react-router": "^1.170.0",
    "@tanstack/react-start": "^1.168.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.10.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-basic-ssl": "^2.3.0",
    "@vitejs/plugin-react": "^6.0.0",
    "typescript": "^5.7.0",
    "vite": "^8.0.0"
  }
}
```

### 3.2 `vite.config.ts` — plugin TanStack Start + HTTPS + proxy Sinequa

> **HTTPS + port 4200 obligatoires** pour le SSO : le provider `identity-dev` a un
> `redirect_uri = https://localhost:4200/auth/redirect`. `@vitejs/plugin-basic-ssl`
> génère un certificat auto-signé (le navigateur affichera un avertissement à accepter
> une fois). Le proxy `/auth/redirect` (en `secure:false`) relaie le retour OAuth vers
> Sinequa qui échange le code, pose le cookie et renvoie vers l'app.

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const API_URL = 'https://su-sba.demo.sinequa.com'

const sinequaProxyTarget = { target: API_URL, secure: true, changeOrigin: true }

export default defineConfig({
  server: {
    port: 4200,
    host: true,
    proxy: {
      '/api': sinequaProxyTarget,
      '/xdownload': sinequaProxyTarget,
      '/endpoints': { ...sinequaProxyTarget, secure: false, ws: true },
      '/r': sinequaProxyTarget,
      '/rest': sinequaProxyTarget,
      '/auth/redirect': { ...sinequaProxyTarget, secure: false },
      '/saml/redirect': sinequaProxyTarget,
    },
  },
  plugins: [basicSsl(), tanstackStart(), viteReact()],
})
```

### 3.3 `tsconfig.json`

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "moduleResolution": "Bundler",
    "module": "ESNext",
    "target": "ES2022",
    "lib": ["DOM", "DOM.Iterable", "ES2022"],
    "types": ["vite/client", "node"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "verbatimModuleSyntax": true
  },
  "include": ["src", "vite.config.ts"]
}
```

### 3.4 `.gitignore`

```
node_modules
.output
.nitro
.tanstack
dist
*.local
src/routeTree.gen.ts
```

> `src/routeTree.gen.ts` est **généré automatiquement** par le plugin TanStack au
> premier `build`/`dev` — ne pas le versionner ni l'écrire à la main.

### 3.5 `.env` — nom de l'application Sinequa

```
# Propriété "app" (requise pour la détection des providers SSO via appInitializerFn
# et pour les requêtes). Le login/mot de passe fonctionne SANS.
VITE_SINEQUA_APP=mint_rnd

# Provider OAuth à utiliser, surchargeant celui auto-détecté par le serveur.
# En mode proxy/dev, le serveur détecte "identity" (redirect_uri -> serveur démo),
# mais seul le provider de dev "identity-dev" (redirect_uri -> https://localhost:4200)
# permet au retour de redirection de revenir sur l'app. Vide = provider auto-détecté.
VITE_SINEQUA_OAUTH_PROVIDER=identity-dev
```

> Pour cette démo : `VITE_SINEQUA_APP=mint_rnd`. Sa config pré-login renvoie
> `autoOAuthProvider: "identity"` (aucun SAML), mais on **surcharge** par `identity-dev`
> (le seul dont le `redirect_uri` pointe vers `https://localhost:4200`) → SSO OAuth/OIDC
> via le Keycloak ChapsVision. Adapter selon l'app et l'environnement ciblés.

---

## 4. Code source (dans `src/`)

### 4.1 `src/router.tsx`

```tsx
import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
  })
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
```

### 4.2 `src/styles.css`

Feuille de style libre (cartes centrées, onglets, formulaires). Voir le fichier du repo ;
non critique pour le fonctionnement.

### 4.3 `src/auth/auth-context.tsx` — provider d'auth (client-only)

Cœur de l'intégration. Points importants :
- **Bootstrap dans `useEffect`** (jamais pendant le SSR) : `setGlobalConfig({ app })` →
  `appInitializerFn()` → `getCsrfToken()` (silencieux) → `isAuthenticated()` →
  `fetchPrincipal()`. Chaque appel réseau est en `try/catch` pour ne pas bloquer le
  login/mdp si le pré-login échoue (ex. `app` non renseigné).
- **Écoute de l'événement `'authenticated'`** sur `window` *et* `document`.
- Expose `loginWithCredentials`, `loginWithBearer`, `loginWithSSO`, `signOut`,
  plus l'état `initializing / authenticated / principal / providers`.

```tsx
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef,
  useState, type ReactNode,
} from 'react'
import {
  appInitializerFn, emitAuthenticatedEvent, fetchPrincipal, getCsrfToken,
  getJWToken, globalConfig, isAuthenticated, login, logout, setGlobalConfig,
  type Principal,
} from '@sinequa/atomic'

type Providers = { oauth?: string; saml?: string }

type AuthContextValue = {
  initializing: boolean
  authenticated: boolean
  principal: Principal | null
  providers: Providers
  loginWithCredentials: (username: string, password: string) => Promise<boolean>
  loginWithBearer: (token: string) => Promise<boolean>
  loginWithSSO: (provider?: string, kind?: 'oauth' | 'saml') => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [providers, setProviders] = useState<Providers>({})

  const refreshPrincipal = useRef(async (isAuth: boolean) => {
    if (!isAuth) { setPrincipal(null); return }
    try { setPrincipal(await fetchPrincipal()) } catch { setPrincipal(null) }
  })

  // Bootstrap client-only.
  useEffect(() => {
    let cancelled = false
    async function bootstrap() {
      const app = import.meta.env.VITE_SINEQUA_APP
      if (app) setGlobalConfig({ app })
      // Forcer un provider OAuth avant init : appInitializerFn conserve un
      // autoOAuthProvider déjà défini au lieu de celui du serveur.
      const oauthProvider = import.meta.env.VITE_SINEQUA_OAUTH_PROVIDER
      if (oauthProvider) setGlobalConfig({ autoOAuthProvider: oauthProvider })
      try { await appInitializerFn() } catch { /* pré-login optionnel */ }
      try { await getCsrfToken() } catch { /* pas de session ambiante */ }
      if (cancelled) return
      setProviders({
        oauth: globalConfig.autoOAuthProvider || undefined,
        saml: globalConfig.autoSAMLProvider || undefined,
      })
      const authed = isAuthenticated()
      setAuthenticated(authed)
      await refreshPrincipal.current(authed)
      setInitializing(false)
    }
    void bootstrap()
    return () => { cancelled = true }
  }, [])

  // La lib émet 'authenticated' sur window ; on écoute aussi document par sécurité.
  useEffect(() => {
    const onAuthenticated = (event: Event) => {
      const authed = (event as CustomEvent<{ authenticated: boolean }>).detail.authenticated
      setAuthenticated(authed)
      void refreshPrincipal.current(authed)
    }
    window.addEventListener('authenticated', onAuthenticated)
    document.addEventListener('authenticated', onAuthenticated)
    return () => {
      window.removeEventListener('authenticated', onAuthenticated)
      document.removeEventListener('authenticated', onAuthenticated)
    }
  }, [])

  const loginWithCredentials = useCallback(
    (username: string, password: string) => login({ username, password }), [])

  const loginWithBearer = useCallback(async (token: string) => {
    setGlobalConfig({ bearerToken: token })
    await getJWToken()              // stocke le token CSRF, throw si échec
    emitAuthenticatedEvent(true)
    return true
  }, [])

  // Surcharge optionnelle du provider (ex. "identity" -> "identity-dev") avant la redirection.
  const loginWithSSO = useCallback(
    (provider?: string, kind: 'oauth' | 'saml' = 'oauth') => {
      if (provider) {
        setGlobalConfig(
          kind === 'saml'
            ? { autoSAMLProvider: provider, useSAML: true }
            : { autoOAuthProvider: provider },
        )
      }
      return login()
    }, [])

  const signOut = useCallback(async () => {
    const redirectUrl = await logout()
    if (redirectUrl) window.location.href = redirectUrl
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    initializing, authenticated, principal, providers,
    loginWithCredentials, loginWithBearer, loginWithSSO, signOut,
  }), [initializing, authenticated, principal, providers,
       loginWithCredentials, loginWithBearer, loginWithSSO, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
```

### 4.4 `src/routes/__root.tsx` — document HTML + AuthProvider

```tsx
/// <reference types="vite/client" />
import type { ReactNode } from 'react'
import { Outlet, createRootRoute, HeadContent, Scripts } from '@tanstack/react-router'
import { AuthProvider } from '../auth/auth-context'
import appCss from '../styles.css?url'

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
      <AuthProvider>
        <Outlet />
      </AuthProvider>
    </RootDocument>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  )
}
```

### 4.5 `src/routes/login.tsx` — écran de connexion (3 méthodes)

Onglets **Login/mdp · Bearer · SSO**, branchés sur `useAuth()`. Redirige vers `/` dès que
`authenticated` passe à `true`. Affiche les erreurs et l'état `busy`. Pour le SSO, un
**champ éditable « Provider »** est pré-rempli avec le provider effectif
(`VITE_SINEQUA_OAUTH_PROVIDER` ou celui détecté) **et reste modifiable** : la valeur saisie
est passée à `loginWithSSO(provider, kind)` qui la pousse dans `setGlobalConfig` avant la
redirection. Un indice signale quand on surcharge la valeur détectée.
(Voir le fichier du repo pour le JSX complet.)

### 4.6 Routes protégées — layout pathless + garde unique

Plutôt que de répéter la garde dans chaque page, on utilise un **layout pathless**
TanStack Router (`_protected`) qui porte la garde une seule fois + une nav partagée.
Toutes ses routes enfants sont automatiquement protégées.

```
src/routes/
  __root.tsx              # document HTML + AuthProvider (public)
  login.tsx               # /login (public)
  _protected.tsx          # layout pathless : garde + barre de nav (Accueil/Profil/Recherche/Déconnexion)
  _protected/
    index.tsx             # /          accueil (liens vers les pages)
    profile.tsx           # /profile   infos du principal (useAuth().principal)
    search.tsx            # /search    recherche Sinequa
```

`_protected.tsx` (cœur de la garde) :

```tsx
export const Route = createFileRoute('/_protected')({ component: ProtectedLayout })

function ProtectedLayout() {
  const navigate = useNavigate()
  const { initializing, authenticated, principal, signOut } = useAuth()

  useEffect(() => {
    if (!initializing && !authenticated) void navigate({ to: '/login' })
  }, [initializing, authenticated, navigate])

  if (initializing) return <div className="center"><p className="subtitle">Vérification…</p></div>
  if (!authenticated) return null // redirection vers /login

  return (
    <div className="layout">
      <nav className="topbar">{/* Link vers /, /profile, /search + bouton signOut */}</nav>
      <main className="content"><Outlet /></main>
    </div>
  )
}
```

- **`/profile`** lit `useAuth().principal` et affiche ses champs (+ dump JSON brut).
- **`/search`** découvre le nom du web service de query via **`fetchApp()`**
  (`CCApp.defaultQueryName`, sinon première clé de `CCApp.queries`), puis appelle
  `fetchQuery({ name, text, page, pageSize })` et rend `result.records` (titre → preview,
  `relevantExtracts` en HTML surligné, `treepath`). Un `<select>` apparaît si plusieurs queries.
  **Pagination** : un `<select>` « N / page » (10/20/50/100) pilote `pageSize` (relance en
  page 1 à chaque changement) ; les contrôles Précédent/Suivant sont calculés **depuis la
  réponse** — `result.page`, `result.pageSize`, `result.rowCount`
  (`totalPages = ceil(rowCount / pageSize)`), ce qui reste correct même si le serveur borne la
  taille demandée. La pagination réinterroge en conservant le **texte recherché**
  (`searchedText`, distinct de la saisie en cours), et une nouvelle recherche repart en page 1.
  - **Facettes, agrégations, tri, onglets, scopes et facettes arbre** sont aussi câblés dans
    `/search` (filtrage via `query.filters`, « Voir plus » en `action: 'aggregate'`, arbres en
    `action: 'open'`). C'est détaillé dans **Aller plus loin → chapitre 2**
    (`tutorial/aller-plus-loin/`).

> La **garde se fait dans `useEffect`** (côté client), pas dans un `loader` (qui
> s'exécuterait côté serveur, où `isAuthenticated()` n'a pas accès au `sessionStorage`).
> Convention de nommage : `createFileRoute('/_protected/')` pour l'index, `'/_protected/profile'`, etc.

### 4.7 Thème clair/sombre — `src/theme/theme-context.tsx`

Thème piloté par variables CSS sur `<html data-theme>`. Dans `styles.css`, `:root` définit
la palette **sombre** (défaut) et `:root[data-theme='light']` surcharge avec la palette
**claire** ; les composants n'utilisent que des `var(--…)` (dont `--inset` pour les fonds
de champs). Un `ThemeProvider` (dans `__root.tsx`) gère l'état + la persistance
`localStorage`, et un composant `ThemeToggle` est placé dans la nav (pages protégées) et
sur l'écran de login.

Anti-flash : un petit script **synchrone** injecté dans le `<head>` applique le thème
sauvegardé **avant le paint** :

```tsx
const themeScript = `(function(){try{var t=localStorage.getItem('theme');document.documentElement.setAttribute('data-theme',t==='light'?'light':'dark')}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`
// ... dans <head> :
<script dangerouslySetInnerHTML={{ __html: themeScript }} />
```

> `ThemeProvider` initialise son état depuis l'attribut déjà posé par ce script
> (`readInitialTheme`), et `ThemeToggle` affiche un libellé neutre jusqu'au montage pour
> éviter tout mismatch d'hydratation SSR/client. Le `<html>` porte `suppressHydrationWarning`
> car le script modifie `data-theme` avant l'hydratation (divergence attendue).

### 4.8 Preview d'un document — Sheet + iframe

Clic sur un résultat → ouverture d'un panneau latéral (« sheet ») qui glisse de droite à
gauche et affiche la preview HTML du document.

- **`src/components/sheet.tsx`** : panneau générique, toujours monté (pour jouer
  l'animation de fermeture), `pointer-events:none` quand fermé ; `transform: translateX(100%)`
  → `0` à l'ouverture ; overlay ; fermeture sur Échap et clic sur l'overlay.
- **`/search`** : au clic sur un titre, on appelle
  `fetchPreview(record.id, { name: queryName, text })` → `PreviewData`, puis on charge
  `preview.documentCachedContentUrl` dans une **`<iframe>`** à l'intérieur du sheet.
- **Métadonnées** : un panneau `DocMeta` (au-dessus de l'iframe) affiche les champs de
  l'`Article` présents — auteurs, dates modifié/indexé, taille, format, type, langue(s),
  version, collection, index, chemin. Source : `preview.record` (repli sur le record de
  recherche). Dates via `toLocaleString('fr-FR')`, taille via un helper `formatBytes`.
  Le panneau est **repliable** via un `<details>/<summary>` natif, **animé en douceur** avec
  `::details-content` + `interpolate-size: allow-keywords` (anime jusqu'à une hauteur `auto`),
  + chevron `summary::before` qui pivote. Dégrade en toggle instantané si non supporté.

```tsx
async function openPreview(record: Article) {
  setSelected(record); setPreview(null); setPreviewError(null); setPreviewBusy(true)
  try { setPreview(await fetchPreview(record.id, { name: queryName, text })) }
  catch (err) { setPreviewError(/* … */) }
  finally { setPreviewBusy(false) }
}
// …
<Sheet open={selected !== null} onClose={() => setSelected(null)} title={selected?.title}>
  {preview && <iframe className="preview-frame" src={preview.documentCachedContentUrl} title="Aperçu" />}
</Sheet>
```

> **Pourquoi l'iframe marche en mode proxy** : `documentCachedContentUrl` est servi en
> same-origin (`https://localhost:4200/...` via le proxy), donc le cookie de session part
> avec la requête de l'iframe. Alternative : `fetchPreviewUrl()` pour récupérer le HTML et
> l'injecter — mais l'iframe isole le contenu (styles/scripts du document) et est l'approche
> recommandée par la doc.

---

## 5. Installation, build, vérification

```powershell
npm install        # installe les dépendances
npm run build      # build client + SSR ; génère src/routeTree.gen.ts
npm run typecheck  # tsc strict (le build Vite ne typecheck pas)
npm run dev        # https://localhost:4200 (certificat auto-signé à accepter)
```

**Vérifications attendues** (commandes PowerShell : `-SkipCertificateCheck` pour le cert auto-signé) :

1. `npm run build` → builds *client* et *ssr* OK.
2. `npm run typecheck` → aucune erreur.
3. `GET https://localhost:4200/login` → HTTP 200, contient les 3 onglets.
4. Test du proxy → backend Sinequa :
   ```powershell
   Invoke-WebRequest "https://localhost:4200/api/v1/challenge?action=getCsrfToken&suppressErrors=true" -SkipCertificateCheck
   # Réponse attendue : {"error":"web token cookie does not exist","methodresult":"ok"}
   # => le proxy atteint bien Sinequa et getCsrfToken() renverra null proprement.
   ```
5. Flux SSO OAuth avec `identity-dev` — vérifié de bout en bout :
   ```powershell
   $body = @{ action='getcode'; provider='identity-dev'; tokenInCookie=$true; originalUrl='https://localhost:4200/login' } | ConvertTo-Json
   $r = Invoke-WebRequest "https://localhost:4200/api/v1/security.oauth" -Method POST -ContentType 'application/json' -Body $body -SkipCertificateCheck -MaximumRedirection 0 -SkipHttpErrorCheck
   [string]($r.Headers['Location'] | Select-Object -First 1)
   # Attendu : 302 vers https://login.coe.chapsvision.com/realms/ChapsVision/protocol/openid-connect/auth
   #           avec redirect_uri=https://localhost:4200/auth/redirect (et NON le serveur démo).
   ```
   Dans le navigateur : onglet SSO → champ pré-rempli `identity-dev` → bouton
   « Se connecter via identity-dev » → redirection vers Keycloak (OIDC + PKCE, client
   `su-sba`), puis retour sur `https://localhost:4200/auth/redirect` qui clôt la session.

---

## 6. État de validation & point ouvert

Validé avec `VITE_SINEQUA_APP=mint_rnd` et `VITE_SINEQUA_OAUTH_PROVIDER=identity-dev`
(app servie sur `https://localhost:4200`) :

- ✅ Build (client + SSR), typecheck strict, rendu `/login`, proxy → Sinequa.
- ✅ Bootstrap client : provider OAuth forcé à `identity-dev` (conservé par `appInitializerFn`).
- ✅ **SSO de bout en bout** (test navigateur Playwright) : champ pré-rempli `identity-dev`,
  clic → redirection vers Keycloak ChapsVision avec `redirect_uri=https://localhost:4200/auth/redirect`.
  Seule la saisie du mot de passe Keycloak reste **interactive** (non automatisable sans identifiants).
- ✅ **Routes protégées** (test Playwright) : `/`, `/profile` et `/search` redirigent vers
  `/login` sans session. `/profile` et `/search` (contenu authentifié) se vérifient après
  login Keycloak interactif. Playwright reste installé en devDependency pour ces tests e2e.
- ✅ **Thème clair/sombre** (test Playwright) : bascule via le switch, persistance
  `localStorage`, restauration après reload sans flash (script pré-paint), aucun warning
  d'hydratation ni erreur console.
- ✅ **Preview** : build + typecheck ; sheet et `fetchPreview` câblés. Le flux complet
  (clic → `fetchPreview` → iframe) se vérifie après login interactif (route protégée +
  document réel requis).

Points ouverts :

- **Login/mot de passe** : `mint_rnd` ne l'annonce pas en pré-login (seul l'OAuth).
  L'endpoint `security.webtoken` peut néanmoins l'accepter selon la config serveur —
  à confirmer avec un compte de test. L'onglet et le câblage sont prêts.
- **Bearer token** : câblé (`setGlobalConfig` + `getJWToken()`), non testé faute de token valide.
- ⚠️ `identity` (auto-détecté) a un `redirect_uri` vers le serveur démo → inutilisable en
  proxy local ; c'est `identity-dev` qu'il faut en dev. Sur un autre environnement, adapter
  `VITE_SINEQUA_OAUTH_PROVIDER` et le port/host HTTPS au `redirect_uri` enregistré.

---

## Annexe — prompt d'origine

> Créer une application React en utilisant la stack TanStack Start, qui propose d'abord un
> système d'authentification vers un backend Sinequa (Bearer token, login/mot de passe, ou
> provider SAML/OAuth) via `@sinequa/atomic`. Première étape : écran d'authentification ;
> une fois authentifié, afficher un écran confirmant l'authentification.
