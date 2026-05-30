import { Fragment } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useAuth } from '../../auth/auth-context'

export const Route = createFileRoute('/_protected/profile')({
  component: ProfilePage,
})

function ProfilePage() {
  const { principal } = useAuth()

  if (!principal) {
    return (
      <div className="page">
        <h1>Profil</h1>
        <p className="subtitle">Aucune information principal disponible.</p>
      </div>
    )
  }

  const fields: Array<[string, string]> = [
    ['Nom complet', principal.fullName],
    ['Nom', principal.name],
    ['Nom long', principal.longName],
    ['Identifiant (userId)', principal.userId],
    ['Id', principal.id],
    ['Email', principal.email],
    ['Administrateur', principal.isAdministrator ? 'Oui' : 'Non'],
    ['Admin délégué', principal.isDelegatedAdmin ? 'Oui' : 'Non'],
  ]

  return (
    <div className="page">
      <h1>Profil</h1>
      <p className="subtitle">Informations du compte (principal Sinequa).</p>

      <dl className="kv">
        {fields
          .filter(([, value]) => value !== undefined && value !== '')
          .map(([label, value]) => (
            <Fragment key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </Fragment>
          ))}
      </dl>

      <details className="raw">
        <summary>Voir l'objet principal complet (JSON)</summary>
        <pre>{JSON.stringify(principal, null, 2)}</pre>
      </details>
    </div>
  )
}
