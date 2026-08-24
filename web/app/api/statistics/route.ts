import { NextRequest, NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { sectionOfKad, SECTIONS } from '@/lib/nace'

// ΓΕΜΗ splits Attica into five prefecture values; lib/greecePrefectureShapes.json
// (and therefore PrefectureMap) knows a single 'ΑΤΤΙΚΗ'. Collapsed here so the
// map, the ranked list and the headline all agree. Mirrors /api/stats.
const ATTICA_PARTS = new Set([
  'ΑΤΤΙΚΗΣ', 'ΑΘΗΝΩΝ', 'ΠΕΙΡΑΙΑ', 'ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ', 'ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ',
])

/**
 * GET /api/statistics?period=30d
 *
 * Everything here reads `stats_rollup`, never `companies` — see
 * scripts/one_time/build_stats_rollup.py for why (an unfiltered COUNT(*) over
 * 1.67M rows is ~2.3s before any GROUP BY).
 *
 * The honesty problem this endpoint exists to solve: our copy of ΓΕΜΗ lags.
 * Measured p90 ingest lag for a newly founded firm is 81 days, so anything
 * inside the trailing `provisional_days` window is still filling in. Those
 * points are returned with `provisional: true` and are excluded from every
 * percentage change, so the page can never render an ingest artifact as a
 * collapse in Greek company formation.
 */

export const revalidate = 900

type PeriodKey = '7d' | '30d' | '90d' | '12m' | 'all'

interface PeriodDef {
  grain: 'day' | 'month'
  /** How many periods of that grain the window covers. null = everything. */
  span: number | null
  label: string
}

const PERIODS: Record<PeriodKey, PeriodDef> = {
  '7d':  { grain: 'day',   span: 7,    label: '7 ημέρες' },
  '30d': { grain: 'day',   span: 30,   label: '30 ημέρες' },
  '90d': { grain: 'day',   span: 90,   label: '90 ημέρες' },
  '12m': { grain: 'month', span: 12,   label: '12 μήνες' },
  'all': { grain: 'month', span: null, label: 'Όλα' },
}

interface RollupRow {
  period: string
  dim_value: string
  metric: string
  value: number
}

export async function GET(req: NextRequest) {
  const key = (req.nextUrl.searchParams.get('period') ?? '30d') as PeriodKey
  const def = PERIODS[key] ?? PERIODS['30d']

  try {
    const meta = await query<{ key: string; value: string }>(
      `SELECT key, value FROM stats_meta`
    )
    const metaMap = new Map(meta.map(m => [m.key, m.value]))
    const provisionalDays = parseInt(metaMap.get('provisional_days') ?? '90', 10)

    // The rollup may not have been built yet — say so plainly rather than
    // rendering a page full of zeroes that looks like Greece stopped founding
    // companies.
    if (!metaMap.has('built_at')) {
      return NextResponse.json({ ready: false }, { status: 200 })
    }

    // ── window bounds ──────────────────────────────────────────────
    // Two windows: the current one and the equally sized one before it, so the
    // change can be computed over like-for-like spans.
    const unit = def.grain === 'day' ? 'day' : 'month'
    const spanSql = def.span
      ? `date_trunc('${unit}', CURRENT_DATE)::date - INTERVAL '${def.span - 1} ${unit}'`
      : `'1900-01-01'::date`
    const priorFromSql = def.span
      ? `date_trunc('${unit}', CURRENT_DATE)::date - INTERVAL '${def.span * 2 - 1} ${unit}'`
      : `'1900-01-01'::date`

    const [series, sectors, prefectures, legals, digital] = await Promise.all([
      // Full series for the chart: the current window plus the prior one, so
      // the client can draw the comparison without a second request.
      query<RollupRow>(
        `SELECT period::text, dim_value, metric, value
         FROM stats_rollup
         WHERE grain = $1 AND dimension = 'all'
           AND metric IN ('births', 'deaths')
           AND period >= (${priorFromSql})::date
         ORDER BY period`,
        [def.grain]
      ),
      query<RollupRow>(
        `SELECT period::text, dim_value, metric, value
         FROM stats_rollup
         WHERE grain = $1 AND dimension = 'sector' AND metric = 'births'
           AND period >= (${priorFromSql})::date`,
        [def.grain]
      ),
      query<RollupRow>(
        `SELECT period::text, dim_value, metric, value
         FROM stats_rollup
         WHERE grain = $1 AND dimension = 'prefecture' AND metric = 'births'
           AND period >= (${spanSql})::date`,
        [def.grain]
      ),
      query<RollupRow>(
        `SELECT period::text, dim_value, metric, value
         FROM stats_rollup
         WHERE grain = $1 AND dimension = 'legal_type' AND metric = 'births'
           AND period >= (${spanSql})::date`,
        [def.grain]
      ),
      // Digital presence is only meaningful against the births of the same
      // window, so both metrics come back together.
      query<RollupRow>(
        `SELECT period::text, dim_value, metric, value
         FROM stats_rollup
         WHERE grain = $1 AND dimension = 'sector'
           AND metric IN ('births', 'with_website', 'with_social')
           AND period >= (${spanSql})::date`,
        [def.grain]
      ),
    ])

    // ── period boundaries, computed here so client and server agree ──
    const today = new Date()
    const startOf = (d: Date) =>
      def.grain === 'day'
        ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
        : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))

    const cur = startOf(today)
    const shift = (d: Date, n: number) =>
      def.grain === 'day'
        ? new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n))
        : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1))

    const windowStart = def.span ? shift(cur, -(def.span - 1)) : new Date(Date.UTC(1900, 0, 1))
    const priorStart  = def.span ? shift(cur, -(def.span * 2 - 1)) : new Date(Date.UTC(1900, 0, 1))
    const iso = (d: Date) => d.toISOString().slice(0, 10)

    const provisionalFrom = new Date(Date.now() - provisionalDays * 86_400_000)
    // A month counts as provisional if any part of it falls in the window.
    const isProvisional = (p: string) => {
      const d = new Date(p + 'T00:00:00Z')
      const end = def.grain === 'day'
        ? d
        : new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0))
      return end >= provisionalFrom
    }

    const inWindow = (p: string) => p >= iso(windowStart)
    const inPrior  = (p: string) => p >= iso(priorStart) && p < iso(windowStart)

    // ── headline ───────────────────────────────────────────────────
    const births = series.filter(r => r.metric === 'births')
    const deaths = series.filter(r => r.metric === 'deaths')

    const sum = (rows: RollupRow[], pred: (p: string) => boolean) =>
      rows.reduce((a, r) => (pred(r.period) ? a + r.value : a), 0)

    const birthsNow   = sum(births, inWindow)
    const birthsPrior = sum(births, inPrior)
    const deathsNow   = sum(deaths, inWindow)
    const deathsPrior = sum(deaths, inPrior)

    // Any provisional period inside either window makes the comparison
    // dishonest — a partially ingested window always "falls".
    const windowProvisional = births.some(r => inWindow(r.period) && isProvisional(r.period))
      || def.span === null
      || iso(windowStart) >= iso(provisionalFrom)
    const priorProvisional = births.some(r => inPrior(r.period) && isProvisional(r.period))
    const comparable = !windowProvisional && !priorProvisional && birthsPrior > 0

    const pct = (now: number, prior: number) =>
      prior > 0 ? ((now - prior) / prior) * 100 : null

    // ── chart series (current window only) ─────────────────────────
    const byPeriod = new Map<string, { births: number; deaths: number }>()
    for (const r of series) {
      if (!inWindow(r.period) && !inPrior(r.period)) continue
      const e = byPeriod.get(r.period) ?? { births: 0, deaths: 0 }
      if (r.metric === 'births') e.births = r.value
      else e.deaths = r.value
      byPeriod.set(r.period, e)
    }
    const chart = Array.from(byPeriod.entries())
      .filter(([p]) => inWindow(p))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([period, v]) => ({
        period,
        births: v.births,
        deaths: v.deaths,
        provisional: isProvisional(period),
      }))

    // ── sectors, rolled from NACE division to section ──────────────
    const sectorNow   = new Map<string, number>()
    const sectorPrior = new Map<string, number>()
    for (const r of sectors) {
      const sec = sectionOfKad(r.dim_value + '000000')
      if (inWindow(r.period)) sectorNow.set(sec, (sectorNow.get(sec) ?? 0) + r.value)
      else if (inPrior(r.period)) sectorPrior.set(sec, (sectorPrior.get(sec) ?? 0) + r.value)
    }

    // Firms whose primary activity is missing or closed never reach the sector
    // rollup. Rather than let the shares quietly not add up, the remainder is
    // reported as its own bucket.
    const classified = Array.from(sectorNow.values()).reduce((a, b) => a + b, 0)
    if (birthsNow > classified) sectorNow.set('X', (sectorNow.get('X') ?? 0) + (birthsNow - classified))

    const rankOf = (m: Map<string, number>) => {
      const order = Array.from(m.entries()).sort((a, b) => b[1] - a[1])
      return new Map(order.map(([k], i) => [k, i + 1]))
    }
    const priorRanks = rankOf(sectorPrior)

    const sectorList = Array.from(sectorNow.entries())
      .map(([key, value]) => ({
        key,
        label: SECTIONS.find(s => s.key === key)?.label ?? key,
        color: SECTIONS.find(s => s.key === key)?.color ?? '#B4B0A6',
        value,
        share: birthsNow > 0 ? (value / birthsNow) * 100 : 0,
        priorValue: sectorPrior.get(key) ?? 0,
        changePct: pct(value, sectorPrior.get(key) ?? 0),
      }))
      .sort((a, b) => b.value - a.value)
      .map((s, i) => ({
        ...s,
        rank: i + 1,
        rankChange: priorRanks.has(s.key) ? (priorRanks.get(s.key) as number) - (i + 1) : null,
      }))

    // ── geography ──────────────────────────────────────────────────
    const prefMap = new Map<string, number>()
    for (const r of prefectures) {
      const name = ATTICA_PARTS.has(r.dim_value) ? 'ΑΤΤΙΚΗ' : r.dim_value
      prefMap.set(name, (prefMap.get(name) ?? 0) + r.value)
    }
    const prefectureList = Array.from(prefMap.entries())
      .map(([name, value]) => ({ name, value, share: birthsNow > 0 ? (value / birthsNow) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)

    // ── legal forms ────────────────────────────────────────────────
    const legalMap = new Map<string, number>()
    for (const r of legals) legalMap.set(r.dim_value, (legalMap.get(r.dim_value) ?? 0) + r.value)
    const legalList = Array.from(legalMap.entries())
      .map(([name, value]) => ({ name, value, share: birthsNow > 0 ? (value / birthsNow) * 100 : 0 }))
      .sort((a, b) => b.value - a.value)

    // ── digital presence per sector ────────────────────────────────
    const dig = new Map<string, { births: number; web: number; social: number }>()
    for (const r of digital) {
      if (!inWindow(r.period)) continue
      const sec = sectionOfKad(r.dim_value + '000000')
      const e = dig.get(sec) ?? { births: 0, web: 0, social: 0 }
      if (r.metric === 'births') e.births += r.value
      else if (r.metric === 'with_website') e.web += r.value
      else e.social += r.value
      dig.set(sec, e)
    }
    const digitalList = Array.from(dig.entries())
      // Tiny sectors produce meaningless percentages, and this list is meant to
      // be acted on (it is a prospect list for web agencies).
      .filter(([, v]) => v.births >= 20)
      .map(([key, v]) => ({
        key,
        label: SECTIONS.find(s => s.key === key)?.label ?? key,
        color: SECTIONS.find(s => s.key === key)?.color ?? '#B4B0A6',
        births: v.births,
        websitePct: (v.web / v.births) * 100,
        socialPct: (v.social / v.births) * 100,
      }))
      .sort((a, b) => a.websitePct - b.websitePct)

    return NextResponse.json({
      ready: true,
      period: key,
      periodLabel: def.label,
      grain: def.grain,
      builtAt: metaMap.get('built_at') ?? null,
      provisionalDays,
      provisionalFrom: iso(provisionalFrom),
      windowStart: iso(windowStart),
      headline: {
        births: birthsNow,
        birthsPrior,
        birthsChangePct: comparable ? pct(birthsNow, birthsPrior) : null,
        deaths: deathsNow,
        deathsPrior,
        net: birthsNow - deathsNow,
        comparable,
        provisional: windowProvisional,
      },
      chart,
      sectors: sectorList,
      prefectures: prefectureList,
      legalTypes: legalList,
      digital: digitalList,
    })
  } catch (err) {
    console.error('[/api/statistics]', err)
    return NextResponse.json({ ready: false, error: String(err) }, { status: 500 })
  }
}
