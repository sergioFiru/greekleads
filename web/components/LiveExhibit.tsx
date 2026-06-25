'use client'
import { useEffect, useState, useRef } from 'react'
import Icon from './Icon'

interface StreamRow {
  ar_gemi: string
  co_name_el: string
  legal_type_descr: string
  prefecture_descr: string
  gemi_fetched_at: string
}
interface StreamData {
  total: number
  last24h: number
  recent: StreamRow[]
}

function timeLabel(isoStr: string): string {
  const d = new Date(isoStr)
  return d.toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit' })
}

export default function LiveExhibit() {
  const [data, setData] = useState<StreamData | null>(null)
  const [displayCount, setDisplayCount] = useState(0)
  const [tick, setTick] = useState(0)
  const countRef = useRef(0)

  // Initial load + poll every 4s
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/stream')
        if (!res.ok) return
        const d: StreamData = await res.json()
        setData(d)
        if (countRef.current === 0) {
          countRef.current = d.total
          setDisplayCount(d.total)
        }
      } catch {}
    }
    load()
    const id = setInterval(load, 4000)
    return () => clearInterval(id)
  }, [])

  // Smooth counter increment between polls
  useEffect(() => {
    if (!data) return
    const target = data.total
    const diff = target - countRef.current
    if (diff <= 0) return
    const steps = Math.min(diff, 8)
    let i = 0
    const id = setInterval(() => {
      i++
      countRef.current += Math.ceil(diff / steps)
      setDisplayCount(countRef.current)
      if (i >= steps) clearInterval(id)
    }, 300)
    return () => clearInterval(id)
  }, [data?.total])

  // Rotate visible stream rows
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 2400)
    return () => clearInterval(id)
  }, [])

  const rows = data?.recent ?? []
  const visible = rows.length >= 6
    ? Array.from({ length: 6 }, (_, i) => rows[(tick + i) % rows.length])
    : rows

  return (
    <div className="live-exhibit">
      {/* Header */}
      <div className="live-header">
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <span className="live-pulse" />
          <span style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: '0.06em' }}>
            LIVE · ΓΕΜΗ STREAM
          </span>
        </div>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--nav-text-muted)' }}>
          {new Date().toLocaleDateString('el-GR')}
        </span>
      </div>

      {/* Counter */}
      <div className="live-counter-band">
        <div>
          <div className="live-counter-label">Εταιρείες καταχωρημένες</div>
          <div className="live-counter-num mono">
            {displayCount > 0 ? displayCount.toLocaleString('el-GR') : '—'}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div className="live-counter-label">Τελευταίες 24ω</div>
          <div className="live-24h">
            {data ? `+${data.last24h.toLocaleString('el-GR')}` : '—'}
          </div>
        </div>
      </div>

      {/* Stream rows */}
      <div className="live-stream">
        {visible.length === 0 && (
          <div style={{ padding: '16px', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
            {data === null ? 'Σύνδεση στο ΓΕΜΗ...' : 'Αναμονή νέων εγγραφών...'}
          </div>
        )}
        {visible.map((row, i) => (
          <div
            key={`${row.ar_gemi}-${tick}-${i}`}
            className="live-row"
            style={{ opacity: 1 - i * 0.09, animation: i === 0 ? 'streamin 0.4s ease-out' : undefined }}
          >
            <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)', width: 40, flexShrink: 0 }}>
              {timeLabel(row.gemi_fetched_at)}
            </span>
            <span className="live-tag badge-gemi">ΕΓΓΡΑΦΗ</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.co_name_el}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {row.legal_type_descr} · {row.prefecture_descr}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="live-footer">
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          <Icon name="verified" size={11} stroke={1.6} style={{ color: 'var(--gemi-text)' }} />
          <span>Πηγή · </span>
          <span className="mono" style={{ color: 'var(--text-primary)', fontSize: 10.5 }}>business.gov.gr/gemi</span>
        </span>
        <span className="mono" style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
          live sync ●
        </span>
      </div>
    </div>
  )
}
