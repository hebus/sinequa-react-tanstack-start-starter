# 3. Rafraîchissement du token & gestion de l'expiration

L'authentification Sinequa repose sur un **token CSRF** (stocké dans le `sessionStorage`) et
un **cookie de session**. Ce chapitre explique comment la session se prolonge **toute seule**,
et comment réagir proprement quand elle expire malgré tout.

## 3.1 Rappel : `isAuthenticated()` ne teste que la présence

```ts
isAuthenticated() // true s'il existe un token CSRF en sessionStorage — PAS sa validité
```

> ⚠️ Un token **expiré** fait toujours renvoyer `true` à `isAuthenticated()`. Ne vous en
> servez que pour **piloter l'UI** (afficher l'app vs l'écran de login), jamais comme preuve
> que le prochain appel réseau réussira.

## 3.2 Le rafraîchissement est automatique (header `sinequa-jwt-refresh`)

À **chaque réponse**, le helper interne `handleResponse` regarde un en-tête de réponse et met
à jour le token si le serveur en fournit un nouveau :

```ts
// dans @sinequa/atomic (handle-response)
const newToken = response.headers.get('sinequa-jwt-refresh')
if (newToken !== null) setToken(newToken)
```

> 💡 **Session glissante.** Tant que l'utilisateur fait des requêtes, le serveur peut renvoyer
> un token rafraîchi via `sinequa-jwt-refresh`, et la lib le stocke **de façon transparente**.
> Vous n'avez en général **rien à faire** pour prolonger une session active.

## 3.3 Ce qui se passe en cas d'expiration (401)

Quand le token/cookie n'est plus valide, l'appel API renvoie **401** et `handleResponse`
**lève une erreur** (`UnauthorizedError`) — la promesse de `fetchQuery`, `fetchPreview`, etc.
**rejette**. (De même, `500` → `ServerError`, autres → `ApiError`.)

Il n'y a donc pas de redirection magique : **c'est à l'application de réagir** au rejet.

## 3.4 Patron : retry silencieux puis redirection

Stratégie robuste autour d'un appel : sur 401, tenter de **récupérer silencieusement** une
session (cookie SSO encore valide) via `getCsrfToken()` ; si ça échoue, réinitialiser l'état
local — ce qui ramène l'utilisateur au login.

```ts
import { clearSessionTokens, getCsrfToken } from '@sinequa/atomic'

function isUnauthorized(err: unknown): boolean {
  // UnauthorizedError ou message contenant "unauthorized"
  return (
    (err as { name?: string })?.name === 'UnauthorizedError' ||
    (err instanceof Error && /unauthor/i.test(err.message))
  )
}

export async function withReauth<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (!isUnauthorized(err)) throw err

    // 1) Tenter de re-valider une session existante (cookie/SSO) — ne redirige pas.
    //    On se fie au TOKEN renvoyé (et non à isAuthenticated(), qui ne teste que la
    //    présence d'un token possiblement périmé) pour décider de rejouer.
    let fresh: string | null = null
    try {
      fresh = await getCsrfToken()
    } catch {
      /* pas de session ambiante */
    }
    if (fresh) return await call() // retry unique

    // 2) Sinon : reset de l'état local. clearSessionTokens émet l'évènement
    //    'authenticated' = false → le layout protégé redirige vers /login.
    clearSessionTokens()
    throw err
  }
}
```

Utilisation :

```ts
const result = await withReauth(() => fetchQuery({ name, text, page }))
```

> 💡 **`clearSessionTokens()`** vide les tokens locaux **et émet `'authenticated'` à `false`**.
> Comme votre `AuthProvider` écoute déjà cet évènement (voir le tutoriel principal), la garde
> de route renverra automatiquement vers `/login`. Pas besoin de manipuler la navigation ici.

## 3.5 Expiration du **mot de passe** (à ne pas confondre avec le token)

`@sinequa/atomic` expose deux helpers de date qui comparent une **date ISO** au présent :

```ts
isExpired(iso?)            // true si la date ISO est passée (ou maintenant)
expiresSoon(iso?, days=7)  // true si la date tombe dans les N prochains jours
```

> ⚠️ Malgré le contexte de ce chapitre, **ces helpers ne concernent pas la session/le token**.
> Leur usage ici est l'**expiration du mot de passe** de l'utilisateur, exposée sur le
> `Principal` via `passwordExpirationDate` (une date ISO) :

```ts
import { isExpired, expiresSoon } from '@sinequa/atomic'

isExpired(principal.passwordExpirationDate)        // mot de passe déjà expiré ?
expiresSoon(principal.passwordExpirationDate, 7)   // expire dans ≤ 7 jours ?
```

Typiquement pour afficher un bandeau « votre mot de passe expire bientôt, pensez à le changer ».
Ne leur passez **pas** l'horodatage du token CSRF (voir 3.6) : ce n'est pas une date ISO.

## 3.6 Lire l'expiration du **token CSRF**

L'échéance du token d'authentification n'est **pas** une date séparée : elle est **encodée dans
le token lui-même**, après le caractère `|`. Le backend renvoie par exemple :

```json
{ "data": { "csrfToken": "y7ZO5nUKQI242QB0NlktXmEMshAbCLi7KAJlBQupL9g|1780829080" } }
```

La partie après le `|` (`1780829080`) est un **timestamp Unix en secondes**. La lib stocke le
token **entier** (`setToken`/`getToken`) et **ne décode pas** cette échéance — à vous de la lire
si besoin :

```ts
import { getToken } from '@sinequa/atomic'

/** Date d'expiration du token CSRF, ou null si non décodable. */
function tokenExpiry(token = getToken()): Date | null {
  const unixSeconds = Number(token?.split('|')[1])
  return Number.isFinite(unixSeconds) ? new Date(unixSeconds * 1000) : null
}

function tokenExpired(token = getToken()): boolean {
  const exp = tokenExpiry(token)
  return !!exp && exp.getTime() <= Date.now()
}
```

> 💡 En pratique vous n'avez **pas** besoin de tester ça vous-même : la **session glissante**
> (3.2) prolonge le token tant que l'utilisateur est actif, et le **chemin d'échec 401**
> (3.3-3.4) couvre le cas où il est réellement périmé. Décoder l'échéance ne sert que pour de
> l'affichage (compte à rebours, diagnostic) ou un `getCsrfToken()` préventif.

## 3.7 À retenir

> 💡 **Ne réimplémentez pas le rafraîchissement** : il est déjà géré via
> `sinequa-jwt-refresh`. Concentrez-vous sur le **chemin d'échec** (401) : retry silencieux,
> puis `clearSessionTokens()` → retour au login.

> ⚠️ **Côté SSR**, ne touchez jamais aux tokens pendant le rendu serveur (pas de
> `sessionStorage`). Toute cette logique vit côté client, comme le reste de l'auth.

> ⚠️ **Le retry doit être borné** (une seule tentative) pour éviter les boucles si le serveur
> répond systématiquement 401.

## 3.8 Implémentation de référence

Ce patron **est implémenté** dans `src/auth/with-reauth.ts` (fonction `withReauth`), et appliqué
aux appels de données de la page `/search` : `fetchApp`, `fetchQuery` (recherche, `aggregate`,
`open`) et `fetchPreview` sont enveloppés via `withReauth(() => …)`. Sur expiration, l'utilisateur
est silencieusement reconnecté si la session le permet, sinon renvoyé vers `/login`.
