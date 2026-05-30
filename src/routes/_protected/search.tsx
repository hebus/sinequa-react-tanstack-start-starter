import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import {
  fetchApp,
  fetchPreview,
  fetchQuery,
  type Aggregation,
  type AggregationItem,
  type Article,
  type CCScope,
  type CCSortingChoice,
  type ExprFilter,
  type Filter,
  type InFilter,
  type PreviewData,
  type Query,
  type Result,
  type TreeAggregationNode,
} from '@sinequa/atomic'
import { Sheet } from '../../components/sheet'
import { PreviewPane } from '../../components/preview'
import { withReauth } from '../../auth/with-reauth'

export const Route = createFileRoute('/_protected/search')({
  component: SearchPage,
})

type Leaf = { field: string; value: string }

// Filter value for a facet item. Tree aggregations need a path pattern `/<path>/*`
// (matching everything under the node); list aggregations use the raw value.
function facetValue(agg: Aggregation, item: AggregationItem): string {
  if (agg.isTree) {
    const raw = String((item as { $path?: string }).$path ?? item.value ?? '')
    const trimmed = raw.replace(/^\/+|\/+$/g, '')
    return `/${trimmed}/*`
  }
  return String(item.value)
}

// Build query.filters from the selected facet values: group values of the same
// field into an `in` filter, then combine the fields with `and`. We always return
// an ExprFilter (an `and` of one is fine) — it maps directly onto query.filters.
function buildFilters(leaves: Leaf[]): ExprFilter | undefined {
  if (leaves.length === 0) return undefined

  const byField = new Map<string, string[]>()
  for (const l of leaves) {
    const list = byField.get(l.field) ?? []
    list.push(l.value)
    byField.set(l.field, list)
  }
  const perField: Filter[] = [...byField.entries()].map(([field, values]) => {
    if (values.length > 1) {
      const inFilter: InFilter = { field, operator: 'in', values }
      return inFilter
    }
    return { field, value: values[0] }
  })
  return { operator: 'and', filters: perField }
}

