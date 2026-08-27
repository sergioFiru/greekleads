# SEO Plan — GreekLeads

Status as of **2026-08-26**. Phase 0 is shipped and live. Everything after it is
planned, not built.

Related: [`PROJECT.md`](PROJECT.md) for the product spec, memory
`project_seo_strategy` for the longer strategic notes.

---

## The one thing to understand first

**There is no way to push pages to Google.** Google's Indexing API accepts only
`JobPosting` and `BroadcastEvent`; using it for anything else violates its terms.
Search Console's manual "Request Indexing" caps at roughly 10–12 URLs/day. The
"instant indexing" services sold around this either abuse that endpoint or do
nothing.

Indexing is **earned**, via crawl budget, which is a function of site authority.
At 1,67M pages that is the binding constraint — not sitemap tooling.

Corollary: dumping all 1,67M near-duplicate registry pages into a sitemap from a
zero-authority domain produces a very large `Discovered – currently not indexed`
number, and that ratio is itself a site-wide quality signal. **Scope is
deliberately narrow.** See Tier A below.

---

## Measured coverage (2026-08-26)

| Segment | Count |
|---|---|
| Companies total | 1.677.186 |
| Active (`status_descr = 'Ενεργή'`) | 1.053.133 |
| **Active + has website → Tier A** | **80.033** |
| With email | 768.997 |
| With phone | 886.125 |
| With Greek δ.τ. (trade name) | 502.216 |
| With people / board data | 1.543.522 |
| Active + website OR email OR δ.τ. | 729.053 |

The ~80k with a discovered website are the genuinely differentiated pages: every
ΓΕΜΗ mirror has the registry rows, none of them has our website/socials data.

---

## Phase 0 — SHIPPED (commits `345f28e`, `b771a4e`)

Neither robots.txt nor any sitemap existed before this.

| File | Role |
|---|---|
| `web/app/robots.ts` | robots.txt |
| `web/app/sitemap.xml/route.ts` | sitemap index |
| `web/app/sitemaps/[chunk]/route.ts` | `/sitemaps/N.xml` — 0 = hub pages, 1..N = companies |
| `web/lib/sitemapScope.ts` | single definition of `CHUNK` (50.000) and `TIER_A` |
| `web/lib/site.ts` | `SITE_URL` — canonical origin |
| `scripts/one_time/add_sitemap_index.py` | partial index the sitemap query depends on |

Verified live on production:

```
/robots.txt        200   0,58s
/sitemap.xml       200   0,30s   index -> 3 sitemaps
/sitemaps/0.xml    200   0,33s   4 hub pages
/sitemaps/1.xml    200   1,71s   50.000 URLs
/sitemaps/2.xml    200   0,93s   30.033 URLs
/sitemaps/9.xml    404           correct (out of range)
```

Spot-checked `/etaireies/{100001000, 786301000, 5947401000}` — all 200 with
proper `<title>`. A sitemap full of 404s is worse than no sitemap.

### Design decisions worth not re-litigating

**Route handlers, not Next's metadata convention.** `generateSitemaps` emits the
chunk files but never the `<sitemapindex>` that ties them together, while still
reserving `/sitemap.xml` for itself and serving 404 there (confirmed in the
Next 16 docs shipped in `node_modules`). Hand-rolling both ends is less
machinery than working around that.

**`Disallow: /search`.** Filtered search is an effectively infinite URL space
(status × prefecture × ΚΑΔ × capital × contact flags × page). Left open,
Googlebot spends the entire crawl budget there. Side effect: the sector links on
`/statistika` are crawl-blocked. They still work for humans, which is their job.

**www is canonical.** Vercel 308-redirects the apex to `www.greekleads.gr`, so
`SITE_URL` must include `www` or all ~80k `<loc>` entries redirect and the
sitemap host contradicts the canonical tag. `metadataBase` in `app/layout.tsx`
is what makes the relative `alternates.canonical` resolve absolutely.

**Tier A only.** `TIER_A` in `lib/sitemapScope.ts` must stay character-identical
to the partial-index predicate in `scripts/one_time/add_sitemap_index.py`. Drift
turns a 0,1s index-only scan back into a 12s sequential scan inside a serverless
function Googlebot is waiting on. Measured: 51s to serve chunk 1 unindexed.

### Bugs hit during Phase 0 — do not repeat

- **`Disallow: /sitemaps/` blocks the sitemap itself.** `Disallow` prevents the
  crawler from *fetching* a path, not merely from indexing it. Bing reported
  "Blocked by robots.txt", 0 URLs discovered. Fixed in `b771a4e`; there is a
  comment in `robots.ts` saying never to add it back.
