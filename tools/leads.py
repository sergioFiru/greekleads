"""
GreekLeads — Lead Explorer
Run:  python tools/leads.py
Open: http://localhost:5000
"""
import os, sys, io, csv, json as _json, threading
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from flask import Flask, jsonify, request, make_response
from dotenv import load_dotenv
import psycopg2, psycopg2.extras

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))

app = Flask(__name__)

_filters_cache = None
_filters_ready = threading.Event()  # set when cache is populated


def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=15)


def build_where(f):
    conds, params = [], []

    if f.get("name", "").strip():
        conds.append("co_name_el ILIKE %s")
        params.append("%" + f["name"].strip() + "%")

    if f.get("statuses"):
        ph = ",".join(["%s"] * len(f["statuses"]))
        conds.append(f"status_descr IN ({ph})")
        params.extend(f["statuses"])

    if f.get("prefecture"):
        conds.append("prefecture_descr = %s")
        params.append(f["prefecture"])

    if f.get("municipality", "").strip():
        conds.append("municipality_descr ILIKE %s")
        params.append("%" + f["municipality"].strip() + "%")

    if f.get("legal_types"):
        ph = ",".join(["%s"] * len(f["legal_types"]))
        conds.append(f"legal_type_descr IN ({ph})")
        params.extend(f["legal_types"])

    if f.get("has_email"):   conds.append("email IS NOT NULL AND email != ''")
    if f.get("has_phone"):   conds.append("phone IS NOT NULL AND phone != ''")
    if f.get("has_website"): conds.append("url IS NOT NULL AND url != ''")

    ct = f.get("company_type", "all")
    if ct == "hq":     conds.append("is_branch = false")
    elif ct == "branch": conds.append("is_branch = true")

    if f.get("year_from"):
        try:
            conds.append("EXTRACT(YEAR FROM incorporation_date) >= %s")
            params.append(int(f["year_from"]))
        except (ValueError, TypeError):
            pass

    if f.get("year_to"):
        try:
            conds.append("EXTRACT(YEAR FROM incorporation_date) <= %s")
            params.append(int(f["year_to"]))
        except (ValueError, TypeError):
            pass

    if f.get("activity", "").strip():
        # @> uses the GIN index — match primary KAD only
        conds.append("activities @> %s::jsonb")
        params.append(_json.dumps([{"type": "Κύρια", "activity": {"descr": f["activity"].strip()}}]))

    where = "WHERE " + " AND ".join(conds) if conds else ""
    return where, params


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

CACHE_FILE = os.path.join(os.path.dirname(__file__), ".filter_cache.json")


def _load_filters_bg():
    """Runs in a background thread — server starts immediately while this loads."""
    global _filters_cache
    try:
        # All filter data is cached locally — only queries DB on first ever run
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, encoding="utf-8") as f:
                _filters_cache = _json.load(f)
            s = _filters_cache
            print(f"  Filters loaded from cache — {len(s['statuses'])} statuses, "
                  f"{len(s['prefectures'])} prefectures, {len(s['legal_types'])} legal types, "
                  f"{len(s['activities'])} activities", flush=True)
            return

        print("  First run — querying DB to build filter cache...", flush=True)
        conn = get_conn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    "SELECT DISTINCT status_descr FROM companies "
                    "WHERE status_descr IS NOT NULL ORDER BY status_descr"
                )
                statuses = [r[0] for r in cur.fetchall()]

                cur.execute(
                    "SELECT DISTINCT prefecture_descr FROM companies "
                    "WHERE prefecture_descr IS NOT NULL ORDER BY prefecture_descr"
                )
                prefectures = [r[0] for r in cur.fetchall()]

                cur.execute("""
                    SELECT legal_type_descr FROM (
                        SELECT legal_type_descr, COUNT(*) AS cnt
                        FROM companies WHERE legal_type_descr IS NOT NULL
                        GROUP BY legal_type_descr ORDER BY cnt DESC LIMIT 40
                    ) sub ORDER BY legal_type_descr
                """)
                legal_types = [r[0] for r in cur.fetchall()]

                cur.execute("""
                    SELECT elem->'activity'->>'descr' AS descr, COUNT(*) AS cnt
                    FROM companies TABLESAMPLE SYSTEM(2),
                    LATERAL jsonb_array_elements(activities) AS elem
                    WHERE jsonb_array_length(activities) > 0
                      AND elem->>'type' = 'Κύρια'
                    GROUP BY descr
                    ORDER BY cnt DESC
                    LIMIT 500
                """)
                activities = sorted([r[0] for r in cur.fetchall()])
        finally:
            conn.close()

        _filters_cache = {
            "statuses": statuses,
            "prefectures": prefectures,
            "legal_types": legal_types,
            "activities": activities,
        }
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            _json.dump(_filters_cache, f, ensure_ascii=False)
        print(f"  Filter cache saved — {len(statuses)} statuses, {len(prefectures)} prefectures, "
              f"{len(legal_types)} legal types, {len(activities)} activities", flush=True)
    except Exception as e:
        print(f"  ERROR loading filters: {e}", flush=True)
        _filters_cache = {"statuses": [], "prefectures": [], "legal_types": [], "activities": []}
    finally:
        _filters_ready.set()


