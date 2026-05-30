# 1. Introduction & architecture

Ce tutoriel montre, de A à Z, comment construire une application **React / TanStack Start**
qui s'authentifie sur un backend **Sinequa** via la librairie `@sinequa/atomic`, puis :

- propose **trois méthodes d'authentification** (login/mot de passe, Bearer token, SSO OAuth/SAML) ;
- affiche un écran confirmant l'authentification ;
- expose des **routes protégées** (profil utilisateur, recherche) ;
- branche une **recherche** Sinequa avec **pagination** ;
- ouvre la **preview** d'un document dans un panneau latéral, avec ses **métadonnées** ;
- gère un **thème clair/sombre** persistant.

## Ce que vous allez apprendre

- Intégrer `@sinequa/atomic` (config globale, cycle d'authentification, requêtes, preview).
- Faire cohabiter le **SSR de TanStack Start** avec une authentification **100 % navigateur**.
- Mettre en place un **proxy de développement** vers un serveur Sinequa, en **HTTPS**.
- Structurer des routes protégées avec un **layout de garde unique**.
- Éviter les pièges réels rencontrés (versions, provider OAuth, redirect_uri, hydratation…).

## Les deux décisions d'architecture fondamentales

Deux choix structurent toute l'application. Les comprendre dès maintenant évite beaucoup de confusion.

### 1. L'authentification Sinequa est 100 % navigateur

`@sinequa/atomic` s'appuie sur le `sessionStorage`, des **événements DOM** (`'authenticated'`)
et des **redirections** (OAuth/SAML). Or TanStack Start fait du **rendu côté serveur (SSR)**.

> 💡 **Règle d'or** : toute la logique d'authentification s'exécute **uniquement côté client**
> — dans des `useEffect` ou des gestionnaires d'événements, **jamais** pendant le rendu serveur.
> Pendant le SSR, `window`, `sessionStorage` et les événements DOM n'existent pas.

### 2. On passe par un proxy Vite (en HTTPS, port 4200)

Les helpers de la librairie construisent leurs URLs ainsi : `url = ${backendUrl}/${endpoint}`.
En laissant `backendUrl` se remplir automatiquement avec `window.location.origin`
(`https://localhost:4200`), **tous les appels partent en same-origin** vers `/api/...`, et le
**proxy Vite** les relaie vers le serveur Sinequa. Les cookies de session et le CSRF
fonctionnent donc naturellement.

> ⚠️ Le HTTPS et le port **4200** ne sont pas arbitraires : le provider OAuth de
> développement (`identity-dev`) est enregistré côté serveur avec un `redirect_uri` qui
> pointe vers `https://localhost:4200/auth/redirect`. C'est détaillé au chapitre **SSO**.

## Prérequis

- **Node.js ≥ 20** (testé avec Node 24, npm 11).
- Un accès npm au package `@sinequa/atomic` (package propriétaire Sinequa).
- Un backend Sinequa accessible (ce tutoriel cible la démo `https://su-sba.demo.sinequa.com`).

## Le résultat final (arborescence)

```
demo-login/
├─ vite.config.ts            # plugin TanStack Start + HTTPS + proxy Sinequa
├─ tsconfig.json
├─ .env                      # nom d'app + provider OAuth
├─ src/
│  ├─ router.tsx
│  ├─ styles.css
│  ├─ auth/
│  │  └─ auth-context.tsx    # cœur : bootstrap + état d'auth
│  ├─ theme/
│  │  └─ theme-context.tsx   # thème clair/sombre
│  ├─ components/
│  │  └─ sheet.tsx           # panneau latéral (preview)
│  └─ routes/
│     ├─ __root.tsx          # document HTML + providers (public)
│     ├─ login.tsx           # /login (public)
│     ├─ _protected.tsx      # layout pathless : garde + nav
│     └─ _protected/
│        ├─ index.tsx        # /         accueil
│        ├─ profile.tsx      # /profile  infos du principal
│        └─ search.tsx       # /search   recherche + preview + pagination
```

Passons à la mise en place du projet.
