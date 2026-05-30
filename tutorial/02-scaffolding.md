# 2. Mise en place du projet (scaffolding)

On crée un projet **TanStack Start** minimal, puis on y ajoute `@sinequa/atomic`, le proxy
vers Sinequa et le HTTPS de développement.

## 2.1 `package.json`

> ⚠️ **Piège de versions (vécu).** `@tanstack/react-start` exige `vite >= 7`, et
> `@vitejs/plugin-react@6` exige `vite ^8`. Un `vite@^6` provoque un échec `ERESOLVE` à
> l'installation. La combinaison qui fonctionne : **vite 8 + @vitejs/plugin-react 6**.

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

`@vitejs/plugin-basic-ssl` sert au HTTPS de dev (voir §2.2). Installez :

```bash
npm install
```

## 2.2 `vite.config.ts` — TanStack Start + HTTPS + proxy

```ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const API_URL = 'https://su-sba.demo.sinequa.com'

const sinequaProxyTarget = { target: API_URL, secure: true, changeOrigin: true }

// HTTPS + port 4200 sont obligatoires pour le SSO : le provider "identity-dev" a un
// redirect_uri = https://localhost:4200/auth/redirect (voir le chapitre SSO).
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

Points clés :

- **`basicSsl()`** génère un certificat auto-signé → le serveur tourne en `https://`. Le
  navigateur affichera **un avertissement à accepter une fois**.
- Le proxy couvre tous les préfixes Sinequa utiles. `'/auth/redirect'` est en `secure:false`
  (et relaie le **retour OAuth**) ; `'/endpoints'` active le `ws` (websockets).
- **Port 4200** : imposé par le `redirect_uri` du provider de dev (chapitre SSO).

## 2.3 `tsconfig.json`

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

> 💡 `"types": ["vite/client"]` est nécessaire pour typer `import.meta.env.*` (variables
> `VITE_…`) et les imports `?url` (ex. `import css from './styles.css?url'`).

## 2.4 `.gitignore`

```
node_modules
.output
.nitro
.tanstack
dist
*.local
src/routeTree.gen.ts
```

> ⚠️ **`src/routeTree.gen.ts` est généré automatiquement** par le plugin TanStack au premier
> `dev`/`build`. Ne le versionnez pas et ne l'écrivez pas à la main.

## 2.5 `.env` — configuration Sinequa

```bash
# Nom de l'application Sinequa (propriété "app"). Requise pour la détection des
# providers SSO (appInitializerFn) et pour les requêtes. Le login/mot de passe marche SANS.
VITE_SINEQUA_APP=mint_rnd

# Provider OAuth à utiliser, surchargeant celui auto-détecté par le serveur.
# En proxy/dev, le serveur détecte "identity" (redirect_uri -> serveur démo), mais seul
# le provider de dev "identity-dev" (redirect_uri -> https://localhost:4200) referme la boucle.
VITE_SINEQUA_OAUTH_PROVIDER=identity-dev
```

> 💡 Les variables exposées au navigateur **doivent** être préfixées par `VITE_` (règle Vite).

## 2.6 `src/router.tsx`

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

À ce stade le squelette compile. Lancez :

```bash
npm run dev      # https://localhost:4200
npm run build    # build client + SSR ; génère src/routeTree.gen.ts
npm run typecheck
```

Au chapitre suivant, on étudie l'API d'authentification de `@sinequa/atomic` avant de l'utiliser.
