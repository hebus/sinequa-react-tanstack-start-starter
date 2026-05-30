import { useEffect, useState, type FormEvent } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useAuth } from '../auth/auth-context'
import { ThemeToggle } from '../theme/theme-context'

export const Route = createFileRoute('/login')({
  component: LoginPage,
})

type Method = 'credentials' | 'bearer' | 'sso'

function LoginPage() {
  const navigate = useNavigate()
  const {
    initializing,
    authenticated,
    providers,
    loginWithCredentials,
    loginWithBearer,
    loginWithSSO,
  } = useAuth()

  const [method, setMethod] = useState<Method>('credentials')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [bearer, setBearer] = useState('')
  const [ssoProvider, setSsoProvider] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  // Provider detected from the backend pre-login config (OAuth has priority).
  const detectedProvider = providers.oauth ?? providers.saml ?? ''
  const providerKind: 'oauth' | 'saml' =
    providers.saml && !providers.oauth ? 'saml' : 'oauth'

  // Once authenticated, leave the login screen.
  useEffect(() => {
    if (authenticated) void navigate({ to: '/' })
  }, [authenticated, navigate])

  // Pre-fill the SSO provider field with the detected one, without clobbering user edits.
  useEffect(() => {
    setSsoProvider((current) => current || detectedProvider)
  }, [detectedProvider])

  async function run(action: () => Promise<boolean>) {
    setError(null)
    setBusy(true)
    try {
      const ok = await action()
      if (!ok) setError('Échec de l’authentification. Vérifiez vos informations.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inattendue.')
    } finally {
      setBusy(false)
    }
  }

  function onSubmitCredentials(e: FormEvent) {
    e.preventDefault()
    void run(() => loginWithCredentials(username, password))
  }

  function onSubmitBearer(e: FormEvent) {
    e.preventDefault()
    void run(() => loginWithBearer(bearer))
  }

  return (
    <div className="center">
      <div className="login-topbar">
        <ThemeToggle />
      </div>
      <div className="card">
        <h1>Connexion Sinequa</h1>
        <p className="subtitle">Authentifiez-vous au backend Sinequa.</p>

        <div className="tabs">
          <button
            className={method === 'credentials' ? 'active' : ''}
            onClick={() => setMethod('credentials')}
          >
            Login / mot de passe
          </button>
          <button
            className={method === 'bearer' ? 'active' : ''}
            onClick={() => setMethod('bearer')}
          >
            Bearer token
          </button>
          <button
            className={method === 'sso' ? 'active' : ''}
            onClick={() => setMethod('sso')}
          >
            SSO
          </button>
        </div>

        {error && <p className="error">{error}</p>}

        {method === 'credentials' && (
          <form onSubmit={onSubmitCredentials}>
            <label htmlFor="username">Identifiant</label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <label htmlFor="password">Mot de passe</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        {method === 'bearer' && (
          <form onSubmit={onSubmitBearer}>
            <label htmlFor="bearer">Bearer token</label>
            <input
              id="bearer"
              value={bearer}
              onChange={(e) => setBearer(e.target.value)}
              placeholder="eyJhbGciOi…"
              required
            />
            <button className="primary" type="submit" disabled={busy}>
              {busy ? 'Connexion…' : 'Se connecter'}
            </button>
          </form>
        )}

        {method === 'sso' && (
          <div>
            <label htmlFor="provider">
              Provider {providerKind === 'saml' ? '(SAML)' : '(OAuth)'}
            </label>
            <input
              id="provider"
              value={ssoProvider}
              onChange={(e) => setSsoProvider(e.target.value)}
              placeholder={initializing ? 'Détection…' : 'identity_dev'}
            />
            <button
              className="primary"
              disabled={busy || initializing || !ssoProvider}
              onClick={() =>
                void run(() => loginWithSSO(ssoProvider, providerKind))
              }
            >
              {busy ? 'Redirection…' : `Se connecter via ${ssoProvider || 'SSO'}`}
            </button>
            {!initializing && !detectedProvider && (
              <p className="hint">
                Aucun provider détecté automatiquement. Saisissez-en un (ex.
                identity_dev) ou vérifiez VITE_SINEQUA_APP dans le fichier .env.
              </p>
            )}
            {detectedProvider && ssoProvider !== detectedProvider && (
              <p className="hint">
                Détecté : <code>{detectedProvider}</code> — surchargé par{' '}
                <code>{ssoProvider}</code>.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
