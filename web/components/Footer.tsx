import BrandMark from './BrandMark'
import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <BrandMark size={18} />
          <span className="footer-brand-name">GREEKLEADS</span>
        </div>
        <div className="footer-links">
          <Link href="/pricing" className="footer-link">Pricing</Link>
          <span className="footer-link">Privacy</span>
          <span className="footer-link">Terms</span>
          <span className="footer-link">Contact</span>
        </div>
        <span className="footer-copy">
          © {new Date().getFullYear()} GreekLeads · Data sourced from ΓΕΜΗ
        </span>
      </div>
    </footer>
  )
}
