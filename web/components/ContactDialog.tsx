'use client'
import { useEffect, useState } from 'react'

/**
 * Enquiry form for the Agency tier, until Stripe is live on the Greek entity.
 *
 * A form rather than a mailto: mailto opens whatever client the machine has
 * configured (often nothing), loses the submission entirely, and gives us no
 * record. This lands in contact_requests.
 */
export default function ContactDialog({
  open,
  onClose,
  plan,
}: {
  open: boolean
  onClose: () => void
  plan: string
}) {
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open, onClose])

  useEffect(() => { if (open) { setDone(false); setError(null) } }, [open])

  if (!open) return null

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    const fd = new FormData(e.currentTarget)
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: fd.get('name'),
          email: fd.get('email'),
          company: fd.get('company'),
          phone: fd.get('phone'),
          message: fd.get('message'),
          website: fd.get('website'), // honeypot
          plan,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (d.ok) { setDone(true); return }
      setError('Κάτι πήγε στραβά. Δοκιμάστε ξανά ή γράψτε μας απευθείας.')
    } catch {
      setError('Κάτι πήγε στραβά. Δοκιμάστε ξανά ή γράψτε μας απευθείας.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="ct-scrim" onClick={onClose} />
      <div className="ct-dialog" role="dialog" aria-modal="true" aria-label="Επικοινωνία">
        {done ? (
          <div className="ct-done">
            <div className="ct-done-title">Ευχαριστούμε!</div>
            <p>Λάβαμε το αίτημά σας και θα επικοινωνήσουμε μαζί σας εντός μίας εργάσιμης.</p>
            <button className="btn btn-primary" onClick={onClose}>Κλείσιμο</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div className="ct-head">
              <div>
                <div className="ct-title">Ας μιλήσουμε</div>
                <div className="ct-sub">
                  Πείτε μας λίγα λόγια και σας ενεργοποιούμε το πλάνο Agency.
                </div>
              </div>
              <button type="button" className="ct-close" onClick={onClose} aria-label="Κλείσιμο">×</button>
            </div>

            <div className="ct-fields">
              <label className="ct-field">
                <span>Ονοματεπώνυμο *</span>
                <input name="name" required maxLength={120} autoComplete="name" />
              </label>
              <label className="ct-field">
                <span>Email *</span>
                <input name="email" type="email" required maxLength={200} autoComplete="email" />
              </label>
              <label className="ct-field">
                <span>Εταιρεία</span>
                <input name="company" maxLength={200} autoComplete="organization" />
              </label>
              <label className="ct-field">
                <span>Τηλέφωνο *</span>
                <input name="phone" type="tel" required maxLength={60} autoComplete="tel" />
              </label>
              <label className="ct-field ct-field-wide">
                <span>Τι ψάχνετε;</span>
                <textarea name="message" rows={3} maxLength={2000}
                  placeholder="π.χ. πουλάμε λογισμικό σε λογιστικά γραφεία στην Αττική" />
              </label>
            </div>

            {/* Honeypot — hidden from people, filled by bots. */}
            <input
              name="website" tabIndex={-1} autoComplete="off" aria-hidden="true"
              style={{ position: 'absolute', left: '-9999px', width: 1, height: 1 }}
            />

            {error && <div className="ct-error">{error}</div>}

            <div className="ct-actions">
              <button type="button" className="btn btn-ghost" onClick={onClose}>Άκυρο</button>
              <button type="submit" className="btn btn-primary" disabled={busy}>
                {busy ? 'Αποστολή…' : 'Αποστολή'}
              </button>
            </div>
          </form>
        )}
      </div>
    </>
  )
}
