# 4. Déploiement (au-delà du proxy de dev)

En développement, tout passe par le **proxy Vite** (`vite.config.ts`). Mais ce proxy
**n'existe qu'en `vite dev`** : en production, il faut reproduire la même topologie
autrement. Ce chapitre décrit les options.

## 4.1 Rappel : comment la lib construit ses URLs

Les helpers de `@sinequa/atomic` font, pour chaque appel :

```ts
const url = backendUrl ? `${backendUrl}/${endpoint}` : endpoint
fetch(url, { credentials: 'include', /* … */ })
```

- `backendUrl` est rempli par `appInitializerFn()` avec `window.location.origin` s'il n'est
  pas défini.
- `credentials: 'include'` → le **cookie de session** est envoyé. En **same-origin**, c'est
  transparent ; en **cross-origin**, cela impose une configuration CORS stricte.

Deux stratégies de production en découlent.

## 4.2 Option A — Reverse proxy same-origin (recommandé)

Servez l'application **et** relayez les chemins Sinequa depuis **la même origine**
(ex. `https://mon-app.example.com`). On garde alors `backendUrl = window.location.origin`
(défaut) : aucun souci de CORS, le cookie est same-site.

Il faut reproduire, côté reverse proxy (nginx, Traefik, Apache…), **les mêmes préfixes** que
le proxy de dev. Exemple nginx :

```nginx
server {
  listen 443 ssl;
  server_name mon-app.example.com;

  # 1) Les appels Sinequa -> backend
  location ~ ^/(api|xdownload|endpoints|r|rest|auth/redirect|saml/redirect) {
    proxy_pass https://su-sba.demo.sinequa.com;
    proxy_set_header Host su-sba.demo.sinequa.com;   # équivalent de changeOrigin
    proxy_ssl_server_name on;
    proxy_set_header X-Forwarded-Proto $scheme;
    # WebSocket pour /endpoints :
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }

  # 2) L'application (serveur TanStack Start ou fichiers statiques)
  location / {
    proxy_pass http://127.0.0.1:3000;   # node .output/server/index.mjs
  }
}
```

> 💡 **Faites correspondre la liste des préfixes** à celle de `vite.config.ts`
> (`/api`, `/xdownload`, `/endpoints`, `/r`, `/rest`, `/auth/redirect`, `/saml/redirect`).
> Si vous en oubliez un (souvent `/auth/redirect`), le **retour OAuth** ou un téléchargement
> échouera silencieusement.

## 4.3 Option B — `backendUrl` direct + CORS

Pointer directement vers le serveur Sinequa :

```ts
setGlobalConfig({ backendUrl: 'https://su-sba.demo.sinequa.com' })
```

Les requêtes deviennent **cross-origin**. Le serveur Sinequa doit alors autoriser :

- `Access-Control-Allow-Origin: https://mon-app.example.com` (origine **exacte**, jamais `*`
  avec credentials) ;
- `Access-Control-Allow-Credentials: true` ;
- les en-têtes/méthodes utilisés (préflight `OPTIONS`).

Et le **cookie** de session devient cross-site → il doit être posé en `SameSite=None; Secure`
(donc **HTTPS obligatoire** des deux côtés).

> ⚠️ **Plus fragile** que l'option A : CORS + cookies cross-site sont une source classique de
> bugs (préflight, `SameSite`, 3rd-party cookies bloqués par certains navigateurs). Préférez
> le **reverse proxy same-origin** si possible.

## 4.4 OAuth/SAML en production : le `redirect_uri`

Comme en dev (`identity-dev` → `https://localhost:4200/auth/redirect`), le provider utilisé
en prod doit avoir un **`redirect_uri` enregistré pour l'origine de production**.

> ⚠️ Prévoyez un provider (ou une config) dont le `redirect_uri` pointe vers
> `https://mon-app.example.com/auth/redirect`, et pointez `VITE_SINEQUA_OAUTH_PROVIDER`
> dessus. Un `redirect_uri` qui ne correspond pas exactement = rejet côté IdP.

## 4.5 SSR TanStack Start & spécificités

- En prod, l'app est servie par un serveur Node (`node .output/server/index.mjs`). Le
  **proxy de dev disparaît** : c'est le **reverse proxy devant** qui relaie les chemins
  Sinequa (option A).
- L'**authentification reste côté client** (cf. tutoriel principal) : aucune logique d'auth
  ne doit s'exécuter pendant le rendu serveur.
- **HTTPS partout** : requis pour les cookies `Secure` et le flux OAuth.

## 4.6 Checklist de mise en production

> 💡 Avant de livrer :
> - [ ] Reverse proxy relayant **tous** les préfixes Sinequa (mêmes que `vite.config.ts`).
> - [ ] `backendUrl` cohérent : laissé par défaut (option A) **ou** défini + CORS (option B).
> - [ ] Provider OAuth/SAML avec `redirect_uri` = origine de prod.
> - [ ] `VITE_SINEQUA_APP` / `VITE_SINEQUA_OAUTH_PROVIDER` adaptés à l'environnement.
> - [ ] HTTPS de bout en bout.
> - [ ] Build vérifié (`npm run build`) + typecheck (`npm run typecheck`).
