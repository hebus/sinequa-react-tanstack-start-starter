# 11. Récapitulatif, vérifications & annexe CSS

## 11.1 Commandes

```bash
npm install        # installe les dépendances
npm run build      # build client + SSR ; génère src/routeTree.gen.ts
npm run typecheck  # tsc --noEmit (le build Vite ne fait pas de typecheck)
npm run dev        # https://localhost:4200 (accepter le certificat auto-signé)
```

## 11.2 Stratégie de vérification

- **Build + typecheck** à chaque étape (le build Vite ne type-checke pas → `tsc` séparé).
- **Tests navigateur** avec **Playwright** (Chromium), utiles pour ce qui ne nécessite pas de
  session réelle :
  - rendu de `/login`, présence des onglets ;
  - le bouton SSO pré-rempli (`identity-dev`) → redirection vers Keycloak avec le bon
    `redirect_uri` ;
  - la **garde** : `/`, `/profile`, `/search` redirigent vers `/login` sans session ;
  - le **thème** : bascule, persistance, restauration après reload (sans flash) ;
  - absence de **warning d'hydratation** / erreur console.
- Ce qui nécessite une **session réelle** (login Keycloak interactif) : contenu du profil,
  résultats de recherche, pagination, preview. On s'arrête à la page Keycloak en automatisé.

Exemple — vérifier le proxy vers Sinequa :

```powershell
Invoke-WebRequest "https://localhost:4200/api/v1/challenge?action=getCsrfToken&suppressErrors=true" -SkipCertificateCheck
# Attendu : {"error":"web token cookie does not exist","methodresult":"ok"}
# => le proxy atteint bien Sinequa et getCsrfToken() renverra null proprement.
```

## 11.3 Les pièges, en une page

