import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

// Local entry point. Add to Claude Code with:
//   claude mcp add greekleads -- npx tsx <abs path>/mcp/src/stdio.ts
//
// NOTHING may write to stdout here except the protocol itself — stdout IS the
// transport, and a stray console.log corrupts the JSON-RPC stream. Diagnostics
// go to stderr.
async function main() {
  const server = createServer()
  await server.connect(new StdioServerTransport())
  console.error('[greekleads-mcp] stdio transport ready')
}

main().catch(err => {
  console.error('[greekleads-mcp] fatal:', err)
  process.exit(1)
})
