/**
 * Exercises every tool against the live database, without a protocol client.
 *
 * Run: npx tsx src/smoke.ts
 *
 * Deliberately asserts on FACTS measured elsewhere in this repo, so that if the
 * data shifts under the server the test says so instead of printing something
 * plausible.
 */
import { TOOLS } from './tools.js'
import { pool } from './db.js'

const byName = Object.fromEntries(TOOLS.map(t => [t.name, t]))

async function call(name: string, args: Record<string, unknown>) {
  const tool = byName[name]
  if (!tool) throw new Error(`no tool ${name}`)
  const parsed = tool.schema.parse(args)
  const t0 = Date.now()
  const out = await tool.run(parsed as never)
  return { out, ms: Date.now() - t0 }
}

function show(label: string, ms: number, detail: string) {
  console.log(`  ${label.padEnd(34)} ${String(ms + 'ms').padStart(7)}  ${detail}`)
}

async function main() {
  let failures = 0
  const check = (ok: boolean, msg: string) => {
    if (!ok) { failures++; console.log(`    FAIL: ${msg}`) }
  }

  console.log('\nGreekLeads MCP — smoke test\n')

  // 1. context tool: no DB, must be substantial
  {
    const { out, ms } = await call('describe_dataset', { section: 'all' })
    const text = String(out)
    show('describe_dataset', ms, `${text.length} chars`)
    check(text.includes('Inadequate Info'), 'context must warn about the placeholder value')
    check(text.includes('kadVersion'), 'context must explain the nested JSONB')
  }

  // 2. active ΙΚΕ in Αττική with email — the canonical prospect query
  {
    const { out, ms } = await call('search_companies', {
      prefectures: ['ΑΤΤΙΚΗΣ'], legal_types: ['ΙΚΕ'], has_email: true, limit: 3,
    })
    const r = out as { total_matching: number; companies: unknown[] }
    show('search_companies (ΙΚΕ/Αττική)', ms, `${r.total_matching.toLocaleString('el-GR')} matching`)
    check(r.total_matching > 1000, 'expected thousands of ΙΚΕ with email in Αττική')
    check(r.companies.length === 3, 'limit not honoured')
  }

  // 3. the accent trap from caveat 1 must genuinely return nothing
  {
    const { out, ms } = await call('search_companies', { prefectures: ['ΑΧΑΪΑΣ'], limit: 1 })
    const bad = (out as { total_matching: number }).total_matching
    const { out: out2 } = await call('search_companies', { prefectures: ['ΑΧΑΙΑΣ'], limit: 1 })
    const good = (out2 as { total_matching: number }).total_matching
    show('accent trap (caveat 1)', ms, `accented ${bad} vs unaccented ${good.toLocaleString('el-GR')}`)
    check(bad === 0 && good > 0, 'the documented accent caveat no longer holds')
  }

  // 4. dormant shells excluded by default, available on request
  {
    const { out } = await call('search_companies', { kad_prefix: ['00'], limit: 1 })
    const off = (out as { total_matching: number }).total_matching
    const { out: out2, ms } = await call('search_companies', { kad_prefix: ['00'], include_dormant: true, limit: 1 })
    const on = (out2 as { total_matching: number }).total_matching
    show('dormant shells (caveat 7)', ms, `default ${off}, include_dormant ${on.toLocaleString('el-GR')}`)
    check(off === 0, 'dormant shells must be excluded by default')
    check(on > 10_000, 'expected >10k dormant shells when asked for')
  }

  // 5. one company end to end
  {
    const { out, ms } = await call('get_company', { ar_gemi: '179604901000' })
    const c = out as { co_name_el?: string; sector?: string; people?: unknown[] } | null
    show('get_company', ms, c ? `${c.co_name_el?.slice(0, 30)} · ${c.sector}` : 'NULL')
    check(!!c && !!c.co_name_el, 'known ΓΕΜΗ number returned nothing')
  }

  // 6. nonexistent company must be null, not an exception
  {
    const { out, ms } = await call('get_company', { ar_gemi: '999999999999' })
    show('get_company (missing)', ms, out === null ? 'null, as intended' : 'UNEXPECTED')
    check(out === null, 'missing company should return null')
  }

  // 7. people
  {
    const { out, ms } = await call('search_people', { name: 'ΠΑΠΑΔΟΠΟΥΛΟΣ', limit: 3 })
    const r = out as { people: { person_name: string; companies: number }[] }
    show('search_people', ms, r.people.length ? `top: ${r.people[0].person_name.slice(0, 26)} (${r.people[0].companies})` : 'none')
    check(r.people.length > 0, 'a common Greek surname returned nobody')
  }

  // 8. statistics, incl. the 4-digit → section rollup
  {
    const { out, ms } = await call('registry_statistics', { dimension: 'sector', months: 12, limit: 10 })
    const r = out as { results: { sector: string; formations: number }[]; caveat: string }
    show('registry_statistics (sector)', ms, r.results.slice(0, 2).map(x => `${x.sector} ${x.formations.toLocaleString('el-GR')}`).join(', '))
    check(r.results.length > 3, 'expected several sectors')
    check(!!r.caveat, 'statistics must carry the ingest-lag caveat')
  }

  console.log(failures === 0 ? '\nALL CHECKS PASSED\n' : `\n${failures} CHECK(S) FAILED\n`)
  await pool.end()
  process.exit(failures === 0 ? 0 : 1)
}

main().catch(err => { console.error(err); process.exit(1) })
