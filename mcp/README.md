# GreekLeads MCP

An MCP server over ΓΕΜΗ — 1,69M Greek companies and 2,1M people on the register.

Five tools: `describe_dataset`, `search_companies`, `get_company`,
`search_people`, `registry_statistics`.

## What makes it worth having

Any wrapper can run a `SELECT`. What makes an answer *correct* is knowing that
`prefecture_descr` is unaccented, that `municipality_descr` is two fields glued
together, that `'Inadequate Info'` is a real value rather than NULL, and that
11.141 of the companies that look active have never traded. All of that lives in
`src/context.ts` and is served by `describe_dataset`, which a model should call
before it interprets anything.

Those caveats are not decoration — the smoke test asserts two of them still hold
against the live database, and fails if they stop being true.

## Running it locally (stdio)

```bash
cd mcp
npm install
npx tsx src/smoke.ts          # exercises every tool against the live DB
```

Add it to Claude Code:

```bash
claude mcp add greekleads -- npx tsx /ABSOLUTE/PATH/greekleads/mcp/src/stdio.ts
```

`DATABASE_URL` is read from `scripts/.env`, the same file every other service in
this repo uses — there is no second copy to go stale.

## Claude Desktop

`%APPDATA%\Claude\claude_desktop_config.json`:

```json
"greekleads": {
  "command": "node",
  "args": [
    "C:\\\\Users\\\\firul\\\\greekleads\\\\mcp\\\\node_modules\\\\tsx\\\\dist\\\\cli.mjs",
    "C:\\\\Users\\\\firul\\\\greekleads\\\\mcp\\\\src\\\\stdio.ts"
  ]
}
```

`node` plus the local tsx CLI, **not** `npx tsx`. Desktop launches the server
from a working directory of its own choosing, and npx may not find the locally
installed tsx from there.

For the same reason the imports from `web/lib` are RELATIVE rather than going
through a `@/lib` tsconfig alias: tsx resolves tsconfig `paths` from the cwd, so
an alias works when you run it from `mcp/` and dies with
`Cannot find package '@/lib'` the moment Desktop launches it from anywhere else.
Caught by launching it from an unrelated directory before shipping, not after.

## Running it hosted (HTTP, Railway)

```bash
MCP_API_KEY=... PORT=8080 npx tsx src/http.ts
```

- `POST /mcp` — the MCP endpoint, requires `Authorization: Bearer $MCP_API_KEY`
- `GET /health` — unauthenticated, so Railway's healthcheck can reach it

The server **refuses to start without `MCP_API_KEY`**. This endpoint exposes the
full registry including named individuals; failing loudly beats quietly serving
it to whoever finds the URL.

### Railway setup

1. New service from this repo.
2. **Settings → Root Directory: the repository root** (leave it empty / `/`).
   NOT `mcp/`. The image copies `web/lib` too, and a context of `mcp/` cannot
   see it.
3. **Settings → Build → Dockerfile Path: `mcp/Dockerfile`**
4. **Variables:**
   - `DATABASE_URL` — the same Postgres the other services use. Inside Railway
     prefer the internal host; it is faster and does not leave the network.
   - `MCP_API_KEY` — any long random string. The server refuses to start
     without it.
   `PORT` is injected by Railway; do not set it.
5. **Settings → Healthcheck Path: `/health`** (already in `railway.json`, but
   Railway only reads that file if the service's config path points at it).

Connect a client to `https://<service>.up.railway.app/mcp` with
`Authorization: Bearer $MCP_API_KEY`. For Claude Desktop, which speaks stdio:

```json
"greekleads-remote": {
  "command": "npx",
  "args": ["mcp-remote", "https://<service>.up.railway.app/mcp",
           "--header", "Authorization: Bearer <key>"]
}
```

### Verified before deploying

The container's exact file layout was reproduced locally and started with
`DATABASE_URL` from the environment rather than `scripts/.env` — proving the
image copies everything the server needs and does not depend on a file that
only exists on a laptop.

### Old notes

Set the service root to the **repository root**, not `mcp/`. The Dockerfile
copies `web/lib` as well as `mcp/`, because the server imports the website's own
query builders. Variables needed: `DATABASE_URL`, `MCP_API_KEY`.

## Why it imports from `web/lib`

`web/lib/searchQuery.ts` says it outright:

> Both callers MUST use the same builder — if they drift, a list built from "add
> all" would silently contain different companies than the search that produced
> it.

A second implementation here would mean the MCP and the website answering the
same question differently. So `buildWhere`, `nace` and `registryText` are
imported, not reimplemented. Only `@/lib/db` is local, because the Next one is
built around Next's env handling.

## Testing gotcha

**Do not probe this server with `curl` from Git Bash on Windows.** It mangles
non-ASCII payloads — Greek filter values arrive as `?`, every query returns 0,
and it looks exactly like a server bug. It cost an hour. `src/smoke.ts` or a
Python `urllib` request both send correct UTF-8.

## Not exposed yet

Financial statements. Only 54 rows are extracted so far, and only 51.581
companies have filings at all (5,2% of active firms) — not enough to promise.
