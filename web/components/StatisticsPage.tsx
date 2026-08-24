'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import Icon from './Icon'
import PrefectureMap from './PrefectureMap'
import FormationChart, { type ChartPoint } from './stats/FormationChart'
import SectorBars, { type SectorRow } from './stats/SectorBars'
import DigitalPresence, { type DigitalRow } from './stats/DigitalPresence'
import LiveRegistryFeed from './stats/LiveRegistryFeed'
import { pct } from '@/lib/format'

const PERIODS = [
  { key: '7d',  label: '7 ημ.' },
  { key: '30d', label: '30 ημ.' },
  { key: '90d', label: '90 ημ.' },
  { key: '12m', label: '12 μήνες' },
  { key: 'all', label: 'Όλα' },
] as const

interface StatsPayload {
  ready: boolean
  period: string
  periodLabel: string
  grain: 'day' | 'month'
  builtAt: string | null
  provisionalDays: number
  headline: {
    births: number
    birthsPrior: number
    birthsChangePct: number | null
    deaths: number
    net: number
    comparable: boolean
    provisional: boolean
  }
  chart: ChartPoint[]
  sectors: SectorRow[]
  prefectures: { name: string; value: number; share: number }[]
  legalTypes: { name: string; value: number; share: number }[]
  digital: DigitalRow[]
}

/** Editorial section header: a rule, an index number, a title. */
function SectionHead({ n, title, sub }: { n: string; title: string; sub?: string }) {
  return (
    <div className="st-sechead">
      <span className="st-sechead-n">{n}</span>
      <h2>{title}</h2>
      {sub && <span className="st-sechead-sub">{sub}</span>}
    </div>
  )
}

