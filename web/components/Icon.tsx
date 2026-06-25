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
    default: return null
  }
}
