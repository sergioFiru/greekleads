import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { TOOLS } from './tools.js'
import { DATASET_OVERVIEW } from './context.js'

/**
 * Builds the server. Transport-agnostic on purpose: the same tool layer is
 * served over stdio for local use and over streamable HTTP on Railway, so what
 * gets tested locally is what ships rather than a second implementation.
 */
export function createServer(): McpServer {
  const server = new McpServer(
    { name: 'greekleads', version: '0.1.0' },
    {
      instructions:
        'GreekLeads exposes ΓΕΜΗ, the official Greek business registry: ' +
        '1,69M companies and 2,1M people.\n\n' +
        'Call describe_dataset before interpreting results. Several fields do ' +
        'not mean what their names suggest, and a third of what looks like ' +
        'active companies never traded.\n\n' +
        DATASET_OVERVIEW,
    },
  )

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: (tool.schema as z.ZodObject<z.ZodRawShape>).shape,
      },
      async (args: unknown) => {
        try {
          const parsed = tool.schema.parse(args ?? {})
          const result = await tool.run(parsed as never)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
          }
        } catch (err) {
          // Hand the model the real reason. A generic failure makes it retry
          // the same broken call; "statement timeout" or "no such ΓΕΜΗ number"
          // makes it do something different.
          const message = err instanceof Error ? err.message : String(err)
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `${tool.name} failed: ${message}` }],
          }
        }
      },
    )
  }

  return server
}