export default function StatisticsPage() {
  const [period, setPeriod] = useState<string>('12m')
  const [data, setData]     = useState<StatsPayload | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: string) => {
    setLoading(true)
    try {
      const r = await fetch(`/api/statistics?period=${p}`)
      setData(await r.json())
    } catch (err) {
      console.error('[StatisticsPage]', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  // The rollup tables have not been built yet. Say so plainly rather than
  // rendering a page of zeroes that reads as "Greece stopped founding firms".
  if (data && !data.ready) {
    return (
      <main className="st">
        <div className="st-notbuilt">
          <Icon name="settings" size={18} />
          <div>
            <strong>Τα στατιστικά δεν έχουν δημιουργηθεί ακόμη.</strong>
            <p>Εκτελέστε <code>python scripts/one_time/build_stats_rollup.py</code>.</p>
          </div>
        </div>
      </main>
    )
  }

  const h = data?.headline
  const prefCounts: Record<string, number> = {}
  data?.prefectures.forEach(p => { prefCounts[p.name] = p.value })

  const builtAt = data?.builtAt
    ? new Date(data.builtAt).toLocaleDateString('el-GR', { day: '2-digit', month: 'long', year: 'numeric' })
    : null

  const topSector = data?.sectors?.[0]

  return (
    <main className="st">
      {/* ── Masthead ───────────────────────────────────────────────
          Title, provenance and the period control on one ruled line, so the
          text has a reason to sit where it does instead of floating. */}
      <header className="st-mast">
        <div className="st-mast-id">
          <h1 className="st-mast-title">Νέες επιχειρήσεις στην Ελλάδα</h1>
          <p className="st-mast-sub">
            Επίσημα στοιχεία από το Γενικό Εμπορικό Μητρώο
            {builtAt && <> · ενημέρωση {builtAt}</>}
          </p>
        </div>

        <nav className="st-periods" aria-label="Χρονική περίοδος">
          {PERIODS.map(p => (
            <button
              key={p.key}
              className="st-period"
              data-active={period === p.key ? 'true' : 'false'}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Hero: live feed | headline figure + formation chart ──── */}
      <section className="st-hero">
        <aside className="st-hero-feed">
          <LiveRegistryFeed />
        </aside>

        <div className="st-hero-main">
          <div className="st-figure">
            <span className="st-figure-label">
              Νέες επιχειρήσεις · {data?.periodLabel ?? '—'}
            </span>
            <span className="st-figure-num" data-loading={loading ? 'true' : 'false'}>
              {loading || !h ? '—' : h.births.toLocaleString('el-GR')}
            </span>
            <span className="st-figure-note">
              {h?.comparable && h.birthsChangePct != null ? (
                <span className={h.birthsChangePct >= 0 ? 'st-up' : 'st-down'}>
                  {h.birthsChangePct >= 0 ? '▲' : '▼'} {pct(Math.abs(h.birthsChangePct))}
                  <span className="st-figure-vs">έναντι της προηγούμενης περιόδου</span>
                </span>
              ) : (
                <span className="st-prov-note">
                  Εκκρεμούν καταχωρίσεις — η σύγκριση δεν είναι ακόμη αξιόπιστη
                </span>
              )}
            </span>
          </div>

          {/* Supporting figures as a ruled stat line, not four identical
              cards — they are secondary and should read as secondary. */}
          <div className="st-statline">
            <div className="st-stat">
              <span className="st-stat-v">
                {loading || !h ? '—' : h.deaths.toLocaleString('el-GR')}
              </span>
              <span className="st-stat-k">Διαγραφές &amp; λύσεις</span>
            </div>
            <div className="st-stat">
              <span className="st-stat-v">
                {loading || !h ? '—' : `${h.net >= 0 ? '+' : ''}${h.net.toLocaleString('el-GR')}`}
              </span>
              <span className="st-stat-k">Καθαρή μεταβολή</span>
            </div>
            <div className="st-stat st-stat-wide">
              <span className="st-stat-v st-stat-prose">
                {loading || !topSector ? '—' : topSector.label}
              </span>
              <span className="st-stat-k">
                Κορυφαίος κλάδος
                {topSector && <> · {pct(topSector.share)}</>}
              </span>
            </div>
          </div>

          <div className="st-hero-chart">
            <div className="st-chart-cap">
              <span>Ιδρύσεις ανά {data?.grain === 'day' ? 'ημέρα' : 'μήνα'}</span>
            </div>
            {loading || !data
              ? <div className="st-chart-skel" />
              : <FormationChart data={data.chart} grain={data.grain} height={260} />}
          </div>
        </div>
      </section>

      {/* ── Sectors ────────────────────────────────────────────── */}
      <section className="st-sec">
        <SectionHead n="01" title="Σε ποιους κλάδους"
                     sub="Κάθε γραμμή ανοίγει τη λίστα των επιχειρήσεων" />
        {loading || !data ? <div className="st-chart-skel" /> : <SectorBars rows={data.sectors} />}
      </section>

      {/* ── Geography ──────────────────────────────────────────── */}
      <section className="st-sec">
        <SectionHead n="02" title="Σε ποιες περιοχές" sub="Ιδρύσεις ανά νομό" />
        <div className="st-geo">
          <div className="st-geo-map">
            <PrefectureMap counts={prefCounts} />
          </div>
          <div className="st-ranklist">
            {(data?.prefectures ?? []).slice(0, 15).map((p, i) => (
              <Link key={p.name} href={`/search?prefecture=${encodeURIComponent(p.name)}`}
                    className="st-rank">
                <span className="st-rank-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="st-rank-name">{p.name}</span>
                <span className="st-rank-bar">
                  <span style={{ width: `${(p.value / (data!.prefectures[0]?.value || 1)) * 100}%` }} />
                </span>
                <span className="st-rank-val">{p.value.toLocaleString('el-GR')}</span>
                <span className="st-rank-share">{pct(p.share)}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Digital presence ───────────────────────────────────── */}
      <section className="st-sec">
        <SectionHead n="03" title="Ψηφιακή παρουσία"
                     sub="Ποιοι κλάδοι ιδρύονται χωρίς website — από τον χαμηλότερο" />
        {loading || !data ? <div className="st-chart-skel" /> : <DigitalPresence rows={data.digital} />}
      </section>

      {/* ── Legal forms ────────────────────────────────────────── */}
      <section className="st-sec">
        <SectionHead n="04" title="Νομική μορφή" />
        <div className="st-forms">
          {(data?.legalTypes ?? []).slice(0, 8).map(l => (
            <Link key={l.name} href={`/search?legal_type=${encodeURIComponent(l.name)}`}
                  className="st-form">
              <span className="st-form-val">{l.value.toLocaleString('el-GR')}</span>
              <span className="st-form-name">{l.name}</span>
              <span className="st-form-track">
                <span style={{ width: `${l.share}%` }} />
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Methodology ────────────────────────────────────────── */}
      <section className="st-method">
        <div className="st-method-col">
          <h2>Ορισμοί</h2>
          <p>
            Ως «νέα επιχείρηση» μετράται κάθε εγγραφή στο ΓΕΜΗ με ημερομηνία
            σύστασης εντός της περιόδου. Οι κλάδοι προκύπτουν από τον κύριο ΚΑΔ,
            ομαδοποιημένο στις τομεακές κατηγορίες NACE.
          </p>
        </div>
        <div className="st-method-col">
          <h2>Πληρότητα στοιχείων</h2>
          <p>
            Οι καταχωρίσεις φτάνουν σε εμάς με καθυστέρηση — το 90% εντός{' '}
            {data?.provisionalDays ?? 90} ημερών από τη σύσταση. Οι πιο πρόσφατες
            περίοδοι είναι επομένως ελλιπείς: σημειώνονται ξεχωριστά στα
            γραφήματα και εξαιρούνται από κάθε ποσοστιαία σύγκριση.
          </p>
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────────────────── */}
      <section className="st-cta">
        <div>
          <h2>Βρείτε τις επιχειρήσεις πίσω από τους αριθμούς</h2>
          <p>Φιλτράρετε ανά κλάδο, περιοχή, έτος ίδρυσης και στοιχεία επικοινωνίας.</p>
        </div>
        <Link href="/search" className="st-cta-btn">
          <Icon name="search" size={14} /> Αναζήτηση επιχειρήσεων
        </Link>
      </section>
    </main>
  )
}
