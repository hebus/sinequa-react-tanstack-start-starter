import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Article, PreviewData } from '@sinequa/atomic'

function cssEsc(s: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(s) : s
}

/**
 * The markup of highlight markers in the cached preview HTML is server-dependent.
 * Rather than guess a fixed selector, we auto-detect it: we tally every class and
 * (non-trivial) attribute used in the iframe and keep the signature whose element
 * count is closest to the known number of highlights. The ranked candidates are
 * logged to the console so the selector can be confirmed or pinned.
 */
const IGNORED_ATTRS = new Set([
  'id', 'class', 'style', 'href', 'src', 'alt', 'title', 'width', 'height',
  'target', 'rel', 'type', 'name', 'value', 'colspan', 'rowspan', 'lang', 'dir',
])

// Colors used both for the in-iframe per-category highlight and the legend swatches.
const HL_PALETTE = [
  '#6366f1', '#34d399', '#fbbf24', '#f472b6',
  '#38bdf8', '#fb923c', '#a78bfa', '#f87171',
]

// The backend returns i18n KEYS (e.g. "msg#metadata.companyPluralLabel") in
// categoryDisplayLabel*, which the full SBA resolves via its translation bundle.
// Without that pipeline we map the known category keys to readable labels and
// fall back to a prettified key otherwise.
const CAT_LABELS: Record<string, string> = {
  company: 'Sociétés',
  person: 'Personnes',
  geo: 'Lieux',
  matchingpassages: 'Passages pertinents',
  matchlocations: 'Termes recherchés',
  extractslocations: 'Extraits',
}

function looksLikeI18nKey(s?: string): boolean {
  return !s || /msg#|metadata\.|label$/i.test(s)
}

function prettyCategory(key: string, rawLabel?: string): string {
  if (CAT_LABELS[key]) return CAT_LABELS[key]
  if (rawLabel && !looksLikeI18nKey(rawLabel)) return rawLabel
  return key.charAt(0).toUpperCase() + key.slice(1)
}

type SelCandidate = { sel: string; count: number }

function rankCandidates(fdoc: Document, expected: number): SelCandidate[] {
  const root = fdoc.body ?? fdoc.documentElement
  const all = root ? Array.from(root.querySelectorAll<HTMLElement>('*')) : []
  const classCount = new Map<string, number>()
  const attrCount = new Map<string, number>()
  for (const el of all) {
    el.classList.forEach((c) => classCount.set(c, (classCount.get(c) ?? 0) + 1))
    for (const a of Array.from(el.attributes)) {
      if (!IGNORED_ATTRS.has(a.name)) {
        attrCount.set(a.name, (attrCount.get(a.name) ?? 0) + 1)
      }
    }
  }
  const esc = (fdoc.defaultView as Window & typeof globalThis)?.CSS?.escape
    ?? ((s: string) => s)
  const cands: SelCandidate[] = []
  classCount.forEach((count, c) => cands.push({ sel: '.' + esc(c), count }))
  attrCount.forEach((count, a) => cands.push({ sel: '[' + esc(a) + ']', count }))
  return cands
    .filter((c) => c.count > 0)
    .sort(
      (x, y) => Math.abs(x.count - expected) - Math.abs(y.count - expected),
    )
}

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

type PreviewPaneProps = {
  preview: PreviewData | null
  record: Article | null
  busy: boolean
  error: string | null
}

