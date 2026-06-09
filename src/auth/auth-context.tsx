import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  appInitializerFn,
  AuthMode,
  emitAuthenticatedEvent,
  fetchPrincipal,
  getCsrfToken,
  getJWToken,
  globalConfig,
  isAuthenticated,
  login,
  logout,
  setGlobalConfig,
  type Principal,
} from '@sinequa/atomic'

type Providers = {
  oauth?: string
  saml?: string
}

type AuthContextValue = {
  /** True while the initial client-side bootstrap (config + session check) runs. */
  initializing: boolean
  authenticated: boolean
  principal: Principal | null
  /** SSO providers advertised by the backend pre-login config, if any. */
  providers: Providers
  loginWithCredentials: (username: string, password: string) => Promise<boolean>
  loginWithBearer: (token: string) => Promise<boolean>
  loginWithSSO: (provider?: string, kind?: 'oauth' | 'saml') => Promise<boolean>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true)
  const [authenticated, setAuthenticated] = useState(false)
  const [principal, setPrincipal] = useState<Principal | null>(null)
  const [providers, setProviders] = useState<Providers>({})

  // Keep a stable ref so the 'authenticated' event listener can refresh the
  // principal without being re-registered on every render.
  const refreshPrincipal = useRef(async (isAuth: boolean) => {
    if (!isAuth) {
      setPrincipal(null)
      return
    }
    try {
      setPrincipal(await fetchPrincipal())
    } catch {
      setPrincipal(null)
    }
  })

  // Client-only bootstrap: configure Sinequa, load pre-login providers, and
  // detect an existing/SSO-returned session. None of this runs during SSR.
  useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      const app = import.meta.env.VITE_SINEQUA_APP
      if (app) setGlobalConfig({ app })

      // Force a specific OAuth provider before init: appInitializerFn keeps an already-set
      // autoOAuthProvider instead of the server's, letting us use the dev provider.
      const oauthProvider = import.meta.env.VITE_SINEQUA_OAUTH_PROVIDER
      if (oauthProvider) setGlobalConfig({ autoOAuthProvider: oauthProvider })

      try {
        // Populates backendUrl + auto OAuth/SAML providers from the server.
        await appInitializerFn()
      } catch {
        // Pre-login may fail (e.g. app name not set); credential login still works.
      }

      try {
        // Silently picks up an existing cookie/SSO redirect session. Does not redirect.
        await getCsrfToken()
      } catch {
        // No ambient session — the user will authenticate explicitly.
      }

      if (cancelled) return
      setProviders({
        oauth: globalConfig.autoOAuthProvider || undefined,
        saml: globalConfig.autoSAMLProvider || undefined,
      })
      const authed = isAuthenticated()
      setAuthenticated(authed)
      await refreshPrincipal.current(authed)
      setInitializing(false)
    }

    void bootstrap()
    return () => {
      cancelled = true
    }
  }, [])

  // The library emits 'authenticated' on window (global dispatchEvent). We also
  // listen on document to be safe across dispatch targets.
  useEffect(() => {
    const onAuthenticated = (event: Event) => {
      const authed = (event as CustomEvent<{ authenticated: boolean }>).detail
        .authenticated
      setAuthenticated(authed)
      void refreshPrincipal.current(authed)
    }
    window.addEventListener('authenticated', onAuthenticated)
    document.addEventListener('authenticated', onAuthenticated)
    return () => {
      window.removeEventListener('authenticated', onAuthenticated)
      document.removeEventListener('authenticated', onAuthenticated)
    }
  }, [])

  const loginWithCredentials = useCallback(
    (username: string, password: string) => login({ username, password }),
    [],
  )

  const loginWithBearer = useCallback(async (token: string) => {
    setGlobalConfig({ bearerToken: token })
    await getJWToken() // stores the CSRF token, throws on failure
    emitAuthenticatedEvent(true)
    return true
  }, [])

  // No credentials => library attempts SSO, then redirects to OAuth/SAML if configured.
  // The provider can be overridden (e.g. "identity" -> "identity_dev" when going through
  // the dev proxy) before triggering the redirect-based flow. We set authMode explicitly
  // (the 2.0 source of truth) so the redirect fires even when the backend pre-login
  // advertised no provider and the user typed one in manually.
  const loginWithSSO = useCallback(
    (provider?: string, kind: 'oauth' | 'saml' = 'oauth') => {
      if (provider) {
        setGlobalConfig(
          kind === 'saml'
            ? { autoSAMLProvider: provider, authMode: AuthMode.saml(provider) }
            : { autoOAuthProvider: provider, authMode: AuthMode.oauth(provider) },
        )
      }
      return login()
    },
    [],
  )

  const signOut = useCallback(async () => {
    const redirectUrl = await logout()
    if (redirectUrl) window.location.href = redirectUrl
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      initializing,
      authenticated,
      principal,
      providers,
      loginWithCredentials,
      loginWithBearer,
      loginWithSSO,
      signOut,
    }),
    [
      initializing,
      authenticated,
      principal,
      providers,
      loginWithCredentials,
      loginWithBearer,
      loginWithSSO,
      signOut,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
