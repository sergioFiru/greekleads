import os
import psycopg2
import psycopg2.extras

_conn = None

COMPANY_COLS = [
    "ar_gemi", "afm", "co_name_el", "co_names_en", "co_titles_el", "co_titles_en",
    "objective", "municipality_id", "municipality_descr", "prefecture_id", "prefecture_descr",
    "city", "street", "street_number", "zip_code", "po_box",
    "email", "phone", "fax", "url",
    "legal_type_id", "legal_type_descr", "gemi_office_id", "gemi_office_descr",
    "status_id", "status_descr", "is_branch", "auto_registered",
    "incorporation_date", "last_status_change",
    "activities", "persons", "capital", "stocks", "branches",
    "gemi_fetched_at", "last_updated_at",
]

_JSON_COLS = {
    "co_names_en", "co_titles_el", "co_titles_en",
    "activities", "persons", "capital", "stocks", "branches",
}


def get_conn():
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)
        return _conn
    try:
        with _conn.cursor() as cur:
            cur.execute("SELECT 1")
        return _conn
    except Exception:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=30)
        return _conn


def upsert_companies(conn, records):
    """Bulk upsert a list of company dicts (output of map_company)."""
    def to_tuple(r):
        return tuple(
            psycopg2.extras.Json(r.get(c)) if c in _JSON_COLS else r.get(c)
            for c in COMPANY_COLS
        )

    values = [to_tuple(r) for r in records]
    cols   = ", ".join(COMPANY_COLS)
    updates = ", ".join(f"{c} = EXCLUDED.{c}" for c in COMPANY_COLS if c != "ar_gemi")

    sql = f"""
        INSERT INTO companies ({cols})
        VALUES %s
        ON CONFLICT (ar_gemi) DO UPDATE SET {updates}
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, values)
    conn.commit()
