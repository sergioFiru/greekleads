'use client'
import { useEffect, useState } from 'react'

interface StreamRow {
  ar_gemi: string
  co_name_el: string
  prefecture_descr: string
}

export default function LiveTicker() {
  const [rows, setRows] = useState<StreamRow[]>([])

  useEffect(() => {
    fetch('/api/stream')
      .then(r => r.json())
      .then(d => setRows(d.recent ?? []))
      .catch(() => {})
  }, [])

  if (rows.length === 0) return null

  const items = [...rows, ...rows]

  return (
    <div className="ticker-wrap">
      <div className="ticker-label">
        <span className="ticker-live-dot" />
        LIVE ΓΕΜΗ
      </div>
      <div className="ticker-track">
        <div className="ticker-inner">
          {items.map((row, i) => (
            <span key={`${row.ar_gemi}-${i}`} className="ticker-item">
              <span className="ticker-sep">●</span>
              {row.co_name_el}
              {row.prefecture_descr && (
                <span className="ticker-meta"> · {row.prefecture_descr}</span>
              )}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
