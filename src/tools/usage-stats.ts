import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tracker } from '../analytics/tracker';

export function registerUsageStats(server: McpServer, _tracker: Tracker) {
  server.tool(
    'get_usage_stats',
    'Get usage analytics for the Ink Design System MCP server — tool call counts, popular components, search queries, errors, session info',
    {
      report: z
        .enum(['summary', 'components', 'searches', 'errors', 'timeline', 'sessions'])
        .optional()
        .default('summary')
        .describe('Which report to return (default: summary)'),
      since: z
        .string()
        .optional()
        .describe('ISO date to filter from (e.g. "2026-01-01"). Defaults to 30 days ago.'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Max items for rankings (default: 20)'),
    },
    async () => {
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                message:
                  'Usage analytics are not available in the remote deployment. ' +
                  'Analytics are only collected when running the local stdio MCP server via the @protolab/design-system-mcp npm package.',
              },
              null,
              2
            ),
          },
        ],
      };
    },
  );
}