- **Versions** : vite 8 + `@vitejs/plugin-react` 6 (un `vite@^6` casse l'install).
- **Auth = navigateur** : tout appel d'auth dans `useEffect`/handlers, jamais au rendu SSR.
- **Ne pas appeler `login()` au boot** : risque de boucle de redirection. Utiliser
  `getCsrfToken()` (silencieux) pour détecter une session.
- **Provider OAuth** : forcer `identity-dev` **avant** `appInitializerFn()` ; servir l'app en
  **HTTPS sur le port 4200** pour matcher le `redirect_uri` enregistré.
- **`routeTree.gen.ts`** : généré, non versionné.
- **Garde dans `useEffect`**, pas dans un `loader` (SSR n'a pas le `sessionStorage`).
- **Recherche** : nom de query via `fetchApp()` ; **ne pas envoyer `pageSize`** (serveur) ;
  paginer depuis la **réponse**.
- **Preview** : iframe same-origin (proxy) pour conserver le cookie ; attention aux URLs
  absolues.
- **Thème** : que des `var(--…)` ; script anti-flash + `suppressHydrationWarning` + libellé
  neutre jusqu'au montage.

## 11.4 Pour aller plus loin

📂 Les sujets avancés sont regroupés dans **[Aller plus loin](aller-plus-loin/index.html)**
(documents dédiés) :

1. **[Mise en évidence avancée dans la preview (`highlightsPerLocation`)](aller-plus-loin/index.html)**
   — légende par catégorie, compteur de correspondances et navigation ⟨ précédent / suivant ⟩.
2. **[Facettes, agrégations, tri, onglets & scopes](aller-plus-loin/index.html)**
   — exploiter `result.aggregations`, filtrer via `query.select`, onglets et tri.
3. **[Rafraîchissement du token & expiration](aller-plus-loin/index.html)**
   — session glissante (`sinequa-jwt-refresh`) et réaction au 401.
4. **[Déploiement](aller-plus-loin/index.html)** — reverse proxy same-origin vs
   `backendUrl` + CORS, et `redirect_uri` OAuth en production.

## 11.5 Annexe — `src/styles.css` complet

```css
/* Default theme = dark */
:root {
  /* enables animating to/from `auto` sizes (e.g. <details> open/close) */
  interpolate-size: allow-keywords;
  --bg: #0f172a;
  --panel: #1e293b;
  --inset: #0f172a;
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

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  transition:
    background-color 0.2s ease,
    color 0.2s ease;
}

.center {
  min-height: 100vh;
  display: grid;
  place-items: center;
  padding: 24px;
}

.card {
  width: 100%;
  max-width: 420px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 28px;
}

.card h1 {
  margin: 0 0 4px;
  font-size: 1.4rem;
}

.subtitle {
  margin: 0 0 20px;
  color: var(--muted);
  font-size: 0.9rem;
}

.tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 20px;
  background: var(--inset);
  border-radius: 8px;
  padding: 4px;
}

.tabs button {
  flex: 1;
  padding: 8px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  font-size: 0.85rem;
}

.tabs button.active {
  background: var(--accent);
  color: white;
}

label {
  display: block;
  font-size: 0.82rem;
  color: var(--muted);
  margin-bottom: 6px;
}

input {
  width: 100%;
  padding: 10px 12px;
  margin-bottom: 14px;
  background: var(--inset);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.95rem;
}

input:focus {
  outline: none;
  border-color: var(--accent);
}

button.primary {
  width: 100%;
  padding: 11px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: white;
  font-size: 0.95rem;
  font-weight: 600;
  cursor: pointer;
}

button.primary:hover:not(:disabled) {
  background: var(--accent-hover);
}

button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.provider-btn {
  width: 100%;
  padding: 11px;
  margin-bottom: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--inset);
  color: var(--text);
  cursor: pointer;
}

.provider-btn:hover {
  border-color: var(--accent);
}

.error {
  color: var(--error);
  font-size: 0.85rem;
  margin: 0 0 14px;
}

.hint {
  color: var(--muted);
  font-size: 0.78rem;
  margin: 12px 0 0;
}

.badge {
  display: inline-block;
  background: rgba(52, 211, 153, 0.15);
  color: var(--ok);
  border: 1px solid var(--ok);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: 0.8rem;
  margin-bottom: 16px;
}

.kv {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 6px 16px;
  font-size: 0.9rem;
  margin-bottom: 20px;
}

.kv dt {
  color: var(--muted);
}

.kv dd {
  margin: 0;
  word-break: break-all;
}

/* ----- Protected layout ----- */
.layout {
  min-height: 100vh;
}

.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 24px;
  background: var(--panel);
  border-bottom: 1px solid var(--border);
}

.nav-links {
  display: flex;
  gap: 4px;
}

.nav-link {
  color: var(--muted);
  text-decoration: none;
  padding: 8px 14px;
  border-radius: 8px;
  font-size: 0.9rem;
}

.nav-link:hover {
  background: var(--inset);
  color: var(--text);
}

.nav-link.active {
  background: var(--accent);
  color: #fff;
}

.nav-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.nav-user {
  color: var(--muted);
  font-size: 0.85rem;
}

button.ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 14px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.85rem;
}

button.ghost:hover {
  border-color: var(--accent);
}

.content {
  padding: 32px 24px;
}

.page {
  max-width: 760px;
  margin: 0 auto;
}

.page h1 {
  margin: 8px 0 4px;
}

/* ----- Home cards ----- */
.cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-top: 24px;
}

.link-card {
  display: block;
  padding: 20px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 12px;
  color: var(--text);
  text-decoration: none;
}

.link-card:hover {
  border-color: var(--accent);
}

.link-card h2 {
  margin: 0 0 6px;
  font-size: 1.05rem;
}

.link-card p {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
}

/* ----- Profile raw dump ----- */
.raw summary {
  cursor: pointer;
  color: var(--muted);
  font-size: 0.85rem;
}

.raw pre {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  overflow: auto;
  font-size: 0.8rem;
}

/* ----- Search ----- */
.search-form {
  display: flex;
  gap: 8px;
  margin: 20px 0;
}

.search-form input {
  flex: 1;
  margin: 0;
}

.search-form select {
  margin: 0;
  padding: 10px 12px;
  background: var(--inset);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text);
  font-size: 0.95rem;
}

.search-form button {
  width: auto;
  white-space: nowrap;
}

.result-count {
  color: var(--muted);
  font-size: 0.85rem;
}

.results {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.result {
  padding: 16px;
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 10px;
}

.result a,
.result-title {
  font-weight: 600;
  color: var(--accent);
  text-decoration: none;
}

.result a:hover {
  text-decoration: underline;
}

.extract {
  margin: 8px 0 4px;
  font-size: 0.88rem;
  color: var(--text);
}

.extract b {
  color: var(--ok);
}

.path {
  font-size: 0.78rem;
  color: var(--muted);
}

/* ----- Theme toggle ----- */
.theme-toggle {
  font-size: 0.85rem;
}

/* Toggle pinned top-right on the (centered) login screen */
.login-topbar {
  position: fixed;
  top: 16px;
  right: 16px;
}

/* ----- Sheet (slides in from the right) ----- */
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  pointer-events: none;
}

.sheet-root.open {
  pointer-events: auto;
}

.sheet-overlay {
  position: absolute;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  opacity: 0;
  transition: opacity 0.25s ease;
}

.sheet-root.open .sheet-overlay {
  opacity: 1;
}

.sheet-panel {
  position: absolute;
  top: 0;
  right: 0;
  height: 100%;
  width: min(720px, 92vw);
  background: var(--panel);
  border-left: 1px solid var(--border);
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.25);
  transform: translateX(100%);
  transition: transform 0.28s ease;
  display: flex;
  flex-direction: column;
}

.sheet-root.open .sheet-panel {
  transform: translateX(0);
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.sheet-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sheet-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

/* Collapsible metadata block (native <details> with smooth open/close) */
.meta-details {
  border-bottom: 1px solid var(--border);
}

.meta-details > summary {
  cursor: pointer;
  user-select: none;
  list-style: none;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 18px;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}

.meta-details > summary::-webkit-details-marker {
  display: none;
}

.meta-details > summary::before {
  content: '▸';
  display: inline-block;
  transition: transform 0.28s ease;
}

.meta-details[open] > summary::before {
  transform: rotate(90deg);
}

.meta-details::details-content {
  block-size: 0;
  overflow: clip;
  transition:
    block-size 0.28s ease,
    content-visibility 0.28s ease allow-discrete;
}

.meta-details[open]::details-content {
  block-size: auto;
}

.meta {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 6px 16px;
  margin: 0;
  padding: 0 18px 16px;
  font-size: 0.85rem;
  max-height: 38vh;
  overflow: auto;
}

.meta dt {
  color: var(--muted);
}

.meta dd {
  margin: 0;
  word-break: break-word;
}

.preview-frame {
  flex: 1;
  width: 100%;
  border: 0;
  background: #fff;
}

.sheet-status {
  padding: 24px;
  color: var(--muted);
}

/* Clickable result title */
button.result-link {
  display: block;
  text-align: left;
  width: auto;
  padding: 0;
  background: none;
  border: 0;
  font: inherit;
  font-weight: 600;
  color: var(--accent);
  cursor: pointer;
}

button.result-link:hover {
  text-decoration: underline;
}

.result-footer {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
}

.result-external {
  font-size: 0.78rem;
  color: var(--muted);
}

.pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  margin-top: 20px;
}

.page-info {
  font-size: 0.85rem;
  color: var(--muted);
}
```

Vous disposez maintenant d'une application Sinequa complète : authentification multi-méthode,
routes protégées, recherche paginée, preview de documents et thème clair/sombre. 🎉
