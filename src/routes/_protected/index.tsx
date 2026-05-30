import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuth } from '../../auth/auth-context'

export const Route = createFileRoute('/_protected/')({
  component: HomePage,
})

function HomePage() {
  const { principal } = useAuth()

  return (
    <div className="page">
      <span className="badge">✓ Authentifié</span>
      <h1>Bienvenue{principal?.fullName ? `, ${principal.fullName}` : ''}</h1>
      <p className="subtitle">Vous êtes connecté au backend Sinequa.</p>

      <div className="cards">
        <Link to="/profile" className="link-card">
          <h2>Profil</h2>
          <p>Voir les informations de votre compte (principal).</p>
        </Link>
        <Link to="/search" className="link-card">
          <h2>Recherche</h2>
          <p>Interroger l'index Sinequa.</p>
        </Link>
      </div>
    </div>
  )
}
