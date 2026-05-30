# 3. L'API d'authentification `@sinequa/atomic`

Avant d'écrire du code, comprenons les fonctions exposées par la librairie et le **cycle
d'authentification**. Tout est importé depuis `@sinequa/atomic`.

## 3.1 Les fonctions clés

| Fonction | Rôle |
|---|---|
| `setGlobalConfig(partial)` | Fusionne la config globale (`app`, `backendUrl`, `bearerToken`, `autoOAuthProvider`, `autoSAMLProvider`, `useCredentials`, `useSSO`, `useSAML`…). |
| `globalConfig` | L'objet de configuration courant (lecture). |
| `appInitializerFn()` | À appeler **au démarrage** : détecte `backendUrl`/`app` depuis l'URL et récupère la config **pré-login** du serveur (dont les providers SSO). |
| `login(credentials?)` | Avec `{ username, password }` → login JWT. **Sans argument** → tente SSO puis redirige vers OAuth/SAML si configuré. Émet l'événement `'authenticated'`. |
| `getJWToken()` | Sans argument : utilise `globalConfig.bearerToken` (header `Authorization: Bearer`) pour obtenir et stocker le token CSRF. |
| `getCsrfToken()` | Récupère le token CSRF du serveur **sans rediriger** ; le stocke. Sert à récupérer **silencieusement** une session existante / un retour de redirection SSO. |
| `isAuthenticated()` | `true` si un token CSRF est présent dans le `sessionStorage` (présence **uniquement**). |
| `fetchPrincipal()` | Renvoie l'utilisateur courant (objet `Principal`). |
| `logout()` | Vide les tokens, supprime le cookie côté serveur, renvoie l'éventuelle URL de logout. |
| `emitAuthenticatedEvent(bool)` | Émet l'événement `'authenticated'` (sur `window`, via le `dispatchEvent` global). |

Et pour la suite de l'app : `fetchApp()` (config `CCApp`), `fetchQuery()` (recherche),
`fetchPreview()` (aperçu document).

## 3.2 Le cycle d'authentification

```text
login(credentials)        ── avec { username, password } ─▶  getJWToken(credentials)  ─▶  token CSRF stocké
login()  (sans argument)  ── getCsrfToken() ──┬─ token présent ─▶  authentifié
                                              └─ pas de token ─┬─ OAuth configuré ─▶ tryOAuthAuthentication() (redirige)
                                                               └─ SAML configuré ─▶ trySAMLAuthentication() (redirige)
```

À la fin, `login()` **émet** l'événement `'authenticated'` avec `{ detail: { authenticated: boolean } }`.

## 3.3 Le flux que nous allons implémenter

- **Au démarrage (client)** :
  `setGlobalConfig({ app })` → (option) forcer `autoOAuthProvider` → `appInitializerFn()`
  → `getCsrfToken()` (silencieux) → `isAuthenticated()` → si OK, `fetchPrincipal()`.
- **Login / mot de passe** → `login({ username, password })`.
- **Bearer** → `setGlobalConfig({ bearerToken })` puis `getJWToken()` puis `emitAuthenticatedEvent(true)`.
- **SSO** → `login()` (redirige vers le provider).
- On **écoute** l'événement `'authenticated'` comme **source de vérité** de l'état.

## 3.4 Pièges importants

> ⚠️ **Ne jamais appeler `login()` (sans argument) automatiquement au démarrage.** S'il n'y
> a pas de session **et** qu'un provider est configuré, il **redirige immédiatement** vers le
> provider → vous tombez dans une **boucle de redirection** sur la page de login. On
> n'appelle `login()` que sur un **clic explicite** « SSO ». Au démarrage, on se contente de
> `getCsrfToken()` (qui, lui, **ne redirige pas**) pour détecter une session existante.

> ⚠️ **`isAuthenticated()` ne vérifie que la _présence_ d'un token**, pas sa validité. Un
> token expiré renverra quand même `true`. C'est suffisant pour piloter l'UI ; une requête
> ultérieure avec un token expiré déclenchera une ré-authentification automatique.

> 💡 **Où est émis l'événement ?** `emitAuthenticatedEvent` utilise le `dispatchEvent`
> **global** (= `window`). On écoutera donc sur `window` (et sur `document` par sécurité).

## 3.5 Comment inspecter la librairie

La doc publique est à `https://sinequa.github.io/sba-mint/atomic/`. En cas de page
manquante, le plus fiable est d'**inspecter le package** : les types `.d.ts` sont la source
de vérité.

```bash
npm pack @sinequa/atomic                 # télécharge le .tgz
tar -xzf sinequa-atomic-*.tgz package/dist/authentication
# puis lire les .d.ts (login, logout, isAuthenticated, tokens, providers…)
```

Au chapitre suivant, on encapsule tout ça dans un **contexte React** client-only.
