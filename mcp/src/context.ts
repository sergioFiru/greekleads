/**
 * What a model needs to know before it trusts an answer from this database.
 *
 * This file is the actual product of the MCP. Any wrapper can run a SELECT;
 * what makes results CORRECT is knowing that `prefecture_descr` is unaccented,
 * that `municipality_descr` is two fields glued together, that `primary_kad`
 * and `primary_kad_code` come from different vocabularies, and that a third of
 * "active" companies are not businesses anyone can sell to.
 *
 * Every number and caveat below was measured against the live database, not
 * assumed. Dates say when, because some of it drifts.
 */

export const DATASET_OVERVIEW = `
GreekLeads mirrors ΓΕΜΗ (Γενικό Εμπορικό Μητρώο), the official Greek business
registry. It is the registry of record for every company in Greece.

Scale (measured 2026-10-07):
  companies           1.686.951 rows   every company ever registered
  company_persons     2.095.640 rows   directors, shareholders, representatives
  stats_rollup          585.786 rows   pre-aggregated formation statistics
  people_rollup             500 rows   most-connected people, refreshed nightly

Of the 1.69M companies, about 1.06M are 'Ενεργή' (active). The rest are closed,
suspended or dissolved and should normally be excluded.
`.trim()

export const CRITICAL_CAVEATS = `
THINGS THAT WILL PRODUCE WRONG ANSWERS IF IGNORED

1. prefecture_descr is UPPERCASE AND UNACCENTED.
   'ΑΧΑΙΑΣ' not 'ΑΧΑΪΑΣ', 'ΑΤΤΙΚΗΣ' not 'Αττικής'. Greek uppercase correctly
   drops accents, so lowercasing these to display them produces misspellings.
   An exact-match filter with an accented value returns zero rows.

2. municipality_descr is TWO FIELDS GLUED TOGETHER: "ΔΗΜΟΣ / ΝΟΜΟΣ".
   It is not just the municipality. Matching it as a plain municipality name
   fails.

3. 'Inadequate Info' is a REAL VALUE, not null.
   The registry writes this literal English string into municipality_descr,
   prefecture_descr and legal_type_descr when it does not know. It can occupy
   one half of the municipality string or both. Treat it as unknown and never
   show it to a user.

4. primary_kad and primary_kad_code come from DIFFERENT VOCABULARIES.
   The code column is ΚΑΔ 2026; the description column was ΚΑΔ 2008 wording
   until it was repaired on 2026-10-07. Filter and group on primary_kad_code.
   Use the description for display only.

5. Division 45 DOES NOT EXIST in ΚΑΔ 2026.
   It held vehicle sales and repair under ΚΑΔ 2008 (256.432 rows). Its firms
   split three ways: 19.751 to division 95 (repair), 8.157 to 47 (retail),
   7.701 to 46 (wholesale). Classes 9530/9531/9532 are vehicle repair and
   belong to the trade sector even though the rest of division 95 does not.

6. Firms register at EVERY DEPTH of the ΚΑΔ tree, so a code is a POINT, not a
   subtree. 76.397 firms sit shallower than class level. A firm on '41000000'
   is NOT inside '41100000'. Prefix matching is for aggregation only.

7. Division 00 «ΕΛΛΕΙΨΗ ΔΡΑΣΤΗΡΙΟΤΗΤΑΣ» = registered but never traded.
   12.598 firms, 11.141 of them legally 'Ενεργή'. 00010000 alone is the 9th
   largest primary ΚΑΔ in Greece. They pass every ordinary filter and they are
   NOT prospects. Excluded by default by this server.

8. Our copy of ΓΕΜΗ LAGS. Measured p90 ingest lag for a newly founded firm is
   81 days, so counts for recent periods are incomplete and will rise. Never
   present the last ~3 months as final.

9. Website coverage is THIN and that is the registry's fault, not a gap in our
   data: of 1.06M active companies only 80.118 have an official url and 33.886
   more have one we discovered. Most Greek small firms genuinely have no site.

10. Financial statements are nearly EMPTY (54 rows extracted so far). Only
    51.581 companies have filings at all — 30,3% of active ΑΕ/ΙΚΕ/ΕΠΕ and 5,2%
    of all active firms. ΟΕ/ΕΕ/ΑΤΟΜΙΚΗ never publish any. Do not promise
    financial data.
`.trim()

export const FIELD_GUIDE = `
COMPANY FIELDS WORTH KNOWING

  ar_gemi             bigint, the ΓΕΜΗ number — the stable identifier
  afm                 the Greek VAT number (ΑΦΜ), present for ~100% of active
  co_name_el          legal name, almost always ALL CAPS
  co_titles_el        trade name / διακριτικός τίτλος — the brand people use
  status_descr        'Ενεργή' = active
  legal_type_descr    SHORT CODES, not expanded names: ΑΕ, ΙΚΕ, ΟΕ, ΕΕ, ΕΠΕ,
                      ΑΤΟΜΙΚΗ (25 distinct values)
  prefecture_descr    νομός, uppercase unaccented — see caveat 1
  municipality_descr  "ΔΗΜΟΣ / ΝΟΜΟΣ" — see caveat 2
  incorporation_date  founding date
  primary_kad_code    8-digit ΚΑΔ 2026 — filter on THIS
  primary_kad         Greek description — display only
  activities          JSONB array of every activity, current and historical
  email/phone/url     from the registry; often absent
  discovered_url      a website GreekLeads found, not declared to ΓΕΜΗ.
                      Label it as discovered — it is inferred, not official.

The activities JSONB is nested deeper than it looks:
  [{ "type": "Κύρια", "dtFrom": ..., "dtTo": null,
     "activity": { "id": "56101000", "descr": "...", "kadVersion": "kad_2026" } }]
kadVersion lives INSIDE activity, not beside it. Filtering on the outer key
returns zero rows for every division and reads exactly like "this division does
not exist" — a mistake worth not repeating.
Current primary activity = type 'Κύρια' AND dtTo IS NULL AND kadVersion
'kad_2026'.
`.trim()

export const USAGE_NOTES = `
HOW TO ANSWER WELL WITH THIS DATA

- Say what a number counts. "12.400 active ΙΚΕ in Αττική with an email" is a
  claim; "12.400 companies" is not.
- The registry is a census, not a sample, so counts are exact for what they
  measure. The uncertainty is in coverage (caveats 8–10), not in arithmetic.
- Greek legal names are ALL CAPS in the source. That is correct, not shouting.
- A διακριτικός τίτλος (co_titles_el) is usually what someone means by the
  company's name; co_name_el is the legal form.
- When a filter returns nothing, suspect an accent or a legal-type code before
  concluding the companies do not exist.
`.trim()

export const FULL_CONTEXT = [
  DATASET_OVERVIEW,
  '',
  CRITICAL_CAVEATS,
  '',
  FIELD_GUIDE,
  '',
  USAGE_NOTES,
].join('\n')
