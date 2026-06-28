import { NextRequest, NextResponse } from 'next/server'
import { query, queryOne } from '@/lib/db'

const PREFECTURES = [
  'ΑΘΗΝΩΝ', 'ΑΙΤΩΛΟΑΚΑΡΝΑΝΙΑΣ', 'ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ', 'ΑΡΓΟΛΙΔΑΣ', 'ΑΡΚΑΔΙΑΣ',
  'ΑΡΤΑΣ', 'ΑΤΤΙΚΗΣ', 'ΑΧΑΙΑΣ', 'ΒΟΙΩΤΙΑΣ', 'ΓΡΕΒΕΝΩΝ', 'ΔΡΑΜΑΣ',
  'ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ', 'ΔΩΔΕΚΑΝΗΣΟΥ', 'ΕΒΡΟΥ', 'ΕΥΒΟΙΑΣ', 'ΕΥΡΥΤΑΝΙΑΣ',
  'ΖΑΚΥΝΘΟΥ', 'ΗΛΕΙΑΣ', 'ΗΜΑΘΙΑΣ', 'ΗΡΑΚΛΕΙΟΥ', 'ΘΕΣΠΡΩΤΙΑΣ', 'ΘΕΣΣΑΛΟΝΙΚΗΣ',
  'ΙΩΑΝΝΙΝΩΝ', 'ΚΑΒΑΛΑΣ', 'ΚΑΡΔΙΤΣΑΣ', 'ΚΑΣΤΟΡΙΑΣ', 'ΚΕΡΚΥΡΑΣ', 'ΚΕΦΑΛΛΗΝΙΑΣ',
  'ΚΙΛΚΙΣ', 'ΚΟΖΑΝΗΣ', 'ΚΟΡΙΝΘΙΑΣ', 'ΚΥΚΛΑΔΩΝ', 'ΛΑΚΩΝΙΑΣ', 'ΛΑΡΙΣΑΣ',
  'ΛΑΣΙΘΙΟΥ', 'ΛΕΣΒΟΥ', 'ΛΕΥΚΑΔΑΣ', 'ΜΑΓΝΗΣΙΑΣ', 'ΜΕΣΣΗΝΙΑΣ', 'ΞΑΝΘΗΣ',
  'ΠΕΙΡΑΙΑ', 'ΠΕΛΛΗΣ', 'ΠΙΕΡΙΑΣ', 'ΠΡΕΒΕΖΑΣ', 'ΡΕΘΥΜΝΗΣ', 'ΡΟΔΟΠΗΣ',
  'ΣΑΜΟΥ', 'ΣΕΡΡΩΝ', 'ΤΡΙΚΑΛΩΝ', 'ΦΘΙΩΤΙΔΑΣ', 'ΦΛΩΡΙΝΑΣ', 'ΦΩΚΙΔΑΣ',
  'ΧΑΛΚΙΔΙΚΗΣ', 'ΧΑΝΙΩΝ', 'ΧΙΟΥ',
]

const LEGAL_TYPES = ['ΑΕ', 'ΕΠΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ', 'ΑΤΟΜΙΚΗ', 'Κοιν.Σ.Επ.', 'Συνεταιρισμός']

