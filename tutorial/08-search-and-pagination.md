# 8. Recherche & pagination

La page `/search` découvre le **nom du web service de query** via `fetchApp()`, lance la
recherche avec `fetchQuery()`, affiche les résultats et les **pagine**.

## 8.1 Trouver le nom de la query : `fetchApp()`

`fetchQuery` a besoin d'un `name` (le web service de query configuré sur l'app). On ne le
code pas en dur : on lit la config applicative.

- `fetchApp()` → objet `CCApp`.
- `CCApp.queries` est un `Record<string, CCQuery>` (clé = nom de query).
- `CCApp.defaultQueryName` donne la query par défaut.

```tsx
const app = await fetchApp()
const names = Object.keys(app.queries ?? {})
const queryName = app.defaultQueryName || names[0] || ''
```

## 8.2 Lancer une recherche : `fetchQuery()`

`fetchQuery(query)` poste sur `/api/v1/query` et renvoie un `Result` :

- `result.records: Article[]` — les documents ;
- `result.page`, `result.pageSize`, `result.rowCount` — la pagination.

> 💡 **`pageSize` est personnalisable.** On le pilote via un `<select>` (« N / page ») et on
> le passe à `fetchQuery({ …, pageSize })`. Une valeur par défaut existe côté serveur
> (`CCQuery.pageSize`). **Astuce robustesse** : la pagination se calcule **depuis la réponse**
> (`result.page`, `result.pageSize`, `result.rowCount`) — donc même si le serveur **borne** la
> taille demandée, l'UI reste cohérente.

## 8.3 `src/routes/_protected/search.tsx` (recherche + pagination)

> _Le composant ci-dessous inclut aussi la **preview** (chapitre 9) et le panneau de
> **métadonnées** ; ils sont détaillés au chapitre suivant. On se concentre ici sur la
> recherche et la pagination._

