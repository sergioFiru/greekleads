"""
build_stats_rollup.py — build the pre-aggregated tables behind /statistika.

WHY THIS EXISTS
    The statistics page must never touch `companies` at request time. An
    unfiltered COUNT(*) over 1.67M rows already costs ~2.3s, and the page needs
    GROUP BYs with JSONB extraction on top of that. So everything is rolled up
    here, nightly, into a small table the page reads instantly.

    Measured: the full month x sector aggregation is ~15s and produces ~23k
    rows. The whole rollup runs well under a minute.

GRAIN
    Two grains in one table:
      'day'   — only the last DAY_WINDOW days, for the Σήμερα/7/30/90 views
      'month' — full history since HISTORY_FROM, for the 12μ/Όλα views
    Storing both keeps the daily table small while still allowing 25 years of
    trend without an unreasonable row count.

DIMENSIONS / METRICS
    dimension: 'all' | 'sector' | 'prefecture' | 'legal_type'
    metric:    'births'       — companies incorporated in the period
               'deaths'       — companies whose status left 'Ενεργή' in the period
               'with_website' — of those births, how many have a site
               'with_social'  — ... any social profile
               'with_email'   — ... an email
               'with_phone'   — ... a phone

DATA GOTCHAS HANDLED HERE
  * Junk dates: ΓΕΜΗ contains incorporation_date = 9999-01-01 and
    last_status_change = 9009-12-14. Everything is clamped to
    [HISTORY_FROM, CURRENT_DATE] or a single bad row would stretch every axis
    out to the year 9999.
  * kadVersion: a firm carries both its kad_2008 and kad_2026 activity, the old
    one closed via dtTo. Without `dtTo IS NULL` every firm double-counts.
  * Only type='Κύρια' (primary activity) counts, so sector shares sum to the
    headline total instead of exceeding it.
  * `primary_kad` is ~90% populated, but the JSONB is the source of truth, so
    the sector rollup reads the JSONB.

PROVISIONAL WINDOW
    Our copy of the registry lags: measured p90 ingest lag for a newly founded
    firm is 81 days (median 30), and a month keeps filling for weeks after it
    ends. PROVISIONAL_DAYS (90) is written into stats_meta so the page can mark
    that tail as incomplete rather than rendering it as a collapse in
    formations.

USAGE
    python scripts/one_time/build_stats_rollup.py           # full rebuild
    python scripts/one_time/build_stats_rollup.py --verify  # report only

Idempotent: each grain is deleted and rebuilt inside a transaction, so
re-running is safe and the page never observes a half-built table.
"""

import os
import sys
import time
import argparse
from pathlib import Path

import psycopg2
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent.parent / ".env")
DSN = os.getenv("DATABASE_URL")
if not DSN:
    sys.exit("DATABASE_URL not found in scripts/.env")

HISTORY_FROM = "2000-01-01"
DAY_WINDOW = 400          # days of daily-grain detail to keep
PROVISIONAL_DAYS = 90     # p90 ingest lag = 81d, rounded up
STATEMENT_TIMEOUT = "600s"


# -- schema -----------------------------------------------------------
DDL = [
    (
        "stats_rollup",
        """
        CREATE TABLE IF NOT EXISTS stats_rollup (
            grain     text    NOT NULL,
            period    date    NOT NULL,
            dimension text    NOT NULL,
            dim_value text    NOT NULL,
            metric    text    NOT NULL,
            value     integer NOT NULL,
            PRIMARY KEY (grain, period, dimension, dim_value, metric)
        )
        """,
    ),
    (
        "stats_rollup_lookup_idx",
        """
        CREATE INDEX IF NOT EXISTS stats_rollup_lookup_idx
            ON stats_rollup (grain, dimension, metric, period)
        """,
    ),
    (
        "stats_meta",
        """
        CREATE TABLE IF NOT EXISTS stats_meta (
            key   text PRIMARY KEY,
            value text NOT NULL
        )
        """,
    ),
]


# -- the aggregations -------------------------------------------------
# Each entry: (label, dimension, SQL template). The SQL returns
# (period, dim_value, metric, value) for one grain, with {trunc} and {since}
# substituted. Written out explicitly rather than generated so each one can be
# read, EXPLAINed and fixed on its own.