const SYSTEM_PROMPT = [
  'You are Scout, an AI prospecting agent for GreekLeads — a database of 1.67 million Greek companies from GEMI (Greek company registry).',
  '',
  'The user describes what they sell and who they want to target. Your job is to return the MAXIMUM number of relevant prospects. Always cast the widest reasonable net.',
  '',
  '## CORE RULES',
  '',
  'Geography (prefectures): DEFAULT = empty array (= all of Greece). ONLY add prefectures if the user EXPLICITLY mentions a specific city, island, or region by name.',
  '',
  'Legal types: DEFAULT = empty array (= all company sizes). ONLY filter if the user EXPLICITLY mentions company size.',
  '',
  'Enrichment — all default to false:',
  '- has_email: KEEP FALSE unless the user explicitly says "only with email". Do NOT set true just because outreach involves email.',
  '- has_phone: KEEP FALSE unless the user explicitly says "only with phone". Do NOT set true just because someone might call.',
  '- has_website: true only if user specifically targets companies with an existing web presence.',
  '- has_no_website: true only if user is SELLING web services (website design, SEO, e-commerce).',
  '',
  'WARNING: Setting has_email or has_phone to true REMOVES 40-60% of results. Never set them unless the user explicitly demands contact filtering.',
  '',
  'Sectors (activity_keywords): Be GENEROUS. Provide 5-8 SHORT keyword fragments (max 15 chars each). Use short fragments — they match more KAD code variants. Think broadly.',
  '',
  '## CRITICAL OUTPUT RULES',
  '1. filters.activities MUST always be an empty array — never put KAD strings there. The server resolves activities from activity_keywords.',
  '2. activity_keywords must contain SHORT Greek uppercase fragments only (e.g. "ΣΚΑΦ", "ΝΑΥΤ") — never full descriptions, max 15 characters each.',
  '3. has_email and has_phone MUST be false unless the user explicitly asks to filter by contact info.',
  '',
  '## Available prefectures (use EXACTLY as shown):',
  PREFECTURES.join(', '),
  'Notes: ΑΤΤΙΚΗΣ = greater Athens area. For Athens specifically: ΑΘΗΝΩΝ, ΑΤΤΙΚΗΣ, ΠΕΙΡΑΙΑ, ΑΝΑΤΟΛΙΚΗΣ ΑΤΤΙΚΗΣ, ΔΥΤΙΚΗΣ ΑΤΤΙΚΗΣ',
  '',
  '## Available legal types (use EXACTLY as shown):',
  'ΑΕ (large/listed), ΕΠΕ (medium LLC), ΙΚΕ (modern SME/startup), ΟΕ (small partnership), ΕΕ (limited partnership), ΑΤΟΜΙΚΗ (sole trader)',
  '',
  '## Sector keyword examples (Greek uppercase fragments):',
  '- Yachts/marine/boats: "ΣΚΑΦ", "ΝΑΥΤ", "ΝΑΥΤΙΛ", "ΠΛΟΙ", "ΘΑΛΑΣΣ", "CHARTER", "ΑΛΙΕ", "ΕΛΛΙΜΕΝ"',
  '- Software/IT: "ΛΟΓΙΣΜΙΚ", "ΠΛΗΡΟΦΟΡΙΚ", "ΥΠΟΛΟΓΙΣΤ", "ΙΣΤΟΣΕΛ", "ΨΗΦΙΑΚ"',
  '- Logistics/transport: "ΜΕΤΑΦΟΡ", "ΑΠΟΘΗΚ", "ΔΙΑΜΕΤΑΦΟΡ", "ΦΟΡΤΗΓ"',
  '- Construction: "ΚΑΤΑΣΚΕΥ", "ΟΙΚΟΔΟΜ", "ΤΕΧΝΙΚ", "ΕΡΓΟΛΑΒ"',
  '- Restaurants/food: "ΕΣΤΙΑΤ", "ΕΠΙΣΙΤΙΣ", "ΤΡΟΦΙΜ", "ΚΑΦΕ"',
  '- Hotels/tourism: "ΞΕΝΟΔΟΧ", "ΚΑΤΑΛΥΜ", "ΤΟΥΡΙΣΜ", "ΤΑΞΙΔ"',
  '- Medical/healthcare: "ΙΑΤΡ", "ΝΟΣΟΚ", "ΦΑΡΜΑΚ", "ΚΛΙΝΙΚ"',
  '- Accounting/finance: "ΛΟΓΙΣΤ", "ΟΙΚΟΝΟΜ", "ΧΡΗΜΑΤ"',
  '- Retail: "ΛΙΑΝΙΚ", "ΕΜΠΟΡΙΟ"',
  '- Manufacturing: "ΠΑΡΑΓΩΓ", "ΒΙΟΜΗΧΑΝ", "ΕΠΕΞΕΡΓΑΣ"',
  '- Agriculture: "ΓΕΩΡΓ", "ΑΓΡΟΤ", "ΚΤΗΝΟΤΡ"',
  '- Real estate: "ΑΚΙΝΗΤ", "ΜΕΣΙΤ"',
  '- Automotive: "ΑΥΤΟΚΙΝΗΤ", "ΟΧΗΜΑΤ", "ΕΠΙΣΚΕΥ"',
  '- Energy: "ΕΝΕΡΓΕΙ", "ΑΝΑΝΕΩΣΙΜ", "ΗΛΙΑΚ", "ΦΩΤΟΒΟΛΤ"',
  '- Beauty/wellness: "ΚΟΜΜΩΤ", "ΑΙΣΘΗΤ", "ΕΥΕΞΙ"',
  '- Cleaning: "ΚΑΘΑΡΙΣΜ"',
  '- Security: "ΑΣΦΑΛΕΙ", "ΦΥΛΑΞ"',
  '',
  '## Output',
  'Respond ONLY with valid JSON, no markdown fences:',
  '{',
  '  "filters": {',
  '    "prefectures": [],',
  '    "legal_types": [],',
  '    "has_email": false,',
  '    "has_phone": false,',
  '    "has_website": false,',
  '    "has_no_website": false,',
  '    "statuses": ["Ενεργή"],',
  '    "activities": []',
  '  },',
  '  "activity_keywords": ["ΣΚΑΦ", "ΝΑΥΤ", "ΘΑΛΑΣΣ"],',
  '  "explanation": "2-3 sentences in Greek explaining your choices",',
  '  "summary": "Short Greek summary e.g. Σκαφη & Ναυτιλια - Πανελλαδικα"',
  '}',
].join('\n')

