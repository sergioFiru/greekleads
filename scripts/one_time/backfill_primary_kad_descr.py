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
from psycopg2.extras import execute_values
from dotenv import load_dotenv

# The Windows console defaults to cp1252, which cannot encode Greek. Without
# this the script does all its work and then dies on the LAST print — the
# summary of what it fixed — which reads as a failed run.
for _stream in (sys.stdout, sys.stderr):
    try:
        _stream.reconfigure(encoding='utf-8')
    except (AttributeError, ValueError):
        pass

HERE = os.path.dirname(os.path.abspath(__file__))
load_dotenv(os.path.join(HERE, '..', '.env'))

# Small enough that the bar moves every few seconds. The old 20.000 meant one
# update of progress every ~13 minutes, which read as a hung script.
BATCH = 2_000


def bar(done, total, label='', t0=None, width=34):
    """Progress bar with rate and ETA.

    Called DURING a batch, not only after one. The previous version printed
    nothing until a whole batch had been written, so a slow batch was
    indistinguishable from a hung script.
    """
    frac = 0.0 if not total else min(1.0, done / total)
    full = int(frac * width)
    tail = ''
    if t0 and done:
        el = time.time() - t0
        rate = done / el if el else 0
        if rate > 0:
            eta = int((total - done) / rate)
            tail = '  {:>5,.0f}/s  ETA {:02d}:{:02d}'.format(rate, eta // 60, eta % 60)
    sys.stdout.write(
        "\r  [{}{}] {:5.1f}%  {:>7,}/{:<7,}{} {}".format(
            '#' * full, '.' * (width - full), frac * 100, done, total, tail, label[:20]
        )
    )
    sys.stdout.flush()


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

# Same predicate, counted. Measured at ~7s against the live DB — cheap enough to
# run up front so the progress bar has a real denominator instead of counting
# against all 1,68M companies and never passing 3%.
COUNT_SQL = """
SELECT count(*)
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
WHERE c.activities IS NOT NULL
  AND jsonb_typeof(c.activities) = 'array'
  AND (c.primary_kad IS DISTINCT FROM act.descr)
"""

# ONE round trip per batch instead of one per ROW. psycopg2's executemany sends
# each UPDATE separately; over the Railway public proxy that was ~40ms x 20.000
# = ~13 minutes of silence per batch, which is what made the script look hung.
UPDATE_SQL = """
UPDATE companies AS c
   SET primary_kad = v.descr
  FROM (VALUES %s) AS v(ar_gemi, descr)
 WHERE c.ar_gemi = v.ar_gemi::bigint
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

    mode = 'APPLY — rows will be written' if args.apply else 'DRY RUN — nothing will be written'
    print(f"\n{mode}")

    # Count the ACTUAL work first (~7s measured) so the bar has a real
    # denominator and can show an ETA. The old version counted against all
    # 1,68M companies, so it never passed 3%. Printed before the query runs so
    # there is never a silent gap.
    sys.stdout.write('Counting mismatched rows (about 7s)... ')
    sys.stdout.flush()
    tc = time.time()
    cur.execute(COUNT_SQL)
    mismatched = cur.fetchone()[0]
    print(f'{mismatched:,} found in {time.time() - tc:.0f}s')

    if mismatched == 0:
        print('\n  Nothing to do — primary_kad already agrees everywhere.')
        conn.close()
        return

    total = min(mismatched, args.limit) if args.limit else mismatched
    print(f"Writing in batches of {BATCH:,}.\n")

    last = 0
    seen = fixed = blanks = 0
    samples = []
    t0 = time.time()
    # Draw it at 0% immediately: the first SELECT takes a few seconds, and an
    # empty terminal during that is exactly what read as "stuck".
    bar(0, total, 'starting')

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
            # execute_values sends ONE statement per batch. executemany sent one
            # per ROW — 20.000 round trips over the Railway public proxy, about
            # 13 minutes of silence per batch.
            execute_values(
                cur, UPDATE_SQL,
                [(ar_gemi, correct) for ar_gemi, _, correct in rows],
                page_size=len(rows),
            )
            conn.commit()

        fixed += len(rows)
        seen += len(rows)
        last = rows[-1][0]
        bar(seen, total, 'ar_gemi {}'.format(last), t0)

    bar(seen, total, 'done', t0)
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
