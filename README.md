<div align="center">

# 🔎 Sinequa × TanStack Start

**Enterprise search app** — multi-method authentication, faceted search, highlighted document
preview, all on a **Sinequa** backend via
[`@sinequa/atomic`](https://sinequa.github.io/sba-mint/atomic/).

[![TanStack Start](https://img.shields.io/badge/TanStack_Start-1.168-FF4154?logo=react&logoColor=white)](https://tanstack.com/start)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)](https://vite.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Sinequa](https://img.shields.io/badge/@sinequa/atomic-1.1-2D6CDF)](https://sinequa.github.io/sba-mint/atomic/)

</div>

---

## ✨ Features

| | |
|---|---|
| 🔐 **Multi-method auth** | Username/password (JWT), **Bearer token**, **SSO** OAuth/SAML (Keycloak) |
| 🛡️ **Protected routes** | Single guard via a TanStack Router *pathless layout* |
| 🔎 **Search** | Pagination, **facets & aggregations**, tabs, sort, scopes |
| 🌳 **Tree facets** | Hierarchical display, lazy expansion (`action: open`) |
| 📄 **Document preview** | Side panel *(sheet)* + iframe + collapsible metadata |
| 🖍️ **Advanced highlighting** | Legend + **per-category** navigation (`highlightsPerLocation`) |
| ♻️ **Sliding session** | Auto-refresh + re-auth/redirect on expiration |
| 🌓 **Light/dark theme** | Persistent, flash-free (pre-paint script) |

---

## 🚀 Quick start

> **Prerequisites:** Node.js ≥ 20 · npm access to the proprietary `@sinequa/atomic` package.

```bash
# 1. Install
npm install

# 2. Configure the target (already pre-filled for the demo)
#    .env :  VITE_SINEQUA_APP=mint_rnd
#            VITE_SINEQUA_OAUTH_PROVIDER=identity-dev

# 3. Run
npm run dev      # → https://localhost:4200  (accept the self-signed certificate)
```

> ⚠️ **HTTPS + port 4200 are required.** The dev SSO provider `identity-dev` is registered
> with `redirect_uri = https://localhost:4200/auth/redirect`: the login round-trip only
> returns to the app if the origin **matches exactly**.

---

## 🧩 Stack & architecture

- **[TanStack Start](https://tanstack.com/start)** (SSR + file-based routing) · **React 19** · **Vite 8** · strict **TypeScript**.
- **[`@sinequa/atomic`](https://sinequa.github.io/sba-mint/atomic/)** for auth, queries and preview.
- **Two key decisions:**
  1. **100% browser-side auth** (sessionStorage, DOM events, redirects) → all auth logic runs on the client, never during SSR.
  2. **Vite proxy** to Sinequa → *same-origin* calls (`/api/...`), transparent cookies/CSRF.

```text
src/
├─ router.tsx                 # TanStack router
├─ styles.css                 # CSS-variable theming (light/dark)
├─ auth/
│  ├─ auth-context.tsx        # core: bootstrap + auth state (client-only)
│  └─ with-reauth.ts          # session expiration handling (401)
├─ theme/theme-context.tsx    # theme + anti-flash
├─ components/
│  ├─ sheet.tsx               # animated side panel
│  └─ preview.tsx             # preview + per-category highlighting
└─ routes/
   ├─ __root.tsx              # HTML document + providers
   ├─ login.tsx               # /login  (3 methods)
   └─ _protected/             # protected routes
      ├─ index.tsx            # /
      ├─ profile.tsx          # /profile
      └─ search.tsx           # /search  (facets, preview, pagination…)
```

---

## 📜 Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Dev server (HTTPS, `https://localhost:4200`) |
| `npm run build` | Client + SSR build (generates `src/routeTree.gen.ts`) |
| `npm run typecheck` | Strict TypeScript check (`tsc --noEmit`) |
| `npm run tutorial` | (Re)generates the HTML tutorial from the Markdown chapters |

---

## 📚 Documentation

- **[`PROMPT.md`](./PROMPT.md)** — reproducible A→Z guide (scaffolding + auth + screens).
- **[`PROMPT-COMPLET.md`](./PROMPT-COMPLET.md)** — extended version (advanced search, highlighting, expiration).
- **[`tutorial/index.html`](./tutorial/index.html)** — interactive tutorial (table of contents, search, copy-to-clipboard, theme).
- **[`tutorial/aller-plus-loin/`](./tutorial/aller-plus-loin/)** — advanced topics:
  preview highlighting · facets/aggregations · token expiration · deployment.

---

## 🔐 Authentication methods

| Method | How |
|---|---|
| **Username / password** | `login({ username, password })` → JWT (`security.webtoken`) |
| **Bearer token** | `setGlobalConfig({ bearerToken })` then `getJWToken()` |
| **SSO (OAuth/SAML)** | `login()` → provider redirect (Keycloak), editable provider field |

---

## ✅ Status

Strict build + typecheck are green. SSO flow, protected routes, theme and highlighting are
verified; username/password and Bearer are wired up (to be validated with a test
account/token).