interface ScoutFilters {
  prefectures: string[]
  legal_types: string[]
  has_email: boolean
  has_phone: boolean
  has_website: boolean
  has_no_website: boolean
  statuses: string[]
  activities: string[]
}

function buildWhere(f: ScoutFilters): { sql: string; params: unknown[] } {
  const conds: string[] = []
  const params: unknown[] = []
  let i = 1

  if (f.statuses.length) {
    const ph = f.statuses.map(() => `$${i++}`).join(', ')
    conds.push(`c.status_descr IN (${ph})`)
    params.push(...f.statuses)
  }
  if (f.prefectures.length) {
    const ph = f.prefectures.map(() => `$${i++}`).join(', ')
    conds.push(`c.prefecture_descr IN (${ph})`)
    params.push(...f.prefectures)
  }
  if (f.legal_types.length) {
    const ph = f.legal_types.map(() => `$${i++}`).join(', ')
    conds.push(`c.legal_type_descr IN (${ph})`)
    params.push(...f.legal_types)
  }
  if (f.activities.length) {
    const ph = f.activities.map(() => `$${i++}`).join(', ')
    conds.push(`c.primary_kad IN (${ph})`)
    params.push(...f.activities)
  }
  if (f.has_email)      conds.push(`(c.email IS NOT NULL AND c.email != '')`)
  if (f.has_phone)      conds.push(`(c.phone IS NOT NULL AND c.phone != '')`)
  if (f.has_website)    conds.push(`(c.url IS NOT NULL AND c.url != '')`)
  if (f.has_no_website) conds.push(`(c.url IS NULL OR c.url = '')`)

  return {
    sql: conds.length ? `WHERE ${conds.join(' AND ')}` : '',
    params,
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()
    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'messages required' }, { status: 400 })
    }

    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENROUTER_API_KEY not configured' }, { status: 500 })
    }

    const orResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://greekleads.gr',
        'X-Title': 'GreekLeads Scout',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        max_tokens: 2048,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages,
        ],
      }),
    })

    if (!orResponse.ok) {
      const err = await orResponse.text()
      throw new Error(`OpenRouter error ${orResponse.status}: ${err}`)
    }

    const orData = await orResponse.json()
    const raw = orData.choices?.[0]?.message?.content?.trim() ?? ''
    console.log('[/api/scout] raw response:', raw.slice(0, 400))

    let parsed: any
    try {
      parsed = JSON.parse(raw)
    } catch {
      const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const match = stripped.match(/\{[\s\S]*\}/)
      if (match) {
        try { parsed = JSON.parse(match[0]) }
        catch { throw new Error(`Could not parse Scout response: ${raw.slice(0, 200)}`) }
      } else {
        throw new Error(`Could not parse Scout response: ${raw.slice(0, 200)}`)
      }
    }

    const rawFilters = parsed.filters ?? {}

    // activity_keywords must be short fragments — filter out any full KAD descriptions the model returned
    const activityKeywords: string[] = (Array.isArray(parsed.activity_keywords) ? parsed.activity_keywords : [])
      .filter((k: unknown) => typeof k === 'string' && k.length <= 20)

    const validPrefectures = (rawFilters.prefectures ?? []).filter((p: string) => PREFECTURES.includes(p))
    const validLegalTypes  = (rawFilters.legal_types  ?? []).filter((l: string) => LEGAL_TYPES.includes(l))

    // Resolve keyword fragments → actual primary_kad values via ILIKE
    let activities: string[] = []
    if (activityKeywords.length > 0) {
      const conditions = activityKeywords.map((_, idx) => `primary_kad ILIKE $${idx + 1}`).join(' OR ')
      const patterns   = activityKeywords.map(k => `%${k}%`)
      const rows = await query<{ primary_kad: string }>(
        `SELECT DISTINCT primary_kad FROM companies WHERE (${conditions}) AND primary_kad IS NOT NULL LIMIT 150`,
        patterns
      )
      activities = rows.map(r => r.primary_kad)
    }

    const finalFilters: ScoutFilters = {
      prefectures:    validPrefectures,
      legal_types:    validLegalTypes,
      has_email:      rawFilters.has_email      ?? false,
      has_phone:      rawFilters.has_phone      ?? false,
      has_website:    rawFilters.has_website    ?? false,
      has_no_website: rawFilters.has_no_website ?? false,
      statuses:       rawFilters.statuses?.length ? rawFilters.statuses : ['Ενεργή'],
      activities,
    }

    const { sql: where, params } = buildWhere(finalFilters)
    const countRow = await queryOne<{ cnt: string }>(
      `SELECT COUNT(*) AS cnt FROM companies c ${where}`,
      params
    )
    const result_count = parseInt(countRow?.cnt ?? '0', 10)

    return NextResponse.json({
      filters: finalFilters,
      explanation: parsed.explanation ?? '',
      summary: parsed.summary ?? '',
      result_count,
      activity_keywords: activityKeywords,
    })
  } catch (err) {
    console.error('[/api/scout]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