@app.route("/api/filters")
def get_filters():
    _filters_ready.wait(timeout=60)  # wait up to 60s for background load
    return jsonify(_filters_cache or {})


PAGE_SIZE = 50

SEARCH_COLS = [
    "ar_gemi", "co_name_el", "legal_type_descr", "status_descr",
    "prefecture_descr", "municipality_descr", "city",
    "phone", "email", "url", "incorporation_date", "is_branch", "afm",
]

EXPORT_COLS = [
    "ar_gemi", "afm", "co_name_el", "legal_type_descr", "status_descr",
    "prefecture_descr", "municipality_descr", "city", "street", "street_number",
    "zip_code", "phone", "email", "fax", "url",
    "incorporation_date", "is_branch", "gemi_office_descr",
]


@app.route("/api/search", methods=["POST"])
def search():
    body = request.json or {}
    f = body.get("filters", {})
    page = max(1, int(body.get("page", 1)))
    offset = (page - 1) * PAGE_SIZE
    where, params = build_where(f)

    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"SELECT COUNT(*) AS n FROM (SELECT 1 FROM companies {where} LIMIT 10001) sub",
                params,
            )
            raw = cur.fetchone()["n"]
            total = int(raw)
            capped = total > 10000

            cols = ", ".join(SEARCH_COLS)
            cur.execute(
                f"SELECT {cols} FROM companies {where} ORDER BY ar_gemi LIMIT %s OFFSET %s",
                params + [PAGE_SIZE, offset],
            )
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                if d.get("incorporation_date"):
                    d["incorporation_date"] = d["incorporation_date"].isoformat()[:10]
                rows.append(d)

        total_pages = max(1, (min(total, 10000) + PAGE_SIZE - 1) // PAGE_SIZE)
        return jsonify({"rows": rows, "total": total, "capped": capped,
                        "page": page, "total_pages": total_pages})
    finally:
        conn.close()


@app.route("/api/company/<ar_gemi>")
def get_company(ar_gemi):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("SELECT * FROM companies WHERE ar_gemi = %s", (ar_gemi,))
            row = cur.fetchone()
        if not row:
            return jsonify({"error": "Not found"}), 404
        d = dict(row)
        for k in ["gemi_fetched_at", "last_updated_at", "incorporation_date", "last_status_change"]:
            if d.get(k) and hasattr(d[k], "isoformat"):
                d[k] = d[k].isoformat()[:10]
        return jsonify(d)
    finally:
        conn.close()


@app.route("/api/export", methods=["POST"])
def export_csv():
    f = request.json or {}
    where, params = build_where(f)

    conn = get_conn()
    try:
        cols_sql = ", ".join(EXPORT_COLS)
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                f"SELECT {cols_sql} FROM companies {where} ORDER BY ar_gemi LIMIT 50000",
                params,
            )
            rows = cur.fetchall()

        output = io.StringIO()
        output.write("﻿")  # BOM for Excel
        writer = csv.DictWriter(output, fieldnames=EXPORT_COLS, extrasaction="ignore")
        writer.writeheader()
        for r in rows:
            d = dict(r)
            if d.get("incorporation_date") and hasattr(d["incorporation_date"], "isoformat"):
                d["incorporation_date"] = d["incorporation_date"].isoformat()[:10]
            writer.writerow(d)

        resp = make_response(output.getvalue())
        resp.headers["Content-Type"] = "text/csv; charset=utf-8-sig"
        resp.headers["Content-Disposition"] = "attachment; filename=greekleads_export.csv"
        return resp
    finally:
        conn.close()


@app.route("/")
def index():
    return HTML


# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------

