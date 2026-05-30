# 6. SSO OAuth via Keycloak (le chapitre des pièges)

C'est ici que se concentrent les difficultés réelles. Le SSO de l'application `mint_rnd`
passe par un **Keycloak** (OIDC + PKCE). Comprendre le flux **et** la contrainte du
`redirect_uri` est indispensable.

## 6.1 Comment l'app découvre le SSO

`appInitializerFn()` appelle `GET /api/v1/app?app=mint_rnd&preLogin=true`. Pour `mint_rnd`,
la réponse contient :

```json
{ "autoOAuthProvider": "identity", "autoSAMLProvider": "", "providers": {} }
```

Donc le provider OAuth auto-détecté est **`identity`**. Au clic « SSO », la lib fait :

```text
POST /api/v1/security.oauth   { action: "getcode", provider, tokenInCookie: true, originalUrl }
   └─▶ réponse 302 vers la page de login du provider (Keycloak), puis redirection navigateur
```

## 6.2 Le piège du `redirect_uri` — pourquoi `identity-dev` et le port 4200

En testant le provider **`identity`** auto-détecté, le `redirect_uri` renvoyé pointe vers le
**serveur démo** (`https://su-sba.demo.sinequa.com/auth/redirect`). Après login Keycloak, le
navigateur reviendrait donc sur le serveur démo, **pas** sur notre app locale → la session ne
se referme jamais côté app.

En testant **`identity-dev`**, le `redirect_uri` renvoyé est :

```text
https://login.coe.chapsvision.com/realms/ChapsVision/protocol/openid-connect/auth
  ?response_type=code&scope=email&client_id=su-sba
  &redirect_uri=https%3A%2F%2Flocalhost%3A4200%2Fauth%2Fredirect
  &state=…&code_challenge=…&code_challenge_method=S256
```

→ `redirect_uri = https://localhost:4200/auth/redirect`. **D'où** :

> ⚠️ **Trois contraintes liées entre elles** :
> 1. utiliser le provider **`identity-dev`** (pas `identity`) → `VITE_SINEQUA_OAUTH_PROVIDER=identity-dev` ;
> 2. servir l'app sur le **port 4200** ;
> 3. en **HTTPS** (`@vitejs/plugin-basic-ssl`).
>
> Les trois doivent correspondre **exactement** au `redirect_uri` enregistré côté serveur,
> sinon Keycloak refuse le retour. C'est ce qui explique le `vite.config.ts` du chapitre 2.

## 6.3 Forcer le provider (rappel)

Dans `auth-context.tsx`, on impose le provider **avant** `appInitializerFn()` (qui conserve
une valeur déjà définie) :

```tsx
const oauthProvider = import.meta.env.VITE_SINEQUA_OAUTH_PROVIDER
if (oauthProvider) setGlobalConfig({ autoOAuthProvider: oauthProvider })
await appInitializerFn() // garde "identity-dev", n'écrase pas avec "identity"
```

Et le bouton SSO permet de surcharger ce provider à la volée (`loginWithSSO(ssoProvider, kind)`).

## 6.4 Le retour de redirection

Après authentification, Keycloak renvoie le navigateur vers
`https://localhost:4200/auth/redirect?code=…&state=…`. Le **proxy Vite** relaie `/auth/redirect`
vers Sinequa, qui échange le code, **pose le cookie de session**, puis renvoie vers l'app. Au
rechargement, le `getCsrfToken()` du bootstrap récupère le token CSRF → `isAuthenticated()`
devient `true` → l'app affiche l'écran authentifié.

## 6.5 Tester le flux sans mot de passe (au niveau HTTP)

On peut prouver tout le câblage jusqu'à Keycloak **sans identifiants**, via le proxy :

```powershell
$body = @{ action='getcode'; provider='identity-dev'; tokenInCookie=$true; originalUrl='https://localhost:4200/login' } | ConvertTo-Json
$r = Invoke-WebRequest "https://localhost:4200/api/v1/security.oauth" -Method POST `
  -ContentType 'application/json' -Body $body -SkipCertificateCheck -MaximumRedirection 0 -SkipHttpErrorCheck
[string]($r.Headers['Location'] | Select-Object -First 1)
# Attendu : 302 vers .../openid-connect/auth?...&redirect_uri=https://localhost:4200/auth/redirect
```

> 💡 **Diagnostiquer un provider inconnu** : si le serveur répond
> `{"ErrorMessage":"OAuth provider not found: <nom>"}` (HTTP 500), c'est que le nom de
> provider n'existe pas sur ce backend. Vérifiez l'orthographe exacte (ex. `identity-dev`
> avec un tiret, pas `identity_dev`).

La saisie du mot de passe sur la page Keycloak reste **interactive** : on s'arrête à cette
page lors des tests automatisés. Le reste (redirection, retour, session) est vérifiable.

Au chapitre suivant : structurer les **routes protégées**.
