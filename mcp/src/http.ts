import { createServer as createHttp, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './server.js'
import { pool } from './db.js'

// ── Railway entry point ────────────────────────────────────────────────
//
// Stateless: a new server + transport per request, no session store. This
// server is read-only and every tool call is self-contained, so there is no
// cross-request state worth keeping — and statelessness is what lets Railway
// restart or scale it without stranding a session mid-conversation.

const PORT = Number(process.env.PORT ?? 8080)

// An MCP endpoint on the public internet exposing 1,69M company records and
// 2,1M named people is not something to leave open. Set MCP_API_KEY in the
// Railway service variables; clients send `Authorization: Bearer <key>`.
// Unset = refuse to start, rather than silently serving the registry to anyone
// who finds the URL.
const API_KEY = process.env.MCP_API_KEY
if (!API_KEY) {
  console.error(
    '[greekleads-mcp] MCP_API_KEY is not set. Refusing to start: this endpoint ' +
    'exposes the full registry. Set it in the Railway service variables, or use ' +
    'the stdio entry point for local work.',
  )
  process.exit(1)
}

function authorised(req: IncomingMessage): boolean {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  // Constant-length comparison is overkill for a shared secret behind TLS, but
  // length-first avoids leaking the key length through timing for free.
  return token.length === API_KEY!.length && token === API_KEY
}

function json(res: ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) })
  res.end(payload)
}

const httpServer = createHttp(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)

  // Railway's healthcheck must not need the key, or the deploy never goes live.
  if (url.pathname === '/health') {
    try {
      await pool.query('SELECT 1')
      return json(res, 200, { ok: true, service: 'greekleads-mcp' })
    } catch (err) {
      return json(res, 503, { ok: false, error: String(err) })
    }
  }

  if (url.pathname !== '/mcp') return json(res, 404, { error: 'not_found' })

  if (!authorised(req)) {
    res.setHeader('WWW-Authenticate', 'Bearer')
    return json(res, 401, { error: 'unauthorized' })
  }

  try {
    const server = createServer()
    const transport = new StreamableHTTPServerTransport({
      // Stateless mode — see the note at the top.
      sessionIdGenerator: undefined,
    })
    // Tear down per request; leaking a server per call would exhaust the pool.
    res.on('close', () => { void transport.close(); void server.close() })
    await server.connect(transport)
    await transport.handleRequest(req, res)
  } catch (err) {
    console.error('[greekleads-mcp] request failed:', err)
    if (!res.headersSent) json(res, 500, { error: 'internal' })
  }
})

httpServer.listen(PORT, () => {
  console.log(`[greekleads-mcp] listening on :${PORT}  (POST /mcp, GET /health)`)
})

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    console.log(`[greekleads-mcp] ${sig}, shutting down`)
    httpServer.close(() => { void pool.end().finally(() => process.exit(0)) })
  })
}
