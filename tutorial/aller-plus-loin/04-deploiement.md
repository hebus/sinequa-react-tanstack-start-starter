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
# Helper pour l'upgrade WebSocket (à placer dans le bloc http{})
map $http_upgrade $connection_upgrade {
  default upgrade;
  ''      close;
}

server {
  listen 443 ssl http2;
  server_name mon-app.example.com;

  # 1) Les appels Sinequa -> backend
  location ~ ^/(api|xdownload|endpoints|r|rest|auth/redirect|saml/redirect) {
    proxy_pass https://su-sba.demo.sinequa.com;
    proxy_set_header Host su-sba.demo.sinequa.com;   # équivalent de changeOrigin
    proxy_ssl_server_name on;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;

    # (a) Cookies de session : ré-attribuer le Domain du Set-Cookie à l'origine
    #     de l'app, sinon le navigateur jette le cookie et l'iframe charge en 401.
    proxy_cookie_domain su-sba.demo.sinequa.com mon-app.example.com;
    proxy_cookie_flags  ~ secure samesite=lax;

    # (b) Iframe preview : retirer les en-têtes anti-framing du backend, qui
    #     interdisent l'<iframe> MÊME en same-origin (voir 4.2.1).
    proxy_hide_header X-Frame-Options;
    proxy_hide_header Content-Security-Policy;
    add_header Content-Security-Policy "frame-ancestors 'self'" always;

    # (c) Streaming des gros documents cachés (pas de bufferisation).
    proxy_buffering off;
    proxy_request_buffering off;
    proxy_read_timeout 300s;

    # (d) WebSocket pour /endpoints
    proxy_http_version 1.1;
    proxy_set_header Upgrade    $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
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

### 4.2.1 Trois réglages indispensables pour l'iframe de preview

La preview de document (`documentCachedContentUrl` chargé dans une `<iframe>`) est servie via
ces mêmes préfixes. En same-origin, `preview.tsx` peut lire `contentDocument` pour le
surlignage et la navigation — mais **trois réglages du reverse proxy** conditionnent que ça
fonctionne en prod. Le proxy Vite les gère implicitement ; un reverse proxy, non.

- **(a) Cookies de session.** Le HTML de cache n'est servi qu'authentifié. Le `Set-Cookie`
  du backend porte le domaine Sinequa : sans `proxy_cookie_domain`, le navigateur le rejette
  (domaine non concordant) et l'iframe charge **non authentifiée → 401**. On réécrit donc le
  `Domain` vers l'origine de l'app. En same-origin, `SameSite=Lax` suffit.

- **(b) En-têtes anti-framing.** Le serveur Sinequa peut renvoyer `X-Frame-Options` ou un
  `Content-Security-Policy: frame-ancestors` qui **interdit le framing, même en same-origin**.
  Le navigateur refuse alors d'afficher l'iframe (page blanche, erreur console) — ni preview
  ni surlignage. On masque ces en-têtes (`proxy_hide_header`) et on ré-impose une politique
  maîtrisée `frame-ancestors 'self'`.

- **(c) Streaming.** Les documents cachés peuvent être volumineux. `proxy_buffering off`
  (+ `proxy_read_timeout` généreux) évite les timeouts et donne un rendu progressif au lieu
  d'attendre le corps complet.

> ⚠️ **URLs relatives dans le HTML de cache.** Le document peut référencer ses ressources
> (images, CSS) en relatif. En same-origin elles repartent sur votre origine sous un préfixe :
> il doit être proxifié. Si des ressources de la preview tombent en 404, ajoutez le préfixe
> manquant à la `location`, ou injectez une `<base href>` (ce qui implique de réécrire le
> corps de la réponse).

> ✅ **Vérification.** Ouvrez une preview : la console ne doit **pas** afficher
> « Aperçu cross-origin », `frameAccessible` reste `true` et les puces de catégories naviguent.
> En CLI : `curl -I https://mon-app.example.com/<chemin-preview>` doit renvoyer `200`, **sans**
> `X-Frame-Options`, avec un `Set-Cookie` sur `mon-app.example.com`.

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
