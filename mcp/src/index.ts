#!/usr/bin/env node
/* index.ts — entry point. Builds the McpServer, registers the 5 tools, and
   connects a stdio transport. CRITICAL: stdout is reserved for MCP protocol
   frames — never console.log here or anywhere this process imports; all
   logging goes to stderr via console.error. */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toolDefs } from './tools/index.js';
import { McpToolError } from './errors.js';

const server = new McpServer({
  name: 'devdigest',
  version: '0.0.0',
});

for (const tool of toolDefs) {
  // The tool registry is intentionally heterogeneous (each entry has its own
  // Zod input shape), which defeats registerTool's per-call generic
  // inference (TS2589: excessively deep instantiation across the array).
  // Each handler validates its own args via its Zod shape at the type level
  // in tools/*.ts, so the loose cast here is safe.
  server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputShape,
      annotations: tool.annotations,
    } as Parameters<typeof server.registerTool>[1],
    async (args: Record<string, unknown>): Promise<CallToolResult> => {
      try {
        const result = await tool.handler(args);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const toolError =
          err instanceof McpToolError
            ? err
            : new McpToolError('unknown_error', err instanceof Error ? err.message : String(err), false);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                code: toolError.code,
                message: toolError.message,
                retryable: toolError.retryable,
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('devdigest MCP server running on stdio');
}

main().catch((err) => {
  console.error('devdigest MCP server failed to start:', err);
  process.exit(1);
});