BIRTH_FLAGS = """
    COUNT(*)::int AS births,
    COUNT(*) FILTER (WHERE COALESCE(NULLIF(c.url,''),
                                    NULLIF(c.discovered_url,'')) IS NOT NULL)::int AS with_website,
    COUNT(*) FILTER (WHERE NULLIF(c.instagram_url,'') IS NOT NULL
                        OR NULLIF(c.facebook_url,'')  IS NOT NULL
                        OR NULLIF(c.linkedin_url,'')  IS NOT NULL
                        OR NULLIF(c.tiktok_url,'')    IS NOT NULL
                        OR NULLIF(c.twitter_url,'')   IS NOT NULL
                        OR NULLIF(c.youtube_url,'')   IS NOT NULL)::int AS with_social,
    COUNT(*) FILTER (WHERE NULLIF(c.email,'') IS NOT NULL)::int AS with_email,
    COUNT(*) FILTER (WHERE NULLIF(c.phone,'') IS NOT NULL)::int AS with_phone
"""

# Unpivot the flag columns into (metric, value) rows. Zero-valued rows are
# dropped -- the table stays sparse and the page treats "missing" as 0.
UNPIVOT = """
SELECT period, dim_value, m.metric, m.value
FROM agg,
     LATERAL (VALUES ('births',       agg.births),
                     ('with_website', agg.with_website),
                     ('with_social',  agg.with_social),
                     ('with_email',   agg.with_email),
                     ('with_phone',   agg.with_phone)) AS m(metric, value)
WHERE m.value > 0
"""

# A 2-digit-division guard, kept as its own constant so the doubled braces
# needed to survive .format() live in exactly one place.
DIVISION_GUARD = "AND LEFT(a->'activity'->>'id', 2) ~ '^[0-9][0-9]$'"

AGGREGATIONS = [
    (
        "totals",
        "all",
        """
        WITH agg AS (
            SELECT date_trunc('{trunc}', c.incorporation_date)::date AS period,
                   '' AS dim_value,
                   """ + BIRTH_FLAGS + """
            FROM companies c
            WHERE c.incorporation_date BETWEEN '{since}' AND CURRENT_DATE
            GROUP BY 1
        )
        """ + UNPIVOT,
    ),
    (
        "by sector",
        "sector",
        """
        WITH agg AS (
            SELECT date_trunc('{trunc}', c.incorporation_date)::date AS period,
                   LEFT(a->'activity'->>'id', 2) AS dim_value,
                   """ + BIRTH_FLAGS + """
            FROM companies c,
                 LATERAL jsonb_array_elements(c.activities) a
            WHERE c.incorporation_date BETWEEN '{since}' AND CURRENT_DATE
              AND a->>'type' = 'Κύρια'
              AND a->>'dtTo' IS NULL
              """ + DIVISION_GUARD + """
            GROUP BY 1, 2
        )
        """ + UNPIVOT,
    ),
    (
        "by prefecture",
        "prefecture",
        """
        WITH agg AS (
            SELECT date_trunc('{trunc}', c.incorporation_date)::date AS period,
                   c.prefecture_descr AS dim_value,
                   """ + BIRTH_FLAGS + """
            FROM companies c
            WHERE c.incorporation_date BETWEEN '{since}' AND CURRENT_DATE
              AND c.prefecture_descr IS NOT NULL
              AND c.prefecture_descr <> 'Inadequate Info'
            GROUP BY 1, 2
        )
        """ + UNPIVOT,
    ),
    (
        "by legal type",
        "legal_type",
        """
        WITH agg AS (
            SELECT date_trunc('{trunc}', c.incorporation_date)::date AS period,
                   c.legal_type_descr AS dim_value,
                   """ + BIRTH_FLAGS + """
            FROM companies c
            WHERE c.incorporation_date BETWEEN '{since}' AND CURRENT_DATE
              AND c.legal_type_descr IS NOT NULL
            GROUP BY 1, 2
        )
        """ + UNPIVOT,
    ),
    # Closures. Separate because they key off last_status_change, not
    # incorporation_date. NOTE: status refresh lags even harder than
    # incorporation ingest -- the last few months read near-zero (2, 10, 8) --
    # so the page must treat recent deaths as provisional too.
    (
        "closures",
        "all",
        """
        SELECT date_trunc('{trunc}', c.last_status_change)::date AS period,
               '' AS dim_value,
               'deaths' AS metric,
               COUNT(*)::int AS value
        FROM companies c
        WHERE c.status_descr NOT ILIKE 'ενεργ%%'
          AND c.last_status_change BETWEEN '{since}' AND CURRENT_DATE
        GROUP BY 1
        """,
    ),
]


