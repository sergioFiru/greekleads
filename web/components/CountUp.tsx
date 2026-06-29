'use client'
import { useEffect, useRef, useState } from 'react'

type FormatType = 'million' | 'locale' | 'integer'

function applyFormat(n: number, type: FormatType): string {
  switch (type) {
    case 'million': return (n / 1_000_000).toFixed(2).replace('.', ',') + 'M+'
    case 'locale':  return n.toLocaleString('el-GR')
    case 'integer': return String(n)
  }
}

export function CountUp({
  value,
  formatType = 'locale',
  duration = 1400,
}: {
  value: number
  formatType?: FormatType
  duration?: number
}) {
  const [count, setCount] = useState(0)
  const elRef   = useRef<HTMLSpanElement>(null)
  const started = useRef(false)

  useEffect(() => {
    const el = elRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || started.current) return
        started.current = true
        const t0 = performance.now()
        const tick = (now: number) => {
          const t    = Math.min((now - t0) / duration, 1)
          const ease = 1 - Math.pow(1 - t, 3)
          setCount(Math.round(value * ease))
          if (t < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
      },
      { threshold: 0.3 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [value, duration])

  return <span ref={elRef}>{applyFormat(count, formatType)}</span>
}