```tsx
import { Fragment, useEffect, useState, type FormEvent } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchApp,
  fetchPreview,
  fetchQuery,
  type Article,
  type PreviewData,
  type Result,
} from '@sinequa/atomic'
import { Sheet } from '../../components/sheet'

export const Route = createFileRoute('/_protected/search')({
  component: SearchPage,
})

function SearchPage() {
  // Query web service name(s) from the app config (CCApp.queries / defaultQueryName).
  const [queryNames, setQueryNames] = useState<string[]>([])
  const [queryName, setQueryName] = useState('')
  const [configError, setConfigError] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [searchedText, setSearchedText] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preview sheet state (see next chapter).
  const [selected, setSelected] = useState<Article | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetchApp()
      .then((app) => {
        if (cancelled) return
        const names = Object.keys(app.queries ?? {})
        setQueryNames(names)
        setQueryName(app.defaultQueryName || names[0] || '')
      })
      .catch((err) => {
        if (!cancelled)
          setConfigError(
            err instanceof Error
              ? err.message
              : "Impossible de charger la configuration de l'app.",
          )
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function runSearch(query: string, page: number, size = pageSize) {
    if (!query.trim() || !queryName) return
    setBusy(true)
    setError(null)
    try {
      // pageSize is passed explicitly (chosen via the dropdown); the response still drives
      // the pagination math below, in case the server clamps the requested size.
      setResult(
        await fetchQuery({ name: queryName, text: query, page, pageSize: size }),
      )
      setSearchedText(query)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La recherche a échoué.')
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void runSearch(text, 1)
  }

  async function openPreview(record: Article) {
    setSelected(record)
    setPreview(null)
    setPreviewError(null)
    setPreviewBusy(true)
    try {
      setPreview(await fetchPreview(record.id, { name: queryName, text }))
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Impossible de charger l'aperçu.",
      )
    } finally {
      setPreviewBusy(false)
    }
  }

  return (
    <div className="page">
      <h1>Recherche</h1>
      <p className="subtitle">
        {queryName ? (
          <>
            Interroge le web service <code>{queryName}</code> du backend Sinequa.
          </>
        ) : (
          'Chargement de la configuration…'
        )}
      </p>

      {configError && <p className="error">{configError}</p>}

      <form className="search-form" onSubmit={onSubmit}>
        {queryNames.length > 1 && (
          <select
            value={queryName}
            onChange={(e) => setQueryName(e.target.value)}
            aria-label="Web service de query"
          >
            {queryNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          value={pageSize}
          onChange={(e) => {
            const size = Number(e.target.value)
            setPageSize(size)
            if (searchedText) void runSearch(searchedText, 1, size)
          }}
          aria-label="Résultats par page"
        >
          {[10, 20, 50, 100].map((n) => (
            <option key={n} value={n}>
              {n} / page
            </option>
          ))}
        </select>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Rechercher…"
          aria-label="Recherche"
        />
        <button className="primary" type="submit" disabled={busy || !queryName}>
          {busy ? 'Recherche…' : 'Rechercher'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {result && (
        <>
          <p className="result-count">
            {result.rowCount} résultat(s) — affichage de {result.records.length}.
          </p>
          <ul className="results">
            {result.records.map((record) => (
              <li className="result" key={record.id}>
                <button
                  className="result-link"
                  onClick={() => void openPreview(record)}
                >
                  {record.title}
                </button>
                {record.relevantExtracts && (
                  <p
                    className="extract"
                    dangerouslySetInnerHTML={{ __html: record.relevantExtracts }}
                  />
                )}
                <div className="result-footer">
                  {record.treepath?.[0] && (
                    <span className="path">{record.treepath[0]}</span>
                  )}
                  {record.originalUrl && (
                    <a
                      className="result-external"
                      href={record.originalUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ouvrir l'original ↗
                    </a>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {result.rowCount > result.pageSize && (
            <div className="pagination">
              <button
                className="ghost"
                disabled={busy || result.page <= 1}
                onClick={() => void runSearch(searchedText, result.page - 1)}
              >
                ← Précédent
              </button>
              <span className="page-info">
                Page {result.page} /{' '}
                {Math.max(1, Math.ceil(result.rowCount / result.pageSize))}
              </span>
              <button
                className="ghost"
                disabled={
                  busy ||
                  result.page >= Math.ceil(result.rowCount / result.pageSize)
                }
                onClick={() => void runSearch(searchedText, result.page + 1)}
              >
                Suivant →
              </button>
            </div>
          )}
        </>
      )}

      {/* Le panneau de preview est détaillé au chapitre 9 */}
    </div>
  )
}
```

## 8.4 Décryptage de la pagination

- **`runSearch(query, page, size)`** centralise l'appel. `onSubmit` appelle `runSearch(text, 1)`
  → une nouvelle recherche repart toujours en **page 1**.
- **Taille de page** : le `<select>` « N / page » met à jour `pageSize` et **relance** la
  recherche en page 1 avec la nouvelle taille (on passe `size` explicitement pour éviter le
  décalage dû à l'asynchronisme de `setState`).
- **`searchedText`** mémorise le terme **réellement recherché**, distinct de la saisie en
  cours (`text`). La pagination réinterroge sur `searchedText` → éditer le champ ne perturbe
  pas la navigation entre pages.
- **Nombre de pages** = `ceil(result.rowCount / result.pageSize)`. Les boutons se désactivent
  aux bornes et pendant le chargement.
- Les contrôles ne s'affichent que si `rowCount > pageSize` (plus d'une page).

## 8.5 Affichage des résultats

- **Titre** → bouton qui ouvre la preview (chapitre 9).
- **`relevantExtracts`** : extrait avec surlignage HTML (`<b>…</b>`) → rendu via
  `dangerouslySetInnerHTML`.
- **Lien « Ouvrir l'original ↗ »** : `record.originalUrl`, en action secondaire.

> 💡 **Sécurité de `dangerouslySetInnerHTML`** : on injecte ici le surlignage renvoyé par un
> backend de confiance. Si vos sources ne le sont pas, assainissez le HTML.

Chapitre suivant : la **preview** d'un document dans un panneau latéral, avec ses métadonnées.