def bar(done, total, label, width=32):
    """Single-line progress bar -- every long-running script here has one."""
    frac = done / total if total else 1
    filled = int(width * frac)
    sys.stdout.write(
        "\r  [{}{}] {}/{}  {:<28}".format(
            "#" * filled, "." * (width - filled), done, total, label
        )
    )
    sys.stdout.flush()


def verify(cur):
    print("\nVerify:")
    cur.execute("SELECT to_regclass('stats_rollup')")
    if cur.fetchone()[0] is None:
        print("  stats_rollup does not exist -- run without --verify first.")
        return
    cur.execute(
        """SELECT grain, dimension, COUNT(*), MIN(period), MAX(period)
           FROM stats_rollup GROUP BY 1, 2 ORDER BY 1, 2"""
    )
    for grain, dim, n, lo, hi in cur.fetchall():
        print("  {:<6} {:<11} {:>8,} rows   {} .. {}".format(grain, dim, n, lo, hi))
    cur.execute("SELECT key, value FROM stats_meta ORDER BY key")
    for k, v in cur.fetchall():
        print("  meta.{} = {}".format(k, v))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--verify", action="store_true",
                    help="report what is in the tables, write nothing")
    args = ap.parse_args()

    conn = psycopg2.connect(DSN, connect_timeout=30)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '{}'".format(STATEMENT_TIMEOUT))

    if args.verify:
        verify(cur)
        conn.close()
        return

    print("Schema:")
    for name, ddl in DDL:
        cur.execute(ddl)
        print("  ok  " + name)
    conn.commit()

    grains = [
        ("day",   "day",   "CURRENT_DATE - {}".format(DAY_WINDOW)),
        ("month", "month", "'{}'::date".format(HISTORY_FROM)),
    ]

    grand_total = 0
    for grain, trunc, since_expr in grains:
        # Resolve the start of the window to a literal date so it can be
        # interpolated into the aggregation templates.
        cur.execute("SELECT ({})::date".format(since_expr))
        since = cur.fetchone()[0].isoformat()

        print("\nGrain '{}' (from {}):".format(grain, since))
        cur.execute("DELETE FROM stats_rollup WHERE grain = %s", (grain,))

        written = 0
        t0 = time.time()
        for i, (label, dimension, sql_tpl) in enumerate(AGGREGATIONS, start=1):
            bar(i - 1, len(AGGREGATIONS), label)
            sql = sql_tpl.format(trunc=trunc, since=since)
            cur.execute(
                """
                INSERT INTO stats_rollup (grain, period, dimension, dim_value, metric, value)
                SELECT %s, period, %s, dim_value, metric, value
                FROM ({}) src
                WHERE period IS NOT NULL
                ON CONFLICT (grain, period, dimension, dim_value, metric)
                DO UPDATE SET value = EXCLUDED.value
                """.format(sql),
                (grain, dimension),
            )
            written += cur.rowcount
        bar(len(AGGREGATIONS), len(AGGREGATIONS), "done")
        print("\n  {:,} rows in {:.1f}s".format(written, time.time() - t0))
        grand_total += written
        conn.commit()

    for k, v in [
        ("provisional_days", str(PROVISIONAL_DAYS)),
        ("day_window",       str(DAY_WINDOW)),
        ("history_from",     HISTORY_FROM),
    ]:
        cur.execute(
            """INSERT INTO stats_meta (key, value) VALUES (%s, %s)
               ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value""",
            (k, v),
        )
    cur.execute(
        """INSERT INTO stats_meta (key, value) VALUES ('built_at', now()::text)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value"""
    )
    conn.commit()

    print("\nTotal {:,} rows written.".format(grand_total))
    verify(cur)
    conn.close()


if __name__ == "__main__":
    main()
