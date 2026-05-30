# 9. Preview d'un document (sheet + iframe + métadonnées)

Au clic sur un résultat, on ouvre un **panneau latéral (« sheet »)** qui glisse de droite à
gauche, affiche les **métadonnées** du document puis sa **preview HTML** dans une `<iframe>`.

## 9.1 L'API : `fetchPreview()`

```tsx
const preview = await fetchPreview(record.id, { name: queryName, text })
// preview.documentCachedContentUrl  -> URL HTML à charger dans une <iframe>
// preview.record                    -> Article (métadonnées, plus complet)
```

`fetchPreview(id, query)` poste sur `/api/v1/preview` et renvoie un `PreviewData` :

```ts
type PreviewData = {
  record: Article
  resultId: string
  cacheId: string
  highlightsPerCategory: HighlightDataPerCategory
  highlightsPerLocation: HighlightDataPerLocation[]
  documentCachedContentUrl: string  // ← l'URL de la preview HTML
  conversions: Conversion[]
}
```

> 💡 **Pourquoi l'iframe fonctionne en mode proxy** : `documentCachedContentUrl` est servi en
> **same-origin** (`https://localhost:4200/...` via le proxy), donc le **cookie de session**
> part avec la requête de l'iframe. La doc recommande l'iframe (isole styles/scripts du
> document). Alternative : `fetchPreviewUrl()` pour récupérer le HTML et l'injecter soi-même.

> ⚠️ Si le backend renvoie une URL **absolue** (vers `su-sba.demo.sinequa.com`), l'iframe
> charge en **cross-origin** et le cookie peut ne pas passer (aperçu vide). Solution : ajouter
> une règle de proxy correspondante ou réécrire l'URL en relatif.

## 9.2 Le composant Sheet — `src/components/sheet.tsx`

```tsx
import { useEffect, type ReactNode } from 'react'

type SheetProps = {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
}

/**
 * Generic panel that slides in from the right. Always mounted so the close
 * animation can play; pointer events are disabled while closed.
 */
export function Sheet({ open, onClose, title, children }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  return (
    <div className={`sheet-root${open ? ' open' : ''}`} aria-hidden={!open}>
      <div className="sheet-overlay" onClick={onClose} />
      <aside className="sheet-panel" role="dialog" aria-modal="true">
        <header className="sheet-header">
          <h2 className="sheet-title">{title}</h2>
          <button className="ghost" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <div className="sheet-body">{children}</div>
      </aside>
    </div>
  )
}
```

> 💡 **Toujours monté.** Le sheet reste dans le DOM (fermé : `pointer-events:none` + panneau
> translaté hors écran), ce qui permet d'**animer aussi la fermeture**. L'animation se fait
> en CSS (`transform: translateX(100%) → 0`), voir chapitre Thème/styles.

## 9.3 Métadonnées + iframe (dans `search.tsx`)

Le panneau de métadonnées `DocMeta` est **repliable** (`<details>`/`<summary>`) avec une
**animation fluide** (voir §9.4). Helpers de formatage et composant :

```tsx
function formatBytes(n?: number): string | undefined {
  if (!n || n <= 0) return undefined
  const units = ['o', 'Ko', 'Mo', 'Go', 'To']
  let value = n
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`
}

function formatDate(s?: string): string | undefined {
  if (!s) return undefined
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? s : d.toLocaleString('fr-FR')
}

// Document metadata panel shown above the preview iframe.
function DocMeta({ doc }: { doc: Article }) {
  const rows: Array<[string, string | undefined]> = [
    ['Auteurs', doc.authors?.length ? doc.authors.join(', ') : undefined],
    ['Modifié', formatDate(doc.modified)],
    ['Indexé', formatDate(doc.indexationtime)],
    ['Taille', formatBytes(doc.size)],
    ['Format', doc.docformat || doc.fileext || undefined],
    ['Type', doc.doctype],
    [
      'Langue(s)',
      doc.documentlanguages?.length
        ? doc.documentlanguages.join(', ')
        : undefined,
    ],
    ['Version', doc.version],
    ['Collection', doc.collection?.[0]],
    ['Index', doc.databasealias],
    ['Chemin', doc.treepath?.length ? doc.treepath.join(' / ') : undefined],
  ]
  const shown = rows.filter(([, v]) => v)
  if (!shown.length) return null

  return (
    <details className="meta-details" open>
      <summary>Métadonnées</summary>
      <dl className="meta">
        {shown.map(([label, value]) => (
          <Fragment key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </Fragment>
        ))}
      </dl>
    </details>
  )
}
```

Et le `Sheet` rendu à la fin de `SearchPage` :

```tsx
<Sheet
  open={selected !== null}
  onClose={() => setSelected(null)}
  title={selected?.title}
>
  {(preview?.record ?? selected) && (
    <DocMeta doc={preview?.record ?? selected!} />
  )}
  {previewBusy && <p className="sheet-status">Chargement de l'aperçu…</p>}
  {previewError && <p className="sheet-status error">{previewError}</p>}
  {preview && (
    <iframe
      className="preview-frame"
      src={preview.documentCachedContentUrl}
      title="Aperçu du document"
    />
  )}
</Sheet>
```

- **Source des métadonnées** : `preview.record` (le plus complet, renvoyé par `fetchPreview`)
  avec **repli** sur le record de recherche `selected` tant que la preview charge.
- N'affiche que les champs **présents** (filtre `shown`).

## 9.4 Animer un `<details>` natif (collapse ⇄ expand fluide)

Un `<details>` natif n'anime pas par défaut. L'approche moderne : la pseudo-classe
`::details-content` + `interpolate-size: allow-keywords` (qui autorise l'animation jusqu'à une
hauteur `auto`).

```css
:root {
  interpolate-size: allow-keywords; /* anime to/from `auto` */
}

.meta-details > summary { cursor: pointer; list-style: none; /* … */ }
.meta-details > summary::-webkit-details-marker { display: none; }
.meta-details > summary::before { content: '▸'; transition: transform 0.28s ease; }
.meta-details[open] > summary::before { transform: rotate(90deg); }

.meta-details::details-content {
  block-size: 0;
  overflow: clip;
  transition:
    block-size 0.28s ease,
    content-visibility 0.28s ease allow-discrete;
}
.meta-details[open]::details-content { block-size: auto; }
```

> 💡 **Support & dégradation** : `interpolate-size` et `::details-content` sont supportés par
> Chrome/Edge récents. Sur un navigateur qui ne les gère pas, le panneau bascule
> **instantanément** (toujours fonctionnel) — dégradation propre. Le chevron, lui, s'anime
> partout via `transform`.

Chapitre suivant : le **thème clair/sombre**.
