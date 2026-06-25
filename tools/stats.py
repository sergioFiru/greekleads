"""
GreekLeads Statistics Dashboard
Run: python tools/stats.py
Open: http://localhost:5000
"""

import os
import sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "scripts"))

from flask import Flask, jsonify, request
from dotenv import load_dotenv
import psycopg2
import psycopg2.extras

load_dotenv(os.path.join(os.path.dirname(__file__), "..", "scripts", ".env"))

app = Flask(__name__)

def get_conn():
    return psycopg2.connect(os.getenv("DATABASE_URL"), connect_timeout=15)

def query(sql, params=None):
    conn = get_conn()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(sql, params)
            return [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

def query_one(sql, params=None):
    rows = query(sql, params)
    return rows[0] if rows else {}

# ---------------------------------------------------------------------------
# API endpoints
# ---------------------------------------------------------------------------

@app.route("/api/overview")
def overview():
    conn = get_conn()
    cur = conn.cursor()
    stats = {}

    cur.execute("SELECT COUNT(*) FROM companies")
    stats["total"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE status_descr ILIKE '%ενεργ%' OR status_descr ILIKE '%activ%'")
    stats["active"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE is_branch = false")
    stats["hq"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE url IS NOT NULL AND url != ''")
    stats["with_url"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE email IS NOT NULL AND email != ''")
    stats["with_email"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE phone IS NOT NULL AND phone != ''")
    stats["with_phone"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE incorporation_date >= '2026-01-01'")
    stats["founded_2026"] = cur.fetchone()[0]

    cur.execute("SELECT COUNT(*) FROM companies WHERE incorporation_date >= '2025-01-01' AND incorporation_date < '2026-01-01'")
    stats["founded_2025"] = cur.fetchone()[0]

    conn.close()
    return jsonify(stats)

@app.route("/api/by_status")
def by_status():
    rows = query("""
        SELECT COALESCE(status_descr, 'Unknown') as label, COUNT(*) as count
        FROM companies
        GROUP BY status_descr
        ORDER BY count DESC
        LIMIT 15
    """)
    return jsonify(rows)

@app.route("/api/by_legal_type")
def by_legal_type():
    rows = query("""
        SELECT COALESCE(legal_type_descr, 'Unknown') as label, COUNT(*) as count
        FROM companies
        GROUP BY legal_type_descr
        ORDER BY count DESC
        LIMIT 15
    """)
    return jsonify(rows)

@app.route("/api/by_prefecture")
def by_prefecture():
    rows = query("""
        SELECT COALESCE(prefecture_descr, 'Unknown') as label, COUNT(*) as count
        FROM companies
        WHERE prefecture_descr IS NOT NULL
        GROUP BY prefecture_descr
        ORDER BY count DESC
        LIMIT 20
    """)
    return jsonify(rows)

@app.route("/api/by_year")
def by_year():
    rows = query("""
        SELECT EXTRACT(YEAR FROM incorporation_date)::int as year, COUNT(*) as count
        FROM companies
        WHERE incorporation_date IS NOT NULL
          AND EXTRACT(YEAR FROM incorporation_date) BETWEEN 2000 AND 2026
        GROUP BY 1
        ORDER BY 1 DESC
    """)
    return jsonify(rows)

@app.route("/api/query", methods=["POST"])
def custom_query():
    sql = request.json.get("sql", "").strip()
    if not sql:
        return jsonify({"error": "Empty query"}), 400
    # Safety: only allow SELECT
    if not sql.upper().startswith("SELECT"):
        return jsonify({"error": "Only SELECT queries are allowed"}), 400
    try:
        rows = query(sql)
        return jsonify({"rows": rows, "count": len(rows)})
    except Exception as e:
        return jsonify({"error": str(e)}), 400

# ---------------------------------------------------------------------------
# Dashboard HTML
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return DASHBOARD_HTML

DASHBOARD_HTML = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>GreekLeads — Statistics</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f0f2f5; color: #1a1a2e; }

  header { background: #1a1a2e; color: white; padding: 20px 32px; display: flex; align-items: center; gap: 12px; }
  header h1 { font-size: 20px; font-weight: 600; }
  header span { font-size: 13px; color: #8892b0; }
  .dot { width: 8px; height: 8px; background: #64ffda; border-radius: 50%; animation: pulse 2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

  main { padding: 28px 32px; max-width: 1400px; margin: 0 auto; }

  h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .08em; color: #8892b0; margin: 28px 0 12px; }

  /* Cards */
  .cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; }
  .card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .card .label { font-size: 12px; color: #8892b0; margin-bottom: 8px; font-weight: 500; }
  .card .value { font-size: 28px; font-weight: 700; color: #1a1a2e; }
  .card .sub { font-size: 12px; color: #64ffda; margin-top: 4px; font-weight: 500; }
  .card.accent { background: #1a1a2e; }
  .card.accent .label { color: #8892b0; }
  .card.accent .value { color: white; }

  /* Tables section */
  .tables { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
  @media (max-width: 900px) { .tables { grid-template-columns: 1fr; } }
  .table-card { background: white; border-radius: 10px; padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,.06); overflow: hidden; }
  .table-card h3 { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 6px 8px; color: #8892b0; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1px solid #f0f2f5; }
  td { padding: 8px 8px; border-bottom: 1px solid #f8f9fa; }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: #f8f9fa; }
  .bar-cell { display: flex; align-items: center; gap: 8px; }
  .bar { height: 6px; background: #e8eaf6; border-radius: 3px; flex: 1; overflow: hidden; min-width: 60px; }
  .bar-fill { height: 100%; background: #5c6bc0; border-radius: 3px; transition: width .6s ease; }
  .num { font-variant-numeric: tabular-nums; color: #1a1a2e; font-weight: 500; text-align: right; white-space: nowrap; }
  .pct { font-size: 11px; color: #8892b0; text-align: right; white-space: nowrap; }

  /* Custom query */
  .query-card { background: white; border-radius: 10px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.06); }
  .query-card h3 { font-size: 14px; font-weight: 600; margin-bottom: 14px; }
  .query-row { display: flex; gap: 10px; align-items: flex-start; }
  textarea { flex: 1; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 13px; padding: 12px; border: 1px solid #e0e0e0; border-radius: 8px; resize: vertical; min-height: 80px; outline: none; transition: border .2s; }
  textarea:focus { border-color: #5c6bc0; }
  button { background: #1a1a2e; color: white; border: none; padding: 12px 22px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; transition: background .2s; }
  button:hover { background: #2d2d5e; }
  button:disabled { background: #c0c0c0; cursor: default; }
  .result-meta { font-size: 12px; color: #8892b0; margin: 12px 0 8px; }
  .result-table-wrap { overflow-x: auto; }
  .error { color: #e53935; font-size: 13px; padding: 10px; background: #fff5f5; border-radius: 6px; margin-top: 10px; }

  .loading { color: #8892b0; font-size: 13px; padding: 20px 0; }
  .hint { font-size: 12px; color: #b0b8c8; margin-top: 6px; }
</style>
</head>
<body>

<header>
  <div class="dot"></div>
  <h1>GreekLeads</h1>
  <span>Live Database Statistics</span>
</header>

<main>

  <h2>Overview</h2>
  <div class="cards" id="cards">
    <div class="loading">Loading...</div>
  </div>

  <h2>Breakdown</h2>
  <div class="tables">
    <div class="table-card">
      <h3>By Status</h3>
      <table id="t-status"><tr><td class="loading">Loading...</td></tr></table>
    </div>
    <div class="table-card">
      <h3>By Legal Type</h3>
      <table id="t-legal"><tr><td class="loading">Loading...</td></tr></table>
    </div>
    <div class="table-card">
      <h3>By Prefecture (Top 20)</h3>
      <table id="t-prefecture"><tr><td class="loading">Loading...</td></tr></table>
    </div>
    <div class="table-card">
      <h3>Registrations by Year (2000–2026)</h3>
      <table id="t-year"><tr><td class="loading">Loading...</td></tr></table>
    </div>
  </div>

  <h2>Custom Query</h2>
  <div class="query-card">
    <h3>Run any SELECT query</h3>
    <div class="query-row">
      <textarea id="sql" placeholder="SELECT prefecture_descr, COUNT(*) as n FROM companies WHERE status_descr ILIKE '%ενεργ%' GROUP BY 1 ORDER BY 2 DESC LIMIT 10"></textarea>
      <button id="run-btn" onclick="runQuery()">Run</button>
    </div>
    <p class="hint">Only SELECT queries. Results capped at display. Direct connection to Railway PostgreSQL.</p>
    <div id="query-result"></div>
  </div>

</main>

<script>
function fmt(n) {
  return n == null ? '—' : Number(n).toLocaleString('en');
}
function pct(n, total) {
  if (!total) return '';
  return (n / total * 100).toFixed(1) + '%';
}

// Overview cards
fetch('/api/overview').then(r => r.json()).then(d => {
  const total = d.total || 1;
  document.getElementById('cards').innerHTML = `
    <div class="card accent">
      <div class="label">Total Companies</div>
      <div class="value">${fmt(d.total)}</div>
    </div>
    <div class="card">
      <div class="label">Active</div>
      <div class="value">${fmt(d.active)}</div>
      <div class="sub">${pct(d.active, total)} of total</div>
    </div>
    <div class="card">
      <div class="label">Headquarters</div>
      <div class="value">${fmt(d.hq)}</div>
      <div class="sub">${pct(d.hq, total)} of total</div>
    </div>
    <div class="card">
      <div class="label">Have Website</div>
      <div class="value">${fmt(d.with_url)}</div>
      <div class="sub">${pct(d.with_url, total)} of total</div>
    </div>
    <div class="card">
      <div class="label">Have Email</div>
      <div class="value">${fmt(d.with_email)}</div>
      <div class="sub">${pct(d.with_email, total)} of total</div>
    </div>
    <div class="card">
      <div class="label">Have Phone</div>
      <div class="value">${fmt(d.with_phone)}</div>
      <div class="sub">${pct(d.with_phone, total)} of total</div>
    </div>
    <div class="card">
      <div class="label">Founded 2026</div>
      <div class="value">${fmt(d.founded_2026)}</div>
    </div>
    <div class="card">
      <div class="label">Founded 2025</div>
      <div class="value">${fmt(d.founded_2025)}</div>
    </div>
  `;
});

// Generic table with bar chart
function fillTable(id, rows, labelKey, countKey) {
  const max = Math.max(...rows.map(r => r[countKey]));
  const total = rows.reduce((s, r) => s + r[countKey], 0);
  document.getElementById(id).innerHTML =
    `<thead><tr><th>${labelKey}</th><th></th><th style="text-align:right">Count</th><th style="text-align:right">%</th></tr></thead><tbody>` +
    rows.map(r => `
      <tr>
        <td>${r[labelKey] || '—'}</td>
        <td><div class="bar-cell"><div class="bar"><div class="bar-fill" style="width:${(r[countKey]/max*100).toFixed(1)}%"></div></div></div></td>
        <td class="num">${fmt(r[countKey])}</td>
        <td class="pct">${pct(r[countKey], total)}</td>
      </tr>`).join('') + '</tbody>';
}

fetch('/api/by_status').then(r=>r.json()).then(d => fillTable('t-status', d, 'label', 'count'));
fetch('/api/by_legal_type').then(r=>r.json()).then(d => fillTable('t-legal', d, 'label', 'count'));
fetch('/api/by_prefecture').then(r=>r.json()).then(d => fillTable('t-prefecture', d, 'label', 'count'));
fetch('/api/by_year').then(r=>r.json()).then(d => fillTable('t-year', d, 'year', 'count'));

// Custom query
function runQuery() {
  const sql = document.getElementById('sql').value.trim();
  const btn = document.getElementById('run-btn');
  const out = document.getElementById('query-result');
  if (!sql) return;
  btn.disabled = true;
  btn.textContent = 'Running...';
  out.innerHTML = '';
  fetch('/api/query', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({sql})
  }).then(r => r.json()).then(d => {
    btn.disabled = false;
    btn.textContent = 'Run';
    if (d.error) {
      out.innerHTML = `<div class="error">${d.error}</div>`;
      return;
    }
    if (!d.rows.length) {
      out.innerHTML = '<p class="result-meta">No rows returned.</p>';
      return;
    }
    const cols = Object.keys(d.rows[0]);
    out.innerHTML = `
      <p class="result-meta">${fmt(d.count)} row${d.count !== 1 ? 's' : ''} returned</p>
      <div class="result-table-wrap">
        <table>
          <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
          <tbody>${d.rows.map(r =>
            `<tr>${cols.map(c => `<td>${r[c] == null ? '—' : r[c]}</td>`).join('')}</tr>`
          ).join('')}</tbody>
        </table>
      </div>`;
  }).catch(e => {
    btn.disabled = false;
    btn.textContent = 'Run';
    out.innerHTML = `<div class="error">${e}</div>`;
  });
}

document.getElementById('sql').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) runQuery();
});
</script>
</body>
</html>"""

if __name__ == "__main__":
    print("Starting GreekLeads Stats Dashboard...")
    print("Open: http://localhost:5000")
    app.run(debug=False, port=5000, threaded=True)
