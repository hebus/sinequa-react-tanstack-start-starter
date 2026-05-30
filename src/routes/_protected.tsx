import { useEffect } from 'react'
import {
  createFileRoute,
  Link,
  Outlet,
  useNavigate,
} from '@tanstack/react-router'
import { useAuth } from '../auth/auth-context'
import { ThemeToggle } from '../theme/theme-context'

export const Route = createFileRoute('/_protected')({
  component: ProtectedLayout,
})

// Single auth guard shared by every child route. The check is client-side because
// the session lives in the browser (sessionStorage), so it runs after bootstrap.
function ProtectedLayout() {
  const navigate = useNavigate()
  const { initializing, authenticated, principal, signOut } = useAuth()

  useEffect(() => {
    if (!initializing && !authenticated) void navigate({ to: '/login' })
  }, [initializing, authenticated, navigate])

  if (initializing) {
    return (
      <div className="center">
        <p className="subtitle">Vérification de la session…</p>
      </div>
    )
  }

  if (!authenticated) return null // redirecting to /login

  return (
    <div className="layout">
      <nav className="topbar">
        <div className="nav-links">
          <Link to="/" activeOptions={{ exact: true }} className="nav-link">
            Accueil
          </Link>
          <Link to="/profile" className="nav-link">
            Profil
          </Link>
          <Link to="/search" className="nav-link">
            Recherche
          </Link>
        </div>
        <div className="nav-right">
          <span className="nav-user">
            {principal?.fullName || principal?.name || ''}
          </span>
          <ThemeToggle />
          <button className="ghost" onClick={() => void signOut()}>
            Se déconnecter
          </button>
        </div>
      </nav>
      <main className="content">
        <Outlet />
      </main>
    </div>
  )
}
