"""
stats_rollup.py — nightly rebuild of the tables behind /statistika.

Runs once a day. The page reads `stats_rollup` and must never touch
`companies` directly, so this is what keeps the numbers current.

The aggregation SQL is NOT duplicated here: it is imported from
scripts/one_time/build_stats_rollup.py, which stays the single definition and
the thing you run by hand for a first backfill. If the two ever drifted, the
nightly job and the manual rebuild would produce different statistics.

Restart safety: runner.py fires every bot once on startup, and Railway restarts
happen for all sorts of reasons. A full rebuild on every restart would be
wasted work, so this skips out when the last build is younger than
MIN_AGE_HOURS.
"""

import logging
import importlib.util
from pathlib import Path

log = logging.getLogger(__name__)

NAME     = "stats_rollup"
INTERVAL = 60 * 24        # minutes — once a day
MIN_AGE_HOURS = 20        # don't rebuild if the last one is fresher than this


def _load_builder():
    """Import the one_time builder by path (scripts/one_time is not a package)."""
    path = Path(__file__).parent.parent / "one_time" / "build_stats_rollup.py"
    spec = importlib.util.spec_from_file_location("build_stats_rollup", path)
    if spec is None or spec.loader is None:
        raise ImportError(f"cannot load {path}")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _topup_kad_codes(db):
    """
    Keep companies.primary_kad_code current for firms ingested since the last
    backfill.

    new_firms_watcher writes the raw ΓΕΜΗ payload and knows nothing about this
    denormalised column, so without this top-up every newly founded company
    would be invisible to the sector filter until someone re-ran the one_time
    backfill by hand. Deliberately implemented here rather than by editing the
    ingest path.

    Only touches rows where the column is NULL, so it is cheap once the initial
    backfill has run.
    """
    with db.cursor() as cur:
        cur.execute("""SELECT column_name FROM information_schema.columns
                       WHERE table_name='companies' AND column_name='primary_kad_code'""")
        if not cur.fetchone():
            log.info(f"[{NAME}] primary_kad_code not present -- run "
                     f"scripts/one_time/backfill_primary_kad_code.py first.")
            return

        cur.execute("""
            UPDATE companies c
            SET primary_kad_code = sub.code
            FROM (
                SELECT c2.ar_gemi,
                       (SELECT a->'activity'->>'id'
                          FROM jsonb_array_elements(c2.activities) a
                         WHERE a->>'type' = 'Κύρια'
                           AND a->>'dtTo' IS NULL
                         LIMIT 1) AS code
                FROM companies c2
                WHERE c2.primary_kad_code IS NULL
                  AND c2.activities IS NOT NULL
                LIMIT 50000
            ) sub
            WHERE c.ar_gemi = sub.ar_gemi
              AND sub.code IS NOT NULL
        """)
        if cur.rowcount:
            log.info(f"[{NAME}] primary_kad_code filled for {cur.rowcount:,} new rows.")
        db.commit()


def run(db, gemi):
    builder = _load_builder()

    # Runs before the freshness guard: new firms need a ΚΑΔ code even on days
    # when the rollup itself is skipped.
    _topup_kad_codes(db)

    with db.cursor() as cur:
        cur.execute("SELECT to_regclass('stats_meta')")
        exists = cur.fetchone()[0] is not None
        if exists:
            cur.execute(
                """SELECT EXTRACT(EPOCH FROM (now() - value::timestamptz)) / 3600
                   FROM stats_meta WHERE key = 'built_at'"""
            )
            row = cur.fetchone()
            if row and row[0] is not None and row[0] < MIN_AGE_HOURS:
                log.info(f"[{NAME}] Last build {row[0]:.1f}h ago -- skipping.")
                return

    log.info(f"[{NAME}] Rebuilding statistics rollup...")

    with db.cursor() as cur:
        cur.execute(f"SET statement_timeout = '{builder.STATEMENT_TIMEOUT}'")
        for _, ddl in builder.DDL:
            cur.execute(ddl)
        db.commit()

        grains = [
            ("day",   "day",   "CURRENT_DATE - {}".format(builder.DAY_WINDOW)),
            ("month", "month", "'{}'::date".format(builder.HISTORY_FROM)),
        ]

        total = 0
        for grain, trunc, since_expr in grains:
            cur.execute("SELECT ({})::date".format(since_expr))
            since = cur.fetchone()[0].isoformat()

            cur.execute("DELETE FROM stats_rollup WHERE grain = %s", (grain,))
            for label, dimension, sql_tpl in builder.AGGREGATIONS:
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
                total += cur.rowcount
            db.commit()
            log.info(f"[{NAME}] grain '{grain}' rebuilt from {since}")

        for k, v in [
            ("provisional_days", str(builder.PROVISIONAL_DAYS)),
            ("day_window",       str(builder.DAY_WINDOW)),
            ("history_from",     builder.HISTORY_FROM),
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
        db.commit()

    log.info(f"[{NAME}] Done -- {total:,} rows.")