HTML = r"""<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<title>GreekLeads — Lead Explorer</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --navy:#0f172a;--indigo:#6366f1;--indigo-dark:#4f46e5;
  --s50:#f8fafc;--s100:#f1f5f9;--s200:#e2e8f0;--s300:#cbd5e1;
  --s400:#94a3b8;--s500:#64748b;--s700:#374151;--s900:#0f172a;
  --green-bg:#dcfce7;--green-fg:#15803d;
  --red-bg:#fee2e2;--red-fg:#b91c1c;
  --yellow-bg:#fef9c3;--yellow-fg:#a16207;
  --blue-bg:#dbeafe;--blue-fg:#1d4ed8;
}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--s100);color:var(--s700);height:100vh;display:flex;flex-direction:column;overflow:hidden}

/* HEADER */
header{background:var(--navy);color:#fff;padding:11px 20px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.logo{display:flex;align-items:center;gap:10px}
.logo-dot{width:8px;height:8px;background:#22d3ee;border-radius:50%;animation:pulse 2s infinite}
.logo h1{font-size:17px;font-weight:700}
.logo sup{font-size:10px;color:var(--s400);font-weight:500;margin-left:2px}
.hdr-right{display:flex;align-items:center;gap:12px}
.hdr-count{font-size:13px;color:var(--s400)}
.hdr-count strong{color:#fff}

/* LAYOUT */
.layout{display:flex;flex:1;overflow:hidden}

/* SIDEBAR */
.sidebar{width:272px;flex-shrink:0;background:#fff;border-right:1px solid var(--s200);display:flex;flex-direction:column;overflow:hidden}
.sidebar-scroll{flex:1;overflow-y:auto;padding:14px 14px 0}
.sidebar-footer{padding:12px 14px;border-top:1px solid var(--s200);background:#fff}

.fg{margin-bottom:16px}
.flabel{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--s400);display:block;margin-bottom:7px}
input[type=text],select{width:100%;padding:7px 10px;border:1px solid var(--s200);border-radius:6px;font-size:13px;color:var(--s900);background:var(--s50);outline:none;transition:border .15s,box-shadow .15s}
input[type=text]:focus,select:focus{border-color:var(--indigo);box-shadow:0 0 0 3px rgba(99,102,241,.12);background:#fff}
input[type=text]::placeholder{color:var(--s300)}

.check-list{display:flex;flex-direction:column;gap:4px;max-height:150px;overflow-y:auto;padding-right:2px}
.check-item{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--s700);cursor:pointer;padding:2px 0;user-select:none}
.check-item:hover{color:var(--s900)}
input[type=checkbox],input[type=radio]{width:14px;height:14px;accent-color:var(--indigo);cursor:pointer;flex-shrink:0}

.yr{display:flex;gap:6px;align-items:center}
.yr input{flex:1;text-align:center}
.yr span{color:var(--s300);font-size:13px;flex-shrink:0}

hr.div{border:none;border-top:1px solid var(--s100);margin:4px 0 14px}

/* BUTTONS */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 14px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;border:none;transition:all .15s}
.btn-primary{background:var(--navy);color:#fff}
.btn-primary:hover{background:#1e293b}
.btn-export{background:#059669;color:#fff}
.btn-export:hover{background:#047857}
.btn-reset{background:transparent;color:var(--s500);border:1px solid var(--s200)}
.btn-reset:hover{background:var(--s50)}
.btn-full{width:100%;padding:9px 14px}
.btn:disabled{opacity:.45;cursor:default;pointer-events:none}

/* RESULTS */
.results{flex:1;display:flex;flex-direction:column;overflow:hidden}
.results-bar{padding:11px 20px;background:#fff;border-bottom:1px solid var(--s200);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;gap:12px}
.res-count{font-size:13px;color:var(--s500)}
.res-count strong{font-size:15px;color:var(--s900)}
.res-actions{display:flex;align-items:center;gap:8px;flex-shrink:0}

/* TABLE */
.table-wrap{flex:1;overflow:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
thead{position:sticky;top:0;z-index:2}
th{background:var(--s50);padding:9px 14px;text-align:left;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--s500);border-bottom:1px solid var(--s200);white-space:nowrap}
td{padding:10px 14px;border-bottom:1px solid var(--s100);vertical-align:middle;white-space:nowrap;max-width:0}
td.td-name{width:240px}
td.td-wrap{white-space:normal;word-break:break-word}
.ov{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
tr:hover td{background:var(--s50);cursor:pointer}
.co-name{font-weight:600;color:var(--s900);font-size:13px}
.co-sub{font-size:11px;color:var(--s400);margin-top:2px}
.nd{color:var(--s300)}

/* BADGES */
.badge{display:inline-block;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
.b-active{background:var(--green-bg);color:var(--green-fg)}
.b-struck{background:var(--red-bg);color:var(--red-fg)}
.b-dormant{background:var(--yellow-bg);color:var(--yellow-fg)}
.b-liquid{background:var(--blue-bg);color:var(--blue-fg)}
.b-other{background:var(--s100);color:var(--s500)}

/* PAGINATION */
.pg-bar{padding:10px 20px;background:#fff;border-top:1px solid var(--s200);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.pg-info{font-size:12px;color:var(--s400)}
.pg-btns{display:flex;gap:3px}
.pg-btn{width:30px;height:30px;border-radius:5px;border:1px solid var(--s200);background:#fff;font-size:13px;cursor:pointer;display:flex;align-items:center;justify-content:center;color:var(--s700);font-weight:500;transition:all .12s}
.pg-btn:hover{border-color:var(--indigo);color:var(--indigo)}
.pg-btn.cur{background:var(--indigo);color:#fff;border-color:var(--indigo)}
.pg-btn:disabled{opacity:.35;pointer-events:none}
.pg-ellipsis{width:24px;text-align:center;color:var(--s300);font-size:14px;line-height:30px}

/* EMPTY / LOADING */
.state{text-align:center;padding:80px 40px;color:var(--s400)}
.state h3{font-size:16px;font-weight:600;color:var(--s500);margin-bottom:10px}
.state p{font-size:14px;line-height:1.7;color:var(--s400)}
.state .stat-big{font-size:36px;font-weight:800;color:var(--s300);letter-spacing:-.02em;margin-bottom:8px}

/* DETAIL PANEL */
.overlay{position:fixed;inset:0;background:rgba(0,0,0,.2);z-index:100;display:none}
.overlay.on{display:block}
.dp{position:fixed;top:0;right:-540px;bottom:0;width:520px;background:#fff;z-index:101;box-shadow:-4px 0 30px rgba(0,0,0,.1);display:flex;flex-direction:column;transition:right .25s ease}
.dp.on{right:0}
.dp-head{padding:18px 22px;border-bottom:1px solid var(--s200);display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-shrink:0}
.dp-head h2{font-size:15px;font-weight:700;color:var(--s900);line-height:1.4}
.dp-head small{font-size:11.5px;color:var(--s400);display:block;margin-top:3px}
.dp-close{background:none;border:none;cursor:pointer;color:var(--s400);font-size:20px;padding:2px;flex-shrink:0;line-height:1}
.dp-close:hover{color:var(--s700)}
.dp-body{flex:1;overflow-y:auto;padding:18px 22px}
.dp-sec{margin-bottom:20px}
.dp-sec h4{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:var(--s400);margin-bottom:10px}
.dp-row{display:flex;gap:8px;margin-bottom:7px;font-size:13px}
.dp-k{color:var(--s400);width:130px;flex-shrink:0;padding-top:1px}
.dp-v{color:var(--s900);flex:1;word-break:break-word}
.dp-v a{color:var(--indigo);text-decoration:none}
.dp-v a:hover{text-decoration:underline}
.act-tag{display:inline-block;background:#e0e7ff;color:#3730a3;padding:3px 8px;border-radius:4px;font-size:11.5px;margin:2px 3px 2px 0;line-height:1.4}

@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}
::-webkit-scrollbar{width:5px;height:5px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:var(--s200);border-radius:3px}
</style>
</head>
<body>

<header>
  <div class="logo">
    <div class="logo-dot"></div>
    <div><h1>GreekLeads <sup>Lead Explorer</sup></h1></div>
  </div>
  <div class="hdr-right">
    <span class="hdr-count" id="hdr-count"></span>
    <button class="btn btn-export" id="export-btn" onclick="exportCSV()" disabled>↓ Export CSV</button>
  </div>
</header>

<div class="layout">

  <!-- SIDEBAR -->
  <aside class="sidebar">
    <div class="sidebar-scroll">

      <div class="fg">
        <label class="flabel">Company Name</label>
        <input type="text" id="f-name" placeholder="Search in Greek…" oninput="dbs()">
      </div>

      <div class="fg">
        <label class="flabel">Status</label>
        <div class="check-list" id="status-list">
          <span style="font-size:12px;color:var(--s300)">Loading…</span>
        </div>
      </div>

      <hr class="div">

      <div class="fg">
        <label class="flabel">Prefecture</label>
        <select id="f-prefecture" onchange="doSearch(1)">
          <option value="">All prefectures</option>
        </select>
      </div>

      <div class="fg">
        <label class="flabel">Municipality</label>
        <input type="text" id="f-muni" placeholder="Type to search…" oninput="dbs()">
      </div>

      <hr class="div">

      <div class="fg">
        <label class="flabel">Legal Type</label>
        <div class="check-list" id="legal-list" style="max-height:170px">
          <span style="font-size:12px;color:var(--s300)">Loading…</span>
        </div>
      </div>

      <hr class="div">

      <div class="fg">
        <label class="flabel">Has Contact Info</label>
        <div style="display:flex;flex-direction:column;gap:5px">
          <label class="check-item"><input type="checkbox" id="f-email" onchange="doSearch(1)"> Email</label>
          <label class="check-item"><input type="checkbox" id="f-phone" onchange="doSearch(1)"> Phone</label>
          <label class="check-item"><input type="checkbox" id="f-web" onchange="doSearch(1)"> Website</label>
        </div>
      </div>

      <hr class="div">

      <div class="fg">
        <label class="flabel">Company Type</label>
        <div style="display:flex;flex-direction:column;gap:5px">
          <label class="check-item"><input type="radio" name="ctype" value="all" checked onchange="doSearch(1)"> All</label>
          <label class="check-item"><input type="radio" name="ctype" value="hq" onchange="doSearch(1)"> Headquarters only</label>
          <label class="check-item"><input type="radio" name="ctype" value="branch" onchange="doSearch(1)"> Branches only</label>
        </div>
      </div>

      <hr class="div">

      <div class="fg">
        <label class="flabel">Founded Year</label>
        <div class="yr">
          <input type="text" id="f-yfrom" placeholder="1900" maxlength="4" oninput="dbs()">
          <span>–</span>
          <input type="text" id="f-yto" placeholder="2026" maxlength="4" oninput="dbs()">
        </div>
      </div>

      <hr class="div">

      <div class="fg">
        <label class="flabel">Activity / Sector</label>
        <select id="f-activity" onchange="doSearch(1)">
          <option value="">All activities</option>
        </select>
      </div>

    </div>
    <div class="sidebar-footer">
      <button class="btn btn-primary btn-full" onclick="doSearch(1)">Search</button>
      <button class="btn btn-reset btn-full" style="margin-top:7px" onclick="resetAll()">Reset filters</button>
    </div>
  </aside>

  <!-- RESULTS -->
  <main class="results">
    <div class="results-bar">
      <div class="res-count" id="res-count">
        <span style="color:var(--s400)">Use the filters to search companies</span>
      </div>
      <div class="res-actions" id="res-actions"></div>
    </div>

    <div class="table-wrap" id="table-wrap">
      <div class="state">
        <div class="stat-big">1.6M+</div>
        <h3>Greek companies in the database</h3>
        <p>Use the filters on the left to find the companies you need.<br>Export up to 50,000 results as CSV.</p>
      </div>
    </div>

    <div class="pg-bar" id="pg-bar" style="display:none">
      <span class="pg-info" id="pg-info"></span>
      <div class="pg-btns" id="pg-btns"></div>
    </div>
  </main>

</div>

<!-- Detail panel -->
<div class="overlay" id="overlay" onclick="closeDp()"></div>
<div class="dp" id="dp">
  <div class="dp-head">
    <div><h2 id="dp-name">—</h2><small id="dp-sub"></small></div>
    <button class="dp-close" onclick="closeDp()">✕</button>
  </div>
  <div class="dp-body" id="dp-body"><p style="color:var(--s400);font-size:13px">Loading…</p></div>
</div>

<script>
// ── State ──────────────────────────────────────────────────────────────────
let curPage = 1, curFilters = {}, totalPages = 1;
let dbTimer = null;
const rowCache = {};

// ── Init ───────────────────────────────────────────────────────────────────
loadFilters();

async function loadFilters() {
  const d = await fetch('/api/filters').then(r => r.json());
  populateFilters(d);
}

function populateFilters(d) {
  document.getElementById('status-list').innerHTML =
    d.statuses.map(s => `<label class="check-item">
      <input type="checkbox" class="f-status" value="${xe(s)}" onchange="doSearch(1)">
      ${xe(s)}</label>`).join('');

  const sel = document.getElementById('f-prefecture');
  d.prefectures.forEach(p => {
    const o = document.createElement('option');
    o.value = p; o.textContent = p; sel.appendChild(o);
  });

  document.getElementById('legal-list').innerHTML =
    d.legal_types.map(lt => `<label class="check-item">
      <input type="checkbox" class="f-legal" value="${xe(lt)}" onchange="doSearch(1)">
      ${xe(lt)}</label>`).join('');

  const asel = document.getElementById('f-activity');
  (d.activities || []).forEach(a => {
    const o = document.createElement('option');
    o.value = a; o.textContent = a; asel.appendChild(o);
  });
}

// ── Filters ────────────────────────────────────────────────────────────────
function getFilters() {
  const statuses   = [...document.querySelectorAll('.f-status:checked')].map(e => e.value);
  const legal_types = [...document.querySelectorAll('.f-legal:checked')].map(e => e.value);
  const ctype = document.querySelector('input[name="ctype"]:checked')?.value || 'all';
  return {
    name:         document.getElementById('f-name').value,
    statuses:     statuses.length ? statuses : null,
    prefecture:   document.getElementById('f-prefecture').value || null,
    municipality: document.getElementById('f-muni').value,
    legal_types:  legal_types.length ? legal_types : null,
    has_email:    document.getElementById('f-email').checked,
    has_phone:    document.getElementById('f-phone').checked,
    has_website:  document.getElementById('f-web').checked,
    company_type: ctype,
    year_from:    document.getElementById('f-yfrom').value || null,
    year_to:      document.getElementById('f-yto').value || null,
    activity:     document.getElementById('f-activity').value,
  };
}

function hasFilter(f) {
  return f.name || f.statuses || f.prefecture || f.municipality ||
         f.legal_types || f.has_email || f.has_phone || f.has_website ||
         f.company_type !== 'all' || f.year_from || f.year_to || f.activity;
}

function dbs() {
  clearTimeout(dbTimer);
  dbTimer = setTimeout(() => doSearch(1), 420);
}

function resetAll() {
  document.getElementById('f-name').value = '';
  document.getElementById('f-prefecture').value = '';
  document.getElementById('f-muni').value = '';
  document.getElementById('f-yfrom').value = '';
  document.getElementById('f-yto').value = '';
  document.getElementById('f-activity').value = '';
  document.getElementById('f-email').checked = false;
  document.getElementById('f-phone').checked = false;
  document.getElementById('f-web').checked = false;
  document.querySelector('input[name="ctype"][value="all"]').checked = true;
  document.querySelectorAll('.f-status,.f-legal').forEach(el => el.checked = false);
  doSearch(1);
}

// ── Search ─────────────────────────────────────────────────────────────────
async function doSearch(page) {
  curPage = page;
  curFilters = getFilters();

  if (!hasFilter(curFilters)) {
    document.getElementById('table-wrap').innerHTML = `
      <div class="state">
        <div class="stat-big">1.6M+</div>
        <h3>Greek companies in the database</h3>
        <p>Use the filters on the left to find the companies you need.<br>Export up to 50,000 results as CSV.</p>
      </div>`;
    document.getElementById('res-count').innerHTML = '<span style="color:var(--s400)">Use the filters to search companies</span>';
    document.getElementById('hdr-count').textContent = '';
    document.getElementById('pg-bar').style.display = 'none';
    document.getElementById('res-actions').innerHTML = '';
    document.getElementById('export-btn').disabled = true;
    return;
  }

  document.getElementById('table-wrap').innerHTML =
    '<div class="state"><p>Searching…</p></div>';
  document.getElementById('res-count').innerHTML = '<span style="color:var(--s400)">Searching…</span>';

  let data;
  try {
    const resp = await fetch('/api/search', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({filters: curFilters, page})
    });
    data = await resp.json();
  } catch(e) {
    document.getElementById('table-wrap').innerHTML =
      '<div class="state"><p style="color:#ef4444">Connection error.</p></div>';
    return;
  }

  totalPages = data.total_pages;
  renderTable(data.rows);
  renderCount(data.total, data.capped, data.page, data.total_pages);
  renderPager(data.page, data.total_pages);
  document.getElementById('export-btn').disabled = data.total === 0;
}

// ── Table ──────────────────────────────────────────────────────────────────
function renderTable(rows) {
  if (!rows.length) {
    document.getElementById('table-wrap').innerHTML =
      '<div class="state"><h3>No results found</h3><p>Try adjusting your filters.</p></div>';
    return;
  }

  const tbody = rows.map(r => {
    rowCache[r.ar_gemi] = r;
    const founded = r.incorporation_date ? r.incorporation_date.slice(0,4) : '<span class="nd">—</span>';
    const ltype = r.legal_type_descr
      ? `<span title="${xa(r.legal_type_descr)}" class="ov" style="display:block;max-width:120px">${xt(r.legal_type_descr)}</span>`
      : '<span class="nd">—</span>';
    const phone = r.phone ? xt(r.phone) : '<span class="nd">—</span>';
    const email = r.email
      ? `<span class="ov" style="display:block;max-width:160px" title="${xa(r.email)}">${xt(r.email)}</span>`
      : '<span class="nd">—</span>';
    let web = '<span class="nd">—</span>';
    if (r.url) {
      const href = r.url.startsWith('http') ? r.url : 'http://'+r.url;
      web = `<a href="${xa(href)}" target="_blank" onclick="event.stopPropagation()" title="${xa(r.url)}" style="color:var(--indigo)">↗</a>`;
    }
    return `<tr data-id="${r.ar_gemi}">
      <td class="td-name">
        <div class="co-name ov">${xt(r.co_name_el || '—')}</div>
        <div class="co-sub">ΓΕΜΗ ${r.ar_gemi}${r.is_branch ? ' · Branch' : ''}</div>
      </td>
      <td style="max-width:130px">${ltype}</td>
      <td>${badge(r.status_descr)}</td>
      <td style="max-width:120px"><span class="ov" style="display:block;max-width:120px">${xt(r.prefecture_descr||'—')}</span></td>
      <td style="max-width:110px"><span class="ov" style="display:block;max-width:110px">${xt(r.city||r.municipality_descr||'—')}</span></td>
      <td style="max-width:130px"><span class="ov" style="display:block;max-width:130px">${phone}</span></td>
      <td style="max-width:170px">${email}</td>
      <td style="text-align:center">${web}</td>
      <td>${founded}</td>
    </tr>`;
  }).join('');

  document.getElementById('table-wrap').innerHTML = `
    <table>
      <thead><tr>
        <th>Company Name</th><th>Legal Type</th><th>Status</th>
        <th>Prefecture</th><th>City</th><th>Phone</th>
        <th>Email</th><th>Web</th><th>Founded</th>
      </tr></thead>
      <tbody>${tbody}</tbody>
    </table>`;

  document.querySelectorAll('tr[data-id]').forEach(tr =>
    tr.addEventListener('click', () => openDp(tr.dataset.id)));
}

function badge(s) {
  if (!s) return '<span class="badge b-other">—</span>';
  const u = s.toUpperCase();
  if (u.includes('ΕΝΕΡΓ')) return `<span class="badge b-active">${xt(s)}</span>`;
  if (u.includes('ΔΙΑΓ') || u.includes('CANCEL')) return `<span class="badge b-struck">${xt(s)}</span>`;
  if (u.includes('ΕΚΚΑΘ') || u.includes('LIQUID')) return `<span class="badge b-liquid">${xt(s)}</span>`;
  if (u.includes('ΑΔΡ') || u.includes('ΑΝΑΣΤ') || u.includes('DORMANT')) return `<span class="badge b-dormant">${xt(s)}</span>`;
  return `<span class="badge b-other">${xt(s)}</span>`;
}

// ── Count & Pagination ─────────────────────────────────────────────────────
function renderCount(total, capped, page, tPages) {
  const fmt = n => n.toLocaleString('el-GR');
  const label = capped ? '10.000+' : fmt(total);
  const noun  = total === 1 ? 'company' : 'companies';
  document.getElementById('res-count').innerHTML = `<strong>${label}</strong> ${noun} found`;
  document.getElementById('hdr-count').innerHTML = `<strong>${label}</strong> results`;
}

function renderPager(page, tp) {
  const bar = document.getElementById('pg-bar');
  if (tp <= 1) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  document.getElementById('pg-info').textContent = `Page ${page} of ${tp}`;

  const pages = smartRange(page, tp);
  let prev = null, btns = [];
  btns.push(`<button class="pg-btn" ${page===1?'disabled':''} onclick="doSearch(${page-1})">‹</button>`);
  for (const p of pages) {
    if (prev !== null && p - prev > 1)
      btns.push('<span class="pg-ellipsis">…</span>');
    btns.push(`<button class="pg-btn${p===page?' cur':''}" onclick="doSearch(${p})">${p}</button>`);
    prev = p;
  }
  btns.push(`<button class="pg-btn" ${page===tp?'disabled':''} onclick="doSearch(${page+1})">›</button>`);
  document.getElementById('pg-btns').innerHTML = btns.join('');
}

function smartRange(cur, total) {
  if (total <= 7) return Array.from({length:total},(_,i)=>i+1);
  const s = new Set([1, total]);
  for (let i = Math.max(1,cur-2); i <= Math.min(total,cur+2); i++) s.add(i);
  return [...s].sort((a,b)=>a-b);
}

// ── Export ─────────────────────────────────────────────────────────────────
async function exportCSV() {
  const btn = document.getElementById('export-btn');
  btn.disabled = true; btn.textContent = 'Exporting…';
  try {
    const resp = await fetch('/api/export', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(curFilters)
    });
    if (!resp.ok) { alert('Export failed.'); return; }
    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'greekleads_export.csv'; a.click();
    URL.revokeObjectURL(url);
  } finally {
    btn.disabled = false; btn.textContent = '↓ Export CSV';
  }
}

// ── Detail Panel ───────────────────────────────────────────────────────────
async function openDp(id) {
  const cached = rowCache[id];
  document.getElementById('dp-name').textContent = cached?.co_name_el || '…';
  document.getElementById('dp-sub').textContent = `ΓΕΜΗ ${id}`;
  document.getElementById('dp-body').innerHTML = '<p style="color:var(--s400);font-size:13px">Loading…</p>';
  document.getElementById('overlay').classList.add('on');
  document.getElementById('dp').classList.add('on');

  try {
    const r = await fetch(`/api/company/${id}`).then(x => x.json());
    if (r.error) { document.getElementById('dp-body').innerHTML = '<p style="color:#ef4444">Not found.</p>'; return; }

    document.getElementById('dp-name').textContent = r.co_name_el || '—';
    document.getElementById('dp-sub').textContent =
      `ΓΕΜΗ ${r.ar_gemi}  ·  ΑΦΜ ${r.afm||'—'}  ·  ${r.is_branch?'Branch':'Headquarters'}`;

    const acts = (r.activities||[]).map(a => {
      const act   = a.activity || {};
      const code  = act.id || '';
      const descr = act.descr || '';
      const type  = a.type || '';
      const label = [code, descr].filter(Boolean).join(' – ');
      return `<span class="act-tag" title="${xa(type)}">${xt(label||JSON.stringify(a))}</span>`;
    }).join('');

    const persons = (r.persons||[]).slice(0,6).map(p => {
      const name = p.personName || p.name || '';
      const role = p.roleDescr || p.role || '';
      return dr(role||'Person', name);
    }).join('');

    document.getElementById('dp-body').innerHTML = `
      <div class="dp-sec">
        <h4>Identity</h4>
        ${dr('Name', r.co_name_el)}
        ${dr('Legal Type', r.legal_type_descr)}
        ${dr('Status', r.status_descr)}
        ${dr('Founded', r.incorporation_date)}
        ${dr('Last Change', r.last_status_change)}
        ${dr('AFM', r.afm)}
        ${dr('GEMI Office', r.gemi_office_descr)}
        ${dr('Branch?', r.is_branch ? 'Yes' : 'No')}
      </div>
      <div class="dp-sec">
        <h4>Location</h4>
        ${dr('Prefecture', r.prefecture_descr)}
        ${dr('Municipality', r.municipality_descr)}
        ${dr('City', r.city)}
        ${dr('Address', [r.street, r.street_number].filter(Boolean).join(' '))}
        ${dr('ZIP', r.zip_code)}
      </div>
      <div class="dp-sec">
        <h4>Contact</h4>
        ${dr('Phone', r.phone)}
        ${dr('Fax', r.fax)}
        ${dr('Email', r.email)}
        ${drLink('Website', r.url)}
      </div>
      ${acts ? `<div class="dp-sec"><h4>Activities</h4>${acts}</div>` : ''}
      ${persons ? `<div class="dp-sec"><h4>Key Persons</h4>${persons}</div>` : ''}
      ${r.objective ? `<div class="dp-sec"><h4>Objective</h4><p style="font-size:13px;line-height:1.6;color:var(--s700)">${xt(r.objective)}</p></div>` : ''}
    `;
  } catch(e) {
    document.getElementById('dp-body').innerHTML = '<p style="color:#ef4444">Error loading details.</p>';
  }
}

function closeDp() {
  document.getElementById('overlay').classList.remove('on');
  document.getElementById('dp').classList.remove('on');
}

function dr(label, val) {
  if (!val) return '';
  return `<div class="dp-row"><span class="dp-k">${label}</span><span class="dp-v">${xt(String(val))}</span></div>`;
}
function drLink(label, url) {
  if (!url) return '';
  const href = url.startsWith('http') ? url : 'http://'+url;
  return `<div class="dp-row"><span class="dp-k">${label}</span><span class="dp-v"><a href="${xa(href)}" target="_blank">${xt(url)}</a></span></div>`;
}

// ── Utils ──────────────────────────────────────────────────────────────────
function xt(s) { const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }
function xa(s) { return String(s).replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function xe(s) { const d=document.createElement('div'); d.textContent=String(s); return d.innerHTML; }

document.addEventListener('keydown', e => { if(e.key==='Escape') closeDp(); });
</script>
</body>
</html>"""

if __name__ == "__main__":
    print("Starting GreekLeads Lead Explorer...")
    threading.Thread(target=_load_filters_bg, daemon=True).start()
    print("Open: http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)
