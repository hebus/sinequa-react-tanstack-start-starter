# 1. Mise en évidence avancée dans la preview (`highlightsPerLocation`)

Au chapitre « Preview » du tutoriel principal, on affichait `documentCachedContentUrl` dans
une `<iframe>`. Mais `fetchPreview()` renvoie bien plus : des **données de surlignage
structurées** qui permettent de construire une **légende par catégorie**, un **compteur de
correspondances** et une **navigation précédent/suivant** entre les occurrences.

## 1.1 Le modèle de données

`fetchPreview(id, query)` renvoie un `PreviewData` :

```ts
type PreviewData = {
  record: Article
  resultId: string
  cacheId: string
  highlightsPerCategory: HighlightDataPerCategory   // { [category]: CategoryHighlightData }
  highlightsPerLocation: HighlightDataPerLocation[]  // occurrences, ordonnées dans le doc
  documentCachedContentUrl: string
  conversions: Conversion[]
}
```

Deux vues complémentaires des **mêmes** surlignages :

**a) Par catégorie** — pour une légende / des filtres.

```ts
type HighlightDataPerCategory = Record<string, CategoryHighlightData>

type CategoryHighlightData = {
  categoryDisplayLabel: string         // ex. "Société"
  categoryDisplayLabelPlural: string   // ex. "Sociétés"
  categoryFilterAllLabel: string
  categoryFilterNoneLabel: string
  values: HighlightValue[]
}

type HighlightValue = {
  value: string          // valeur normalisée (clé)
  displayValue: string   // libellé affichable
  locations: Location[]  // toutes les positions de cette valeur
}

type Location = { start: number; enclosingLength: number }
```

**b) Par position** — pour la navigation occurrence par occurrence.

```ts
type HighlightDataPerLocation = {
  start: number                              // position dans le texte du document
  length: number
  values: string[]                           // valeurs présentes à cette position
  displayValue: string
  positionInCategories: Record<string, number> // index de cette occurrence au sein de chaque catégorie
}
```

> 💡 **`highlightsPerLocation` est déjà ordonné** par position dans le document : c'est la
> liste idéale pour un « ⟨ précédent / suivant ⟩ » et pour un compteur « 3 / 47 ».
> `positionInCategories` permet en plus un compteur **par catégorie** (« Société 2/8 »).

## 1.2 Deux usages, deux niveaux d'effort

| Usage | Source | Touche à l'iframe ? |
|---|---|---|
| **Légende + compteurs** (catégories, totaux) | `highlightsPerCategory` / `highlightsPerLocation` | Non — pur React |
| **Coloration & navigation dans le document** | + le HTML de la preview | Oui — via l'iframe |

Le premier est **robuste et sans dépendance** au balisage. Le second nécessite d'accéder au
contenu de l'iframe (voir §1.4).

## 1.3 Légende & compteur (sans toucher à l'iframe)

```tsx
function HighlightLegend({ preview }: { preview: PreviewData }) {
  const total = preview.highlightsPerLocation.length
  const categories = Object.entries(preview.highlightsPerCategory)

  if (!total) return null

  return (
    <div className="hl-legend">
      <span className="hl-total">{total} correspondance(s)</span>
      <ul>
        {categories.map(([key, cat]) => {
          // nombre d'occurrences de la catégorie = somme des locations de ses valeurs
          const count = cat.values.reduce((n, v) => n + v.locations.length, 0)
          return (
            <li key={key}>
              <span className="hl-swatch" data-cat={key} />
              {cat.categoryDisplayLabelPlural || cat.categoryDisplayLabel} : {count}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
```

On peut l'insérer dans le `Sheet`, juste sous le panneau de métadonnées.

## 1.4 Accéder au contenu de l'iframe (clé : même origine)

Comme la preview passe par le **proxy** (`https://localhost:4200/...`), l'iframe est en
**same-origin** : le parent peut donc lire `iframe.contentDocument`. C'est ce qui rend la
coloration et la navigation possibles.

```tsx
const frameRef = useRef<HTMLIFrameElement>(null)

function onFrameLoad() {
  const doc = frameRef.current?.contentDocument
  if (!doc) return // null si cross-origin (voir l'avertissement plus bas)
  // … injecter du style et repérer les marqueurs ici …
}

// <iframe ref={frameRef} onLoad={onFrameLoad} src={preview.documentCachedContentUrl} … />
```

> ⚠️ **Cross-origin = accès bloqué.** Si `documentCachedContentUrl` est une URL **absolue**
> vers le serveur Sinequa (et non relative via le proxy), `contentDocument` vaut `null` et
> toute lecture lève une `SecurityError`. Garder la preview **same-origin** (proxy) est donc
> indispensable pour cette fonctionnalité — voir le chapitre « Preview » du tutoriel principal.

## 1.5 Le bon sélecteur : la classe = la catégorie

Bonne nouvelle : sur un backend Sinequa, le HTML de preview marque chaque occurrence avec un
élément dont **la classe CSS est le nom de sa catégorie** — exactement les **clés de
`highlightsPerCategory`** (`.company`, `.geo`, `.person`, `.matchingpassages`,
`.matchlocations`, `.extractslocations`…). Inutile de deviner : on construit le sélecteur à
partir des clés, et on **groupe** chaque marqueur par catégorie.

