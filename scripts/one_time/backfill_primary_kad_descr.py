#!/usr/bin/env python3
"""
Repair companies.primary_kad — the Greek DESCRIPTION of a firm's primary ΚΑΔ.

THE BUG (measured 2026-10-03, not assumed)
------------------------------------------
`primary_kad_code` was backfilled from the activities JSONB (kad_2026, open,
type='Κύρια') by backfill_primary_kad_code.py. `primary_kad` was NOT — it still
holds whatever description the firm carried under the OLD kad_2008 vocabulary.

Because the 2008 -> 2026 remap is MANY-TO-ONE, several old activities collapsed
onto a single new code, and each firm kept its own old wording. So one code now
carries several unrelated descriptions:

  3.483 of 7.787 distinct primary_kad_code values (44,7%) have >1 description.

  53200200 -> 11.611 firms "ΥΠΗΡΕΣΙΕΣ ΚΑΤ' ΟΙΚΟΝ ΠΑΡΑΔΟΣΗΣ ΤΡΟΦΙΜΩΝ (DELIVERY)"
            +  1.103 firms ''                      <- empty string, not NULL
            +     31 firms "ΕΚΜΕΤΑΛΛΕΥΣΗ ΠΕΡΙΠΤΕΡΟΥ"
            +     30 firms "ΛΙΑΝΙΚΟ ΕΜΠΟΡΙΟ ΕΙΔΩΝ ΠΑΝΤΟΠΩΛΕΙΟΥ"

Who reads this column, and therefore what is currently wrong:
  * Scout matches briefs against primary_kad with `~* '\\mSTEM'` — so it both
    misses firms and matches the wrong ones.
  * The ΚΛΑΔΟΣ column in /search results.
  * The company page's activity label and its "similar companies" lookup.

THE FIX
-------
Re-derive primary_kad from the SAME JSONB row primary_kad_code came from: the
open (dtTo IS NULL) kad_2026 activity of type 'Κύρια'. PROJECT.md measured that
vocabulary as strictly 1:1 — 9.507 codes, 9.507 code/descr pairs — so there is
exactly one correct answer per code.

Deliberately NOT done here: building a code->descr lookup and applying it by
code. That would be faster but would invent a description for firms whose JSONB
disagrees with their code column. Reading per firm keeps the column honest.

SAFETY
------
  * Default run is a DRY RUN. Nothing is written without --apply.
  * Batched by ar_gemi with a progress bar; interruptible and resumable, since
    each batch commits on its own and only rows that still disagree are updated.
  * Never writes NULL over an existing value: a firm with no open kad_2026
    Κύρια row is skipped, not blanked.
  * --limit N to rehearse on a slice first.

USAGE
  python scripts/one_time/backfill_primary_kad_descr.py              # dry run
  python scripts/one_time/backfill_primary_kad_descr.py --limit 5000 # sample
  python scripts/one_time/backfill_primary_kad_descr.py --apply      # write
"""
import argparse
import os
import sys
import time

import psycopg2
from dotenv import load_dotenv

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, '..', '.env'))

BATCH = 20_000


def bar(done, total, label='', width=38):
    """Single-line progress bar. Every bulk script in this repo has one."""
    frac = 0.0 if not total else min(1.0, done / total)
    full = int(frac * width)
    pct = frac * 100
    sys.stdout.write(
        "\r  [{}{}] {:5.1f}%  {:>9,}/{:<9,} {}".format(
            '#' * full, '.' * (width - full), pct, done, total, label[:34]
        )
    )
    sys.stdout.flush()


# The authoritative description for a firm's primary activity. LATERAL keeps it
# to one JSONB scan per company row.
SELECT_SQL = """
SELECT c.ar_gemi,
       c.primary_kad            AS current_descr,
       act.descr                AS correct_descr
FROM companies c
CROSS JOIN LATERAL (
    SELECT a->'activity'->>'descr' AS descr
    FROM jsonb_array_elements(c.activities) a
    WHERE a->>'type' = 'Κύρια'
      AND a->>'dtTo' IS NULL
      AND a->'activity'->>'kadVersion' = 'kad_2026'
      AND a->'activity'->>'descr' IS NOT NULL
      AND a->'activity'->>'descr' <> ''
    LIMIT 1
) act
WHERE c.ar_gemi > %s
  AND c.activities IS NOT NULL
  AND jsonb_typeof(c.activities) = 'array'
  -- Only rows that actually disagree. Makes the script resumable for free and
  -- keeps the UPDATE count honest rather than rewriting identical values.
  AND (c.primary_kad IS DISTINCT FROM act.descr)
ORDER BY c.ar_gemi
LIMIT %s
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true',
                    help='actually write; without it the script only reports')
    ap.add_argument('--limit', type=int, default=0,
                    help='stop after N rows (rehearsal)')
    args = ap.parse_args()

    dsn = os.getenv('DATABASE_URL')
    if not dsn:
        sys.exit('DATABASE_URL not found in scripts/.env')

    print('Connecting...')
    conn = psycopg2.connect(dsn, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()

    # Size the job so the bar means something. Counting the mismatches exactly
    # costs a full JSONB scan, so estimate from the table instead and let the
    # bar track rows examined.
    cur.execute("SELECT count(*) FROM companies WHERE activities IS NOT NULL")
    approx = cur.fetchone()[0]
    total = min(approx, args.limit) if args.limit else approx

    mode = 'APPLY — rows will be written' if args.apply else 'DRY RUN — nothing will be written'
    print(f"\n{mode}")
    print(f"Scanning up to {total:,} companies in batches of {BATCH:,}.\n")

    last = 0
    seen = fixed = blanks = 0
    samples = []
    t0 = time.time()

    while True:
        take = BATCH if not args.limit else min(BATCH, args.limit - seen)
        if take <= 0:
            break
        cur.execute(SELECT_SQL, (last, take))
        rows = cur.fetchall()
        if not rows:
            break

        for ar_gemi, current, correct in rows:
            if current is None or current == '':
                blanks += 1
            if len(samples) < 12:
                samples.append((ar_gemi, current, correct))

        if args.apply:
            cur.executemany(
                "UPDATE companies SET primary_kad = %s WHERE ar_gemi = %s",
                [(correct, ar_gemi) for ar_gemi, _, correct in rows],
            )
            conn.commit()

        fixed += len(rows)
        seen += len(rows)
        last = rows[-1][0]
        bar(seen, total, f'last ar_gemi {last}')

    bar(seen, total, 'done')
    dt = time.time() - t0
    print(f"\n\n  mismatched rows found : {fixed:,}")
    print(f"  ...of which were blank: {blanks:,}")
    print(f"  elapsed               : {dt:.1f}s")

    if samples:
        print("\n  Sample corrections:")
        for ar_gemi, current, correct in samples:
            cur_txt = '(blank)' if not current else current[:52]
            print(f"    {ar_gemi}")
            print(f"      was : {cur_txt}")
            print(f"      now : {(correct or '')[:52]}")

    if not args.apply:
        print("\n  DRY RUN — nothing written. Re-run with --apply to commit.")
    else:
        print("\n  Written. Re-run to confirm it reports 0 mismatches.")

    conn.close()


if __name__ == '__main__':
    main()
