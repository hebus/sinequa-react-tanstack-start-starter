# 2. Facettes, agrégations, tri, onglets & scopes

La réponse de `fetchQuery()` ne contient pas que des documents : elle embarque aussi les
**agrégations** (facettes), les **onglets** et l'info de **tri**. Ce chapitre montre comment
les exploiter pour enrichir la page de recherche.

## 2.1 Ce que renvoie `Result`

```ts
type Result = {
  records: Article[]
  aggregations: (Aggregation | TreeAggregation)[] // facettes
  tabs: Tab[]                                      // onglets
  tab: string                                      // onglet courant
  sort: string                                     // tri courant
  page: number; pageSize: number; rowCount: number
  // …
}
```

Et côté **requête**, `Query` accepte les leviers correspondants :

```ts
type Query = {
  name: string
  text?: string
  filters?: Filter | Filter[] | ExprFilter // filtres issus des facettes (voir §2.3)
  tab?: string        // onglet sélectionné
  scope?: string      // périmètre
  sort?: string       // choix de tri
  page?: number
  pageSize?: number
  // …
}
```

> ⚠️ Il existe aussi un champ `select?: Select[]` (expressions `colonne:\`valeur\``). C'est
> l'**ancienne** API de filtrage : préférez désormais **`query.filters`** (objets `Filter`
> structurés, voir §2.3).

> 💡 **Le principe général** : on garde la `Query` courante en état, on **modifie un champ**
> (`filters`, `tab`, `sort`, `scope`), on **repart en page 1** et on rappelle `fetchQuery`.
> Le `Result` renvoie l'état réel (onglet/tri retenus, nouveaux comptes de facettes).

## 2.2 Afficher les facettes (agrégations)

```ts
type Aggregation = {
  name: string      // nom de l'agrégation (clé)
  column: string    // colonne d'index sous-jacente
  items: AggregationItem[]
  isTree?: boolean  // agrégation arbre (affichage hiérarchique, voir §2.7)
  $hasMore?: boolean
}
type AggregationItem = {
  value: string | number | boolean | null
  display?: string
  count: number
  $selected?: boolean
}
```

```tsx
function Facets({
  result,
  onToggle,
}: {
  result: Result
  onToggle: (agg: Aggregation, item: AggregationItem) => void
}) {
  return (
    <div className="facets">
      {result.aggregations.map((agg) => (
        <section key={agg.name}>
          <h3>{agg.name}</h3>
          <ul>
            {agg.items.map((item) => (
              <li key={String(item.value)}>
                <label>
                  <input
                    type="checkbox"
                    checked={!!item.$selected}
                    onChange={() => onToggle(agg, item)}
                  />
                  {item.display ?? String(item.value)} ({item.count})
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
```

## 2.3 Filtrer via les facettes : `query.filters`

La façon **actuelle** de filtrer est `query.filters` — des objets **`Filter`** structurés
(et non plus des expressions `select`). Les briques :

```ts
// Un filtre « feuille »
type Filter = { field?: string; operator?: FilterOperator; value?: string | number | boolean }
// Plusieurs valeurs pour un même champ (OU)
type InFilter = { field: string; operator: 'in'; values: string[] }
// Un nœud combinant des filtres
type ExprFilter = { operator: 'and' | 'or' | 'not'; filters: Filter[] }
```

Le `field` est la **colonne** de l'agrégation (`agg.column`), la `value` celle de l'item.

