'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import BrandMark from './BrandMark'

const links = [
  { href: '/',        label: 'Αρχική' },
  { href: '/search',  label: 'Εταιρείες' },
  { href: '/people',  label: 'Στελέχη' },
  { href: '/pricing', label: 'Τιμές' },
]

export default function TopNav({ totalCompanies }: { totalCompanies?: number }) {
  const path = usePathname()

  return (
    <nav className="topnav">
      <Link href="/" className="brand" style={{ textDecoration: 'none' }}>
        <span className="brand-mark"><BrandMark size={20} /></span>
        <span className="brand-word">GreekLeads</span>
      </Link>

      <div className="nav-links">
        {links.map(l => (
          <Link
            key={l.href}
            href={l.href}
            className="nav-link"
            data-active={path === l.href || (l.href !== '/' && path.startsWith(l.href)) ? 'true' : 'false'}
          >
            {l.label}
          </Link>
        ))}
      </div>

      <div className="nav-spacer" />

      {totalCompanies != null && (
        <div className="nav-live">
          <span className="mono" style={{ color: 'var(--nav-text-active)', fontSize: 12 }}>
            {totalCompanies.toLocaleString('el-GR')}
          </span>
          <span>εταιρείες</span>
          <div className="nav-divider" />
          <span>ΓΕΜΗ</span>
          <span className="nav-live-dot" />
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginLeft: 16 }}>
        <Link href="/sign-in" className="btn btn-nav" style={{ fontWeight: 600, color: '#16233B' }}>Σύνδεση</Link>
        <Link href="/sign-up" className="btn btn-primary btn-cta" style={{ padding: '9px 16px', fontSize: 13.5 }}>
          Δοκιμάστε δωρεάν
        </Link>
      </div>
    </nav>
  )
}
