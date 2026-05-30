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
