'use client'
import { useState } from 'react'

// Renders the real favicon (proxied through /api/favicon/[ar_gemi], since the
// R2 bucket holding it isn't public) when one's on file, otherwise renders
// the caller's letter-avatar fallback unchanged. Callers keep owning their
// own initials/color logic (SearchPage.tsx and CompanyPage.tsx each already
// have their own getInitials/logoColor) — this only owns the img-vs-fallback
// decision, including falling back on a broken/expired image load.
export default function CompanyFavicon({
  arGemi,
  hasFavicon,
  fallback,
  className,
  style,
  version,
}: {
  arGemi: string
  hasFavicon: boolean
  fallback: React.ReactNode
  className?: string
  style?: React.CSSProperties
  // Bumped by FaviconPickerButton after a manual save, so the browser doesn't
  // keep serving the old image from under the route's 1-year immutable cache.
  version?: number
}) {
  const [errored, setErrored] = useState(false)
  if (!hasFavicon || errored) return <>{fallback}</>
  return (
    <img
      src={`/api/favicon/${arGemi}${version ? `?v=${version}` : ''}`}
      alt=""
      className={className}
      style={{ objectFit: 'contain', background: '#fff', ...style }}
      onError={() => setErrored(true)}
      loading="lazy"
    />
  )
}