function SearchPage() {
  // App config: query web service name(s), sorting choices and scopes (CCQuery).
  const [queryNames, setQueryNames] = useState<string[]>([])
  const [queryName, setQueryName] = useState('')
  const [sortingChoices, setSortingChoices] = useState<CCSortingChoice[]>([])
  const [scopes, setScopes] = useState<CCScope[]>([])
  const [configError, setConfigError] = useState<string | null>(null)

  const [text, setText] = useState('')
  const [searchedText, setSearchedText] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [result, setResult] = useState<Result | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Query refinements.
  const [selected, setSelected] = useState<Leaf[]>([])
  const [tab, setTab] = useState('')
  const [sort, setSort] = useState('')
  const [scope, setScope] = useState('')

  // Tree facets: expansion state + lazily-loaded children, keyed by "aggName::path".
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [childrenByPath, setChildrenByPath] = useState<
    Record<string, TreeAggregationNode[]>
  >({})
  const [opening, setOpening] = useState<Set<string>>(new Set())

  // Preview sheet state.
  const [selectedDoc, setSelectedDoc] = useState<Article | null>(null)
  const [preview, setPreview] = useState<PreviewData | null>(null)
  const [previewBusy, setPreviewBusy] = useState(false)
  const [previewError, setPreviewError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    withReauth(() => fetchApp())
      .then((app) => {
        if (cancelled) return
        const names = Object.keys(app.queries ?? {})
        setQueryNames(names)
        const name = app.defaultQueryName || names[0] || ''
        setQueryName(name)
        const cfg = name ? app.queries?.[name] : undefined
        setSortingChoices(cfg?.sortingChoices ?? [])
        setScopes(cfg?.scopes ?? [])
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

  function makeQuery(p: {
    text: string
    page: number
    leaves: Leaf[]
    tab: string
    sort: string
    scope: string
  }): Query {
    return {
      name: queryName,
      text: p.text,
      page: p.page,
      pageSize,
      filters: buildFilters(p.leaves),
      tab: p.tab || undefined,
      scope: p.scope || undefined,
      sort: p.sort || undefined,
    }
  }

  // Single entry point: resolve overrides against current state, persist them, fetch.
  async function execute(
    over: Partial<{
      text: string
      page: number
      leaves: Leaf[]
      tab: string
      sort: string
      scope: string
    }>,
  ) {
    const q = {
      text: over.text ?? searchedText,
      page: over.page ?? 1,
      leaves: over.leaves ?? selected,
      tab: over.tab ?? tab,
      sort: over.sort ?? sort,
      scope: over.scope ?? scope,
    }
    if (!q.text.trim() || !queryName) return
    setBusy(true)
    setError(null)
    try {
      const res = await withReauth(() => fetchQuery(makeQuery(q)))
      setResult(res)
      setSearchedText(q.text)
      setSelected(q.leaves)
      setTab(q.tab)
      setSort(q.sort)
      setScope(q.scope)
      // Reset tree expansion: a new result set rebuilds the aggregations.
      setExpanded(new Set())
      setChildrenByPath({})
    } catch (err) {
      setError(err instanceof Error ? err.message : 'La recherche a échoué.')
      setResult(null)
    } finally {
      setBusy(false)
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault()
    void execute({ text, page: 1 })
  }

  function isSelected(agg: Aggregation, item: AggregationItem) {
    const value = facetValue(agg, item)
    return selected.some((l) => l.field === agg.column && l.value === value)
  }

  function toggleFacet(agg: Aggregation, item: AggregationItem) {
    const leaf: Leaf = { field: agg.column, value: facetValue(agg, item) }
    const exists = isSelected(agg, item)
    let leaves: Leaf[]
    if (exists) {
      leaves = selected.filter(
        (l) => !(l.field === leaf.field && l.value === leaf.value),
      )
    } else if (agg.isTree) {
      // Tree facets are single-select: one path per field, so replace any
      // existing selection on the same field (a single `/path/*` filter, no operator).
      leaves = [...selected.filter((l) => l.field !== leaf.field), leaf]
    } else {
      leaves = [...selected, leaf]
    }
    void execute({ leaves, page: 1 })
  }

  // ----- Tree aggregations -----
  function nodeKey(agg: Aggregation, node: TreeAggregationNode) {
    return `${agg.name}::${node.$path ?? node.value}`
  }

  function childrenOf(
    agg: Aggregation,
    node: TreeAggregationNode,
  ): TreeAggregationNode[] {
    if (node.items?.length) return node.items
    return childrenByPath[nodeKey(agg, node)] ?? []
  }

  function findNode(
    nodes: TreeAggregationNode[],
    path?: string,
  ): TreeAggregationNode | undefined {
    for (const n of nodes) {
      if ((n.$path ?? n.value) === path) return n
      if (n.items?.length) {
        const found = findNode(n.items, path)
        if (found) return found
      }
    }
    return undefined
  }

  // Lazily request a node's children via the `open` action (expression `col:/path/*`).
  async function openNode(agg: Aggregation, node: TreeAggregationNode) {
    const key = nodeKey(agg, node)
    setOpening((prev) => new Set(prev).add(key))
    try {
      const path = String(node.$path ?? node.value).replace(/^\/+|\/+$/g, '')
      const q: Query = {
        ...makeQuery({
          text: searchedText,
          page: result?.page ?? 1,
          leaves: selected,
          tab,
          sort,
          scope,
        }),
        action: 'open',
        // The path must be wrapped in backticks (it can contain spaces), e.g.
        // treepath:`/Documentation/Administration Interface/*`
        open: [{ aggregation: agg.name, expression: `${agg.column}:\`/${path}/*\`` }],
      }
      const res = await withReauth(() => fetchQuery(q))
      const opened = res.aggregations.find((a) => a.name === agg.name)
      const items = (opened?.items ?? []) as TreeAggregationNode[]
      const found = findNode(items, node.$path ?? node.value)
      const kids = found?.items?.length ? found.items : items
      setChildrenByPath((prev) => ({ ...prev, [key]: kids }))
    } catch {
      // ignore: the node stays collapsed
    } finally {
      setOpening((prev) => {
        const n = new Set(prev)
        n.delete(key)
        return n
      })
    }
  }

  function toggleExpand(agg: Aggregation, node: TreeAggregationNode) {
    const key = nodeKey(agg, node)
    const willOpen = !expanded.has(key)
    setExpanded((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
    if (willOpen) {
      const loaded =
        (node.items?.length ?? 0) > 0 || (childrenByPath[key]?.length ?? 0) > 0
      if (!loaded && node.hasChildren) void openNode(agg, node)
    }
  }

  function renderTreeNodes(
    agg: Aggregation,
    nodes: TreeAggregationNode[],
    level: number,
  ): ReactNode {
    return (
      <ul className="facet-tree">
        {nodes.map((node) => {
          const key = nodeKey(agg, node)
          const open = expanded.has(key)
          const kids = childrenOf(agg, node)
          const hasKids = !!node.hasChildren || kids.length > 0
          return (
            <li key={key}>
              <div className="facet-node" style={{ paddingLeft: level * 14 }}>
                {hasKids ? (
                  <button
                    className="tree-toggle"
                    onClick={() => toggleExpand(agg, node)}
                    aria-label={open ? 'Replier' : 'Déplier'}
                  >
                    {opening.has(key) ? '…' : open ? '▾' : '▸'}
                  </button>
                ) : (
                  <span className="tree-spacer" />
                )}
                <label>
                  <input
                    type="checkbox"
                    checked={isSelected(agg, node)}
                    onChange={() => toggleFacet(agg, node)}
                  />
                  <span className="facet-label">{node.display ?? node.value}</span>
                  <span className="facet-count">{node.count}</span>
                </label>
              </div>
              {open && kids.length > 0 && renderTreeNodes(agg, kids, level + 1)}
            </li>
          )
        })}
      </ul>
    )
  }

  // Load the next page of a (list) aggregation's values via the `aggregate` action:
  // query.aggregations = { [name]: { skip, count } }. We append the returned values.
  async function loadMore(agg: Aggregation) {
    const skip = agg.items?.length ?? 0
    const count = 10
    try {
      const q: Query = {
        ...makeQuery({
          text: searchedText,
          page: result?.page ?? 1,
          leaves: selected,
          tab,
          sort,
          scope,
        }),
        action: 'aggregate',
        aggregations: { [agg.name]: { skip, count } },
      }
      const res = await withReauth(() => fetchQuery(q))
      const more = res.aggregations.find((a) => a.name === agg.name)
      const newItems = more?.items ?? []
      setResult((prev) =>
        prev
          ? {
              ...prev,
              aggregations: prev.aggregations.map((a) =>
                a.name === agg.name
                  ? {
                      ...a,
                      items: [...a.items, ...newItems],
                      $hasMore: newItems.length >= count,
                    }
                  : a,
              ),
            }
          : prev,
      )
    } catch {
      // ignore: keep the already-displayed values
    }
  }

  async function openPreview(record: Article) {
    setSelectedDoc(record)
    setPreview(null)
    setPreviewError(null)
    setPreviewBusy(true)
    try {
      setPreview(
        await withReauth(() =>
          fetchPreview(record.id, { name: queryName, text: searchedText }),
        ),
      )
    } catch (err) {
      setPreviewError(
        err instanceof Error ? err.message : "Impossible de charger l'aperçu.",
      )
    } finally {
      setPreviewBusy(false)
    }
  }

  const totalPages = result
    ? Math.max(1, Math.ceil(result.rowCount / result.pageSize))
    : 1

  return (
    <div className="page page-wide">
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
            if (searchedText) void execute({ page: 1 })
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

      {result && result.tabs?.length > 1 && (
        <div className="tabs-bar">
          {result.tabs.map((t) => (
            <button
              key={t.name}
              className={`tab${result.tab === t.name ? ' active' : ''}`}
              onClick={() => void execute({ tab: t.name, page: 1 })}
            >
              {t.display || t.name} ({t.count})
            </button>
          ))}
        </div>
      )}

      {result && (
        <div className="search-layout">
          <aside className="facets">
            {selected.length > 0 && (
              <button
                className="ghost facet-clear"
                onClick={() => void execute({ leaves: [], page: 1 })}
              >
                Effacer les filtres ({selected.length})
              </button>
            )}
            {result.aggregations
              .filter((agg) => agg.items?.length)
              .map((agg) => (
                <section className="facet" key={agg.name}>
                  <h4>{agg.name}</h4>
                  {agg.isTree ? (
                    renderTreeNodes(
                      agg,
                      agg.items as TreeAggregationNode[],
                      0,
                    )
                  ) : (
                    <ul className="facet-list">
                      {agg.items.map((item) => (
                        <li key={String(item.value)}>
                          <label>
                            <input
                              type="checkbox"
                              checked={isSelected(agg, item)}
                              onChange={() => toggleFacet(agg, item)}
                            />
                            <span className="facet-label">
                              {item.display ?? String(item.value)}
                            </span>
                            <span className="facet-count">{item.count}</span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!agg.isTree && agg.$hasMore && (
                    <button
                      className="facet-more"
                      onClick={() => void loadMore(agg)}
                    >
                      Voir plus
                    </button>
                  )}
                </section>
              ))}
          </aside>

          <div className="results-col">
            <div className="result-toolbar">
              <span className="result-count">
                {result.rowCount} résultat(s) — affichage de{' '}
                {result.records.length}.
              </span>
              <div className="toolbar-controls">
                {scopes.length > 0 && (
                  <select
                    value={scope}
                    onChange={(e) => void execute({ scope: e.target.value, page: 1 })}
                    aria-label="Périmètre"
                  >
                    <option value="">Tout le périmètre</option>
                    {scopes.map((s) => (
                      <option key={s.name} value={s.name}>
                        {s.display || s.name}
                      </option>
                    ))}
                  </select>
                )}
                {sortingChoices.length > 0 && (
                  <select
                    value={sort || result.sort || ''}
                    onChange={(e) => void execute({ sort: e.target.value, page: 1 })}
                    aria-label="Tri"
                  >
                    {sortingChoices.map((c) => (
                      <option key={c.name} value={c.name}>
                        {c.display || c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

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
                      // Sinequa returns highlight markup (<b>…</b>) in relevant extracts.
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
                  onClick={() => void execute({ page: result.page - 1 })}
                >
                  ← Précédent
                </button>
                <span className="page-info">
                  Page {result.page} / {totalPages}
                </span>
                <button
                  className="ghost"
                  disabled={busy || result.page >= totalPages}
                  onClick={() => void execute({ page: result.page + 1 })}
                >
                  Suivant →
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <Sheet
        open={selectedDoc !== null}
        onClose={() => setSelectedDoc(null)}
        title={selectedDoc?.title}
      >
        <PreviewPane
          preview={preview}
          record={selectedDoc}
          busy={previewBusy}
          error={previewError}
        />
      </Sheet>
    </div>
  )
}
