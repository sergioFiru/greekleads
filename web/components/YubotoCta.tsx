'use client'
import { useEffect, useState } from 'react'
import Image from 'next/image'

/**
 * "Ξεκινήστε καμπάνια" — email outreach to a CRM list, powered by Yuboto.
 *
 * Not "Επικοινωνήστε μαζί τους": that reads as one phone call to one company,
 * which is the opposite of what a prospect list is for. The verb has to say
 * campaign.
 *
 * Replaces the two dead Instantly/HubSpot buttons. Those were placeholders for
 * integrations nobody had agreed to; Yuboto is a real partner.
 *
 * Styling deliberately uses OUR tokens (--accent and the sp-btn family), not
 * Yuboto's brand gradient. A partner logo belongs in our interface; a partner's
 * colour scheme does not — it makes the product look like someone else's.
 * Yuboto appears as their mark plus their name, which is how a partnership
 * should read.
 */

function YubotoMark({ size = 18 }: { size?: number }) {
  return (
    <Image
      src="/yuboto-mark.png"
      alt="Yuboto"
      width={size}
      height={size}
      className="yb-mark"
      unoptimized
    />
  )
}

export default function YubotoCta({
  emailCount,
  listName,
}: {
  emailCount: number
  listName: string
}) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', h)
    return () => document.removeEventListener('keydown', h)
  }, [open])

  const fmt = (n: number) => n.toLocaleString('el-GR')

  return (
    <>
      <button className="sp-btn sp-btn-primary yb-cta" onClick={() => setOpen(true)}>
        <YubotoMark size={20} />
        Ξεκινήστε καμπάνια
        {emailCount > 0 && <span className="yb-cta-count">{fmt(emailCount)}</span>}
      </button>

      {open && (
        <>
          <div className="yb-scrim" onClick={() => setOpen(false)} />
          <div className="yb-dialog" role="dialog" aria-modal="true" aria-label="Καμπάνιες email με Yuboto">
            <div className="yb-head">
              <YubotoMark size={34} />
              <div>
                <div className="yb-title">Καμπάνιες email με Yuboto</div>
                <div className="yb-sub">Από τη λίστα στην καμπάνια, χωρίς εξαγωγή αρχείων</div>
              </div>
              <button className="yb-close" onClick={() => setOpen(false)} aria-label="Κλείσιμο">×</button>
            </div>

            <div className="yb-reach">
              <span className="yb-reach-n">{fmt(emailCount)}</span>
              <span className="yb-reach-l">
                επαφές με email στη λίστα «{listName}»
              </span>
            </div>

            <p className="yb-body">
              Στέλνετε την καμπάνια απευθείας από το πελατολόγιό σας. Οι επαφές
              συγχρονίζονται αυτόματα — όταν η λίστα μεγαλώνει, μεγαλώνει και το
              κοινό σας.
            </p>

            <ul className="yb-points">
              <li>Σχεδιασμός και αποστολή email καμπανιών</li>
              <li>Αυτοματισμοί και σειρές follow-up</li>
              <li>Στατιστικά ανοιγμάτων και κλικ ανά επαφή</li>
              <li>Συμμόρφωση με GDPR και διαχείριση opt-out</li>
            </ul>

            <div className="yb-foot">
              <span className="yb-soon">Σε ανάπτυξη</span>
              <span className="yb-foot-note">
                Σε συνεργασία με τη Yuboto · 19 χρόνια στις επιχειρησιακές επικοινωνίες
              </span>
            </div>
          </div>
        </>
      )}
    </>
  )
}
