interface IconProps {
  name: string
  size?: number
  stroke?: number
  style?: React.CSSProperties
  className?: string
}

export default function Icon({ name, size = 16, stroke = 1.5, style, className }: IconProps) {
  const p = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: 'currentColor', strokeWidth: stroke,
    strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
    style, className,
  }
  switch (name) {
    case 'search':    return <svg {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-3.5-3.5"/></svg>
    case 'x':        return <svg {...p}><path d="M6 6l12 12M18 6L6 18"/></svg>
    case 'chevron-down': return <svg {...p}><path d="M6 9l6 6 6-6"/></svg>
    case 'chevron-right': return <svg {...p}><path d="M9 6l6 6-6 6"/></svg>
    case 'download': return <svg {...p}><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>
    case 'filter':   return <svg {...p}><path d="M4 5h16M7 12h10M10 19h4"/></svg>
    case 'check':    return <svg {...p}><path d="M5 12l5 5L20 7"/></svg>
    case 'lock':     return <svg {...p}><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/></svg>
    case 'building': return <svg {...p}><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h2M13 16h2"/></svg>
    case 'mail':     return <svg {...p}><rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M3 7l9 6 9-6"/></svg>
    case 'phone':    return <svg {...p}><path d="M5 4h3l2 5-2.5 1.5a11 11 0 005 5L14 13l5 2v3a2 2 0 01-2 2A14 14 0 013 6a2 2 0 012-2z"/></svg>
    case 'globe':    return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18"/><path d="M12 3a14 14 0 000 18"/></svg>
    case 'verified': return <svg {...p}><path d="M12 3l7 4v6c0 4-3 6.5-7 8-4-1.5-7-4-7-8V7l7-4z"/><path d="M9 12l2 2 4-4"/></svg>
    case 'arrow-right': return <svg {...p}><path d="M5 12h14M12 5l7 7-7 7"/></svg>
    case 'trend-up': return <svg {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></svg>
    case 'eye':          return <svg {...p}><path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.5"/></svg>
    case 'chevron-left': return <svg {...p}><path d="M15 6l-6 6 6 6"/></svg>
    case 'more':         return <svg {...p}><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none"/></svg>
    case 'bookmark':     return <svg {...p}><path d="M6 4h12v17l-6-3.5L6 21V4z"/></svg>
    case 'settings':     return <svg {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3h.1a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8v.1a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/></svg>
    case 'table':        return <svg {...p}><rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M3 9h18M9 4v16"/></svg>
    case 'users':        return <svg {...p}><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
    case 'arrow-up-right': return <svg {...p}><path d="M7 17L17 7M7 7h10v10"/></svg>
    case 'map-pin':    return <svg {...p}><path d="M12 2C8.7 2 6 4.7 6 8c0 5.3 6 13 6 13s6-7.7 6-13c0-3.3-2.7-6-6-6z"/><circle cx="12" cy="8" r="2"/></svg>
    case 'compass':    return <svg {...p}><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5L13.3 13.3L8.5 15.5L10.7 10.7Z" fill="currentColor" stroke="none"/></svg>
    case 'grid':       return <svg {...p}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    case 'tag':        return <svg {...p}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/></svg>
    case 'share':      return <svg {...p}><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>

    // ── Brand icons (filled) ────────────────────────────────────
    case 'instagram': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    )
    case 'facebook': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    )
    case 'linkedin': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    )
    case 'twitter-x': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    )
    case 'tiktok': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
      </svg>
    )
    case 'youtube': return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="none" style={style} className={className}>
        <path d="M23.495 6.205a3.007 3.007 0 0 0-2.088-2.088c-1.87-.501-9.396-.501-9.396-.501s-7.507-.01-9.396.501A3.007 3.007 0 0 0 .527 6.205a31.247 31.247 0 0 0-.522 5.805 31.247 31.247 0 0 0 .522 5.783 3.007 3.007 0 0 0 2.088 2.088c1.868.502 9.396.502 9.396.502s7.506 0 9.396-.502a3.007 3.007 0 0 0 2.088-2.088 31.247 31.247 0 0 0 .5-5.783 31.247 31.247 0 0 0-.5-5.805zM9.609 15.601V8.408l6.264 3.602z"/>
      </svg>
    )

    case 'sparkle': return <svg {...p}><path d="M12 3v1M12 20v1M4.22 4.22l.7.7M19.08 19.08l.7.7M3 12h1M20 12h1M4.22 19.78l.7-.7M19.08 4.92l.7-.7"/><path d="M12 8a4 4 0 100 8 4 4 0 000-8z" fill="currentColor" fillOpacity=".15"/><path d="M12 2l1 3.5L16 4l-2 3 3 1-3 1 2 3-3-1.5L12 15l-1-3.5L8 13l2-3-3-1 3-1-2-3 3 1.5z"/></svg>
    case 'network': return <svg {...p}><circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6.5 7.5l4 8M17.5 7.5l-4 8"/></svg>
    case 'twitter': return <svg {...p}><path d="M23 3a10.9 10.9 0 01-3.14 1.53A4.48 4.48 0 0016 2.5a4.5 4.5 0 00-4.5 4.5v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z"/></svg>

    default: return null
  }
}