- **Next 16 passes `generateSitemaps`' `id` as a Promise.** Read unawaited it is
  `NaN`, which silently falls through to the hub-page branch — every chunk
  serves the same four URLs, with a 200 status.
- **An index predicate must be immutable**, so it uses
  `status_descr = 'Ενεργή'`, not `ILIKE '%Ενεργ%'`.
- Recurring lesson, third time now: **verifying each piece in isolation is not
  verification.** robots.txt rendered correctly; every sitemap URL returned 200;
  the two were never checked against each other.

---

## Open — do these next

### Immediate (manual, not code)

- [ ] **Google Search Console** — confirm property type. A *URL-prefix* property
      for `https://greekleads.gr` (no www) watches the host that redirects away
      and will read empty. Use a **Domain** property, or add
      `https://www.greekleads.gr`.
- [ ] Submit `sitemap.xml` in GSC → Sitemaps.
- [ ] **Bing Webmaster Tools** — has "import from GSC". **Resubmit the sitemap
      there**; it will not retry the robots-blocked fetch on its own.
- [ ] URL Inspection → Request Indexing on `/` and `/statistika` only. ~10/day
      quota, useless at scale, legitimate for two hub pages.

### Phase 1 — read one number, then decide

Wait **3–4 weeks**. Do not change the sitemap, robots.txt, or canonical tags in
that window — every change resets Google's assessment and destroys the signal.

GSC → Pages, `Indexed` vs `Not indexed`. Inside "Not indexed" the split matters:

- `Discovered – currently not indexed` — crawl budget / authority problem.
- `Crawled – currently not indexed` — **content quality problem**. The more
  informative one: Google read the page and judged it not worth keeping.

Gates against the 80.033:

| Indexed after ~3 weeks | Reading | Action |
|---|---|---|
| >40% | template works | widen `TIER_A` toward the 729.053 |
| 10–40% | normal for a new domain | wait another month, start Phase 2 |
| <10%, mostly `Crawled – not indexed` | pages read as duplicates | Phase 2 becomes urgent |

Widening `TIER_A` means editing **both** `lib/sitemapScope.ts` and the index
predicate in `scripts/one_time/add_sitemap_index.py`.

### Phase 2 — make the pages worth keeping

This is the real work, and the only thing that fixes a bad Phase 1 result.

- **δ.τ. brand names** — 502.216 already in `co_titles_el`, free, no scraping.
  The ΓΕΜΗ legal name is not what people type ("ΣΙΜΟΠΟΥΛΟΥ ΙΩΑΝΝΑ" vs "GROOMIE").
  Place it **once**, structurally: `<title>` + H1 + meta description +
  `schema.org` `alternateName`. Repetition in body text does nothing for modern
  Google and risks a helpful-content penalty.
- **AI brand extraction** for the ~70% with no δ.τ. — from `<title>`, OG
  `site_name`, schema Organization name, logo `alt`. Must corroborate before
  accepting or it pollutes pages. Store `brand_source`.
- **"βρέθηκε από το GreekLeads" provenance line** — the discovered website and
  socials are unique per-page content no mirror has. Doubles as a trust label
  and the free/paid gate marker.

### Phase 3 — IndexNow (optional, low priority)

Pushes to **Bing, Yandex, Seznam, Naver**. **Google does not use it.** Value is
speed on new/changed pages, not bulk discovery — so it pairs with
`new_firms_watcher`, not with a one-off 80k blast. Real reason to bother: Bing's
index backs ChatGPT search and Copilot.

Setup starts in the Bing Webmaster Tools IndexNow tab, not at indexnow.org. It
generates a key that must be served at `https://www.greekleads.gr/<key>.txt`.
Two build options, undecided:

1. host the key file only, ping manually or by script;
2. key file + a hook in `new_firms_watcher` so each newly ingested company is
   pushed the day it appears.

Also note Bing Webmaster Tools offers **URL Submission at 10.000/day** — the
bulk-submit button that does not exist for Google.

### Phase 4 — authority

Nothing above works at scale without inbound links. `/statistika` is the play: a
page journalists cite about Greek business formation. Deferred from earlier
planning: Wikipedia (needs press first), press outreach (e-business.gr, Startup
Greece, Naftemporiki), MCP server.

---

## Expectations

This is a **6–12 month compounding play**. There is no version that produces
traffic next week. The failure mode is fiddling weekly and never learning
anything.