export function PreviewPane({ preview, record, busy, error }: PreviewPaneProps) {
  const frameRef = useRef<HTMLIFrameElement>(null)
  const styleRef = useRef<HTMLStyleElement | null>(null)
  const allMarkersRef = useRef<HTMLElement[]>([])
  const byCatRef = useRef<Map<string, HTMLElement[]>>(new Map())
  const [detectVersion, setDetectVersion] = useState(0)
  const [catCounts, setCatCounts] = useState<Record<string, number>>({})
  const [cursors, setCursors] = useState<Record<string, number>>({})
  const [detected, setDetected] = useState(false)
  const [frameAccessible, setFrameAccessible] = useState(true)

  const doc = preview?.record ?? record
  const total = preview?.highlightsPerLocation?.length ?? 0
  const categories = useMemo(
    () => (preview ? Object.entries(preview.highlightsPerCategory ?? {}) : []),
    [preview],
  )
  const catKeys = useMemo(() => categories.map(([k]) => k), [categories])
  const colorOf = (key: string) =>
    HL_PALETTE[Math.max(0, catKeys.indexOf(key)) % HL_PALETTE.length]
  const catTotal = categories.reduce(
    (n, [, c]) =>
      n + (c.values ?? []).reduce((m, v) => m + (v.locations?.length ?? 0), 0),
    0,
  )
  const displayTotal = total || catTotal

  // Active categories: all on by default, reset when the document changes.
  const [active, setActive] = useState<Set<string>>(new Set())
  useEffect(() => {
    setActive(new Set(catKeys))
  }, [catKeys])

  function toggleCat(key: string) {
    setActive((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Navigate within a single category's occurrences (one cursor per category).
  function gotoCat(key: string, delta: number) {
    if (!active.has(key)) return
    const list = byCatRef.current.get(key) ?? []
    if (!list.length) return
    const cur = cursors[key] ?? -1
    const i =
      cur < 0
        ? delta > 0
          ? 0
          : list.length - 1
        : (cur + delta + list.length) % list.length
    allMarkersRef.current.forEach((el) => el.classList.remove('sqx-active'))
    list[i].classList.add('sqx-active')
    list[i].scrollIntoView({ behavior: 'smooth', block: 'center' })
    setCursors((prev) => ({ ...prev, [key]: i }))
  }

  // Re-color the document when the active set or a fresh detection changes.
  // Disabled categories simply lose their highlight background.
  useEffect(() => {
    if (!catKeys.length) return
    const style = styleRef.current
    if (style) {
      const rules = catKeys
        .filter((k) => active.has(k))
        .map((k) => `.${cssEsc(k)}{background:${colorOf(k)}55;border-radius:2px}`)
        .join('')
      style.textContent =
        rules +
        `.sqx-active{outline:2px solid #f43f5e;background:rgba(244,63,94,.30);outline-offset:1px}`
    }
    allMarkersRef.current.forEach((el) => el.classList.remove('sqx-active'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, detectVersion])

  // Same-origin (proxy) => we can read/decorate the iframe document.
  function onFrameLoad() {
    const fdoc = frameRef.current?.contentDocument ?? null
    if (!fdoc) {
      setFrameAccessible(false)
      setDetected(false)
      allMarkersRef.current = []
      byCatRef.current = new Map()
      setCatCounts({})
      return
    }
    setFrameAccessible(true)
    setCursors({})

    const expected = total
    let els: HTMLElement[] = []
    const byCat = new Map<string, HTMLElement[]>()

    // Markers carry their category as a CSS class (the highlightsPerCategory keys,
    // e.g. .company, .geo, .matchingpassages). That union is the authoritative
    // selector and lets us group each marker by its category.
    if (catKeys.length) {
      const sel = catKeys.map((k) => '.' + cssEsc(k)).join(',')
      try {
        els = Array.from(fdoc.querySelectorAll<HTMLElement>(sel))
      } catch {
        els = []
      }
      for (const el of els) {
        const cat = catKeys.find((k) => el.classList.contains(k))
        if (!cat) continue
        const list = byCat.get(cat) ?? []
        list.push(el)
        byCat.set(cat, list)
      }
    }

    // Fallback heuristic if the category classes match nothing (uniform color, no nav).
    let fallbackRule = ''
    if (!els.length) {
      const ranked = rankCandidates(fdoc, expected)
      console.debug('[preview] fallback selector candidates:', ranked.slice(0, 8))
      const best = ranked[0]
      if (
        best &&
        best.count > 0 &&
        (expected === 0 ||
          (best.count >= expected * 0.5 && best.count <= expected * 1.5))
      ) {
        try {
          els = Array.from(fdoc.querySelectorAll<HTMLElement>(best.sel))
        } catch {
          els = []
        }
        fallbackRule = `${best.sel}{background:${HL_PALETTE[0]}55;border-radius:2px}`
      }
    }

    allMarkersRef.current = els
    byCatRef.current = byCat
    const counts: Record<string, number> = {}
    byCat.forEach((list, k) => (counts[k] = list.length))
    setCatCounts(counts)
    setDetected(els.length > 0)

    styleRef.current?.remove()
    if (els.length) {
      const style = fdoc.createElement('style')
      if (fallbackRule) {
        style.textContent =
          fallbackRule +
          `.sqx-active{outline:2px solid #f43f5e;background:rgba(244,63,94,.30);outline-offset:1px}`
      }
      fdoc.head?.appendChild(style)
      styleRef.current = style
    } else {
      styleRef.current = null
    }
    setDetectVersion((v) => v + 1)
  }

  return (
    <>
      {doc && <DocMeta doc={doc} />}

      {preview && (
        <details className="meta-details hl-details" open>
          <summary>Surlignages · {displayTotal} correspondance(s)</summary>
          <div className="hl-bar">
            {((!detected && frameAccessible) || !frameAccessible) && (
              <span className="hl-note">
                {!frameAccessible
                  ? 'Aperçu cross-origin : navigation indisponible.'
                  : 'Localisation des marqueurs en cours…'}
              </span>
            )}
            <div className="hl-rows">
            {categories.map(([key, cat]) => {
              const dataCount = (cat.values ?? []).reduce(
                (n, v) => n + (v.locations?.length ?? 0),
                0,
              )
              if (!dataCount) return null
              const on = active.has(key)
              const n = catCounts[key] ?? dataCount
              const cur = cursors[key] ?? -1
              const navDisabled = !on || !detected || n === 0
              return (
                <div className="hl-row" key={key}>
                  <button
                    type="button"
                    className={`hl-chip${on ? '' : ' off'}`}
                    onClick={() => toggleCat(key)}
                    aria-pressed={on}
                    title={
                      on ? 'Masquer cette catégorie' : 'Afficher cette catégorie'
                    }
                  >
                    <span
                      className="hl-swatch"
                      style={{ background: on ? colorOf(key) : 'var(--muted)' }}
                    />
                    {prettyCategory(
                      key,
                      cat.categoryDisplayLabelPlural || cat.categoryDisplayLabel,
                    )}
                  </button>
                  <div className="hl-rownav">
                    <button
                      className="ghost"
                      disabled={navDisabled}
                      onClick={() => gotoCat(key, -1)}
                      aria-label={`Occurrence précédente (${key})`}
                    >
                      ⟨
                    </button>
                    <span className="hl-counter">
                      {cur < 0 ? '·' : cur + 1} / {n}
                    </span>
                    <button
                      className="ghost"
                      disabled={navDisabled}
                      onClick={() => gotoCat(key, 1)}
                      aria-label={`Occurrence suivante (${key})`}
                    >
                      ⟩
                    </button>
                  </div>
                </div>
              )
            })}
            </div>
          </div>
        </details>
      )}

      {busy && <p className="sheet-status">Chargement de l'aperçu…</p>}
      {error && <p className="sheet-status error">{error}</p>}
      {preview && (
        <iframe
          ref={frameRef}
          className="preview-frame"
          src={preview.documentCachedContentUrl}
          title="Aperçu du document"
          onLoad={onFrameLoad}
        />
      )}
    </>
  )
}
