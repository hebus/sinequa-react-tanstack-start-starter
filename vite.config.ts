import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

// Sinequa demo backend. All Sinequa API calls go through this dev proxy so the
// browser talks to same-origin (https://localhost:4200) and cookies/CSRF work.
const API_URL = 'https://su-sba.demo.sinequa.com'

const sinequaProxyTarget = {
  target: API_URL,
  secure: true,
  changeOrigin: true,
}

// The dev OAuth provider "identity-dev" is registered server-side with
// redirect_uri = https://localhost:4200/auth/redirect, so the dev server MUST run on
// HTTPS at port 4200 for the SSO round-trip to return to the app.
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