```tsx
const catKeys = Object.keys(preview.highlightsPerCategory ?? {})
const sel = catKeys.map((k) => '.' + CSS.escape(k)).join(',')
const els = Array.from(fdoc.querySelectorAll<HTMLElement>(sel))

const byCat = new Map<string, HTMLElement[]>()
for (const el of els) {
  const cat = catKeys.find((k) => el.classList.contains(k))
  if (cat) (byCat.get(cat) ?? byCat.set(cat, []).get(cat)!).push(el)
}
```

Comme chaque marqueur porte sa catégorie, on peut **colorer par catégorie** (et assortir les
pastilles de la légende) en injectant un `<style>` dans l'iframe :

```tsx
const PALETTE = ['#6366f1', '#34d399', '#fbbf24', '#f472b6', '#38bdf8', '#fb923c']
const rules = catKeys
  .map((k, i) => `.${CSS.escape(k)}{background:${PALETTE[i % PALETTE.length]}55;border-radius:2px}`)
  .join('')
const style = fdoc.createElement('style')
style.textContent = rules + `.sqx-active{outline:2px solid #f43f5e}`
fdoc.head.appendChild(style)
```

## 1.6 Activer/désactiver & naviguer **par catégorie**

Deux contrôles par catégorie, dans la légende :

1. **Toggle afficher/masquer** : on garde un `Set` des catégories actives ; masquer une
   catégorie = ne plus émettre sa règle de couleur (on reconstruit le `<style>`). Le document
   est ainsi moins encombré.
2. **Une paire de flèches ⟨ ⟩ par catégorie** : un **curseur indépendant par catégorie**
   parcourt uniquement les occurrences de cette catégorie (`byCat.get(key)`).

```tsx
const [active, setActive] = useState<Set<string>>(new Set(catKeys))
const [cursors, setCursors] = useState<Record<string, number>>({})

function gotoCat(key: string, delta: number) {
  if (!active.has(key)) return
  const list = byCatRef.current.get(key) ?? []
  if (!list.length) return
  const cur = cursors[key] ?? -1
  const i = cur < 0 ? (delta > 0 ? 0 : list.length - 1)
                    : (cur + delta + list.length) % list.length
  allMarkersRef.current.forEach((el) => el.classList.remove('sqx-active'))
  list[i].classList.add('sqx-active')
  list[i].scrollIntoView({ behavior: 'smooth', block: 'center' })
  setCursors((prev) => ({ ...prev, [key]: i }))
}
```

Côté rendu, chaque ligne combine le toggle et sa mini-navigation :

```tsx
<div className="hl-row">
  <button className={`hl-chip${on ? '' : ' off'}`} onClick={() => toggleCat(key)}>
    <span className="hl-swatch" style={{ background: on ? color : 'var(--muted)' }} />
    {label}
  </button>
  <div className="hl-rownav">
    <button disabled={!on} onClick={() => gotoCat(key, -1)}>⟨</button>
    <span>{cur < 0 ? '·' : cur + 1} / {count}</span>
    <button disabled={!on} onClick={() => gotoCat(key, 1)}>⟩</button>
  </div>
</div>
```

> 💡 **Naviguer une seule catégorie** : il suffit de désactiver les autres — ou, avec les
> flèches par catégorie, d'utiliser directement la paire de la catégorie voulue.

## 1.7 Le piège des libellés : ce sont des clés i18n

Les champs `categoryDisplayLabel` / `categoryDisplayLabelPlural` ne contiennent **pas** un
libellé prêt à afficher, mais une **clé de traduction** (ex. `msg#metadata.companyPluralLabel`,
`metadata.geo_plural_label`). La SBA complète les résout via son **bundle i18n** ; sans ce
pipeline, on les mappe nous-mêmes :

```tsx
const CAT_LABELS: Record<string, string> = {
  company: 'Sociétés', person: 'Personnes', geo: 'Lieux',
  matchingpassages: 'Passages pertinents', matchlocations: 'Termes recherchés',
  extractslocations: 'Extraits',
}
const looksLikeI18nKey = (s?: string) => !s || /msg#|metadata\.|label$/i.test(s)

function prettyCategory(key: string, raw?: string): string {
  if (CAT_LABELS[key]) return CAT_LABELS[key]
  if (raw && !looksLikeI18nKey(raw)) return raw
  return key.charAt(0).toUpperCase() + key.slice(1)
}
```

## 1.8 Pièges & dégradation

> ⚠️ **Same-origin obligatoire** pour lire/modifier l'iframe (cf. §1.4) : tout passe par le
> proxy, comme pour le cookie de session.

> ⚠️ **Tout reconstruire à chaque document.** `onLoad` se déclenche à chaque nouvelle preview :
> re-scannez les marqueurs, réinitialisez les curseurs, et réactivez toutes les catégories.

> 💡 **Repli si pas de catégories.** Si `highlightsPerCategory` est vide (autre serveur), la
> démo retombe sur une **heuristique** : elle scanne le DOM, compte les éléments par classe /
> attribut et retient la signature dont le total est le plus proche de
> `highlightsPerLocation.length` (journalisé en console). La coloration reste uniforme et la
> nav par catégorie est désactivée.

## 1.9 Implémentation de référence

Tout ceci **est implémenté** dans l'application : `src/components/preview.tsx`
(composant `PreviewPane`), utilisé dans le `Sheet` de la page `/search`. La **légende +
compteurs** fonctionnent uniquement à partir des données (`highlightsPer*`), tandis que la
**coloration + navigation** décorent l'iframe (same-origin).
