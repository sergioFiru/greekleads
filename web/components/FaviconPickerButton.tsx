'use client'
import { useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Icon from './Icon'

// Dev-only tool: lets you manually override a firm's favicon (paste an image
// URL or upload a file), bypassing the auto-scraper. Built to hand-fix the
// shared-domain favicon mess (see scripts/one_time/cleanup_shared_domain_favicons.py)
// firm-by-firm while curating. Not shown in production — see the NODE_ENV
// guard both here and in the API route (app/api/favicon/[ar_gemi]/route.ts).
export default function FaviconPickerButton({
  arGemi,
  onSaved,
}: {
  arGemi: string
  onSaved: () => void
}) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [url, setUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  if (process.env.NODE_ENV === 'production') return null

  function toggleOpen() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
    }
    setOpen(o => !o)
  }

  async function save(body: FormData) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/favicon/${arGemi}`, { method: 'POST', body })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Απέτυχε')
        return
      }
      setOpen(false)
      setUrl('')
      onSaved()
    } catch {
      setError('Απέτυχε')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        className="sp-action-btn"
        title="Επιλογή favicon (dev)"
        onClick={toggleOpen}
      >
        <Icon name="image" size={14} />
      </button>

      {open && pos && createPortal(
        <>
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 1000 }}
            onClick={() => setOpen(false)}
            onWheel={() => setOpen(false)}
          />
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: 'fixed', top: pos.top, right: pos.right, zIndex: 1001,
              width: 260, background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 10, boxShadow: '0 8px 24px rgba(22, 35, 59, 0.14)', padding: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: 'var(--text-primary)' }}>
              Επιλογή favicon
            </div>

            <form
              onSubmit={e => {
                e.preventDefault()
                if (!url.trim()) return
                const fd = new FormData()
                fd.set('url', url.trim())
                save(fd)
              }}
              style={{ display: 'flex', gap: 6 }}
            >
              <input
                type="url"
                placeholder="https://..."
                value={url}
                onChange={e => setUrl(e.target.value)}
                style={{
                  flex: 1, minWidth: 0, fontSize: 12, padding: '6px 8px',
                  border: '1px solid var(--border)', borderRadius: 6,
                }}
              />
              <button type="submit" className="btn btn-primary" disabled={saving || !url.trim()} style={{ fontSize: 12, padding: '6px 10px' }}>
                OK
              </button>
            </form>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '10px 0', color: 'var(--text-muted)', fontSize: 11 }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              ή
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              style={{ display: 'none' }}
              onChange={e => {
                const file = e.target.files?.[0]
                if (!file) return
                const fd = new FormData()
                fd.set('file', file)
                save(fd)
              }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => fileInputRef.current?.click()}
              disabled={saving}
              style={{ width: '100%', justifyContent: 'center', fontSize: 12, padding: '6px 10px' }}
            >
              Ανέβασμα αρχείου
            </button>

            {saving && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Αποθήκευση…</div>}
            {error && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 8 }}>{error}</div>}
          </div>
        </>,
        document.body
      )}
    </div>
  )
}