```tsx
// Une sélection de facette = un filtre feuille { field, value }.
// ⚠️ Agrégation ARBRE (agg.isTree) : la valeur doit être un motif de chemin `/<chemin>/*`
// (le nœud + tout ce qu'il contient). Sinon, la valeur brute de l'item.
function facetValue(agg: Aggregation, item: AggregationItem): string {
  if (agg.isTree) {
    const path = String((item as { $path?: string }).$path ?? item.value ?? '')
    return `/${path.replace(/^\/+|\/+$/g, '')}/*`
  }
  return String(item.value)
}

function filterFor(agg: Aggregation, item: AggregationItem): Filter {
  return { field: agg.column, value: facetValue(agg, item) }
}

// On accumule les filtres, regroupés par champ, et on combine le tout en AND.
function buildFilters(selected: Filter[]): ExprFilter | Filter | undefined {
  if (selected.length === 0) return undefined
  if (selected.length === 1) return selected[0]

  // Regrouper les valeurs d'un même champ en un InFilter (OU intra-facette),
  // puis combiner les champs entre eux en AND.
  const byField = new Map<string, string[]>()
  for (const f of selected) {
    const list = byField.get(f.field!) ?? []
    list.push(String(f.value))
    byField.set(f.field!, list)
  }
  const perField: Filter[] = [...byField.entries()].map(([field, values]) =>
    values.length > 1
      ? ({ field, operator: 'in', values } as InFilter)
      : ({ field, value: values[0] } as Filter),
  )
  return perField.length === 1 ? perField[0] : { operator: 'and', filters: perField }
}

// Ajouter / retirer une sélection puis relancer en page 1 :
function onToggle(agg: Aggregation, item: AggregationItem) {
  setSelected((prev) => {
    const f = filterFor(agg, item)
    const exists = prev.some((p) => p.field === f.field && p.value === f.value)
    const next = exists
      ? prev.filter((p) => !(p.field === f.field && p.value === f.value))
      : [...prev, f]
    // runSearch ré-appelle fetchQuery({ ..., filters: buildFilters(next), page: 1 })
    return next
  })
}
```

> 💡 **Facette arbre = sélection unique.** On ne sélectionne qu'**un seul** nœud d'une
> facette `treepath` à la fois : cocher un nœud **remplace** la sélection précédente sur ce
> champ. Le filtre est alors un simple `{ field: 'treepath', value: '/<chemin>/*' }` — pas
> besoin d'opérateur ni de combinaison.

> 💡 **Combinaisons** : `{ operator: 'and', filters: [...] }` pour croiser plusieurs facettes,
> `{ field, operator: 'in', values: [...] }` pour plusieurs valeurs d'une même facette (OU),
> `{ operator: 'not', filters: [...] }` pour exclure. Opérateurs scalaires dispos sur une
> feuille : `eq` (défaut), `neq`, `gt/gte/lt/lte`, `like`, `contains`, `regex`, `null`, `notnull` ;
> plages : `in`, `between` (`{ field, operator: 'between', start, end }`).

> ⚠️ **`query.select` est l'ancienne API** (expressions `colonne:\`valeur\``). Elle existe
> encore mais `query.filters` (objets `Filter`) est la voie recommandée aujourd'hui.

## 2.4 « Voir plus » sur une facette : action `aggregate`

Une agrégation ne renvoie qu'un nombre limité de valeurs. Pour charger la suite, on relance
la **même requête** avec `action: 'aggregate'` et `aggregations: { [nom]: { skip, count } }`
(`skip` = nombre de valeurs déjà affichées), puis on **ajoute** les valeurs renvoyées.

```tsx
async function loadMore(agg: Aggregation) {
  const skip = agg.items?.length ?? 0
  const count = 10
  const q: Query = {
    ...currentQuery, // name, text, filters, tab, sort, scope…
    action: 'aggregate',
    aggregations: { [agg.name]: { skip, count } }, // clé = NOM de l'agrégation
  }
  const res = await fetchQuery(q)
  const more = res.aggregations.find((a) => a.name === agg.name)
  const newItems = more?.items ?? []
  // Fusion : items existants + nouveaux ; plus de pages si on a reçu une page pleine.
  updateAggregation(agg.name, (a) => ({
    ...a,
    items: [...a.items, ...newItems],
    $hasMore: newItems.length >= count,
  }))
}
```

> 💡 **`fetchAggregation()` ≠ « voir plus ».** Cette fonction de la lib sert à **récupérer
> une agrégation** (en obtenir les valeurs), pas à paginer la suite d'une facette déjà
> affichée. Pour le « voir plus », relancez la requête en `action: 'aggregate'` via
> `fetchQuery` (avec `{ [nom]: { skip, count } }`) comme ci-dessus.

## 2.5 Onglets (`tabs`)

```ts
type Tab = { name: string; display: string; value: string; count: number }
```

```tsx
<div className="tabs-bar">
  {result.tabs.map((t) => (
    <button
      key={t.name}
      className={result.tab === t.name ? 'active' : ''}
      onClick={() => runSearch(searchedText, 1, { tab: t.name })}
    >
      {t.display} ({t.count})
    </button>
  ))}
</div>
```

> 💡 Changer d'onglet **réinitialise la pagination** : repartez en page 1. Les facettes et le
> `rowCount` se recalculent pour l'onglet choisi.

## 2.6 Tri & périmètre (scope)

- **Tri** : `query.sort = '<nom du choix de tri>'` (défini côté app, `CCSortingChoice`).
- **Scope** : `query.scope = '<nom du scope>'` (`CCScope`) restreint le périmètre interrogé.

```tsx
<select
  value={result.sort}
  onChange={(e) => runSearch(searchedText, 1, { sort: e.target.value })}
>
  <option value="relevance">Pertinence</option>
  <option value="date">Date</option>
</select>
```

> 💡 **Centralisez** : faites de `runSearch` une fonction qui fusionne un patch de `Query`
> (`{ tab }`, `{ sort }`, `{ filters }`, `{ scope }`) dans la requête courante, force `page: 1`,
> puis appelle `fetchQuery`. Vous obtenez facettes, onglets, tri et scope **cohérents** d'un
> seul point d'entrée.

## 2.7 Facettes de type arbre (affichage hiérarchique)

Une agrégation `isTree` (ex. `treepath`) n'est pas une liste plate : ses `items` sont des
**`TreeAggregationNode`** imbriqués.

```ts
type TreeAggregationNode = {
  value: string
  display?: string
  count: number
  hasChildren?: boolean       // a des enfants même si `items` n'est pas encore peuplé
  items: TreeAggregationNode[] // enfants (chargés à la demande)
  $path?: string              // chemin complet, calculé par la lib après fetchQuery
  $level?: number
}
```

On la **rend récursivement** (indentation par niveau) avec un chevron déplier/replier sur les
nœuds qui ont des enfants. Les enfants se chargent **à la demande** via l'action `open` :

```tsx
async function openNode(agg: Aggregation, node: TreeAggregationNode) {
  const path = String(node.$path ?? node.value).replace(/^\/+|\/+$/g, '')
  const res = await fetchQuery({
    ...currentQuery,
    action: 'open',
    // ⚠️ chemin entre BACKTICKS (il peut contenir des espaces) :
    open: [{ aggregation: agg.name, expression: `${agg.column}:\`/${path}/*\`` }],
  })
  // La réponse renvoie l'arbre complet depuis la racine, avec le nœud ouvert
  // dont les `items` sont peuplés. On retrouve le nœud par $path et on greffe ses items.
  const opened = res.aggregations.find((a) => a.name === agg.name)
  const found = findNodeByPath(opened?.items ?? [], node.$path)
  attachChildren(node, found?.items ?? [])
}
```

> ⚠️ **Backticks obligatoires** autour du chemin dans l'`expression` :
> `` treepath:`/Documentation/Administration Interface/*` `` — sans eux, un chemin contenant
> des espaces casse la requête.

> 💡 **Sélection unique** (rappel §2.3) : une facette arbre ne sélectionne **qu'un seul** nœud
> à la fois ; cocher un nœud remplace la sélection précédente sur le champ, avec un filtre
> `{ field: 'treepath', value: '/<chemin>/*' }` (sans opérateur).

## 2.8 Implémentation de référence

Tout le chapitre **est implémenté** dans `src/routes/_protected/search.tsx` :
- panneau de facettes (liste **et** arbre), filtrage via `query.filters`, « Effacer les filtres » ;
- « Voir plus » (action `aggregate`), onglets (`result.tabs`), tri (`CCSortingChoice`),
  périmètre (`CCScope`) ;
- un **point d'entrée unique** `execute(overrides)` qui fusionne l'état courant
  (`text/filters/tab/sort/scope/page`), repart en page 1 (sauf pagination) et relance `fetchQuery`.
