import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SourceReader } from '../data/source-reader';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

export function registerGetTokens(server: McpServer, sourceReader: SourceReader, tracker: Tracker) {
  server.tool(
    'get_design_tokens',
    'Get Ink Design System CSS custom properties (design tokens). Returns full tokens.css or filtered by category: color, spacing, typography, radius, shadow, size',
    {
      category: z
        .string()
        .optional()
        .describe('Filter tokens by category: color, spacing, typography, radius, shadow, size. Omit for all tokens.'),
    },
    withTracking(tracker, 'get_design_tokens', server, async ({ category }) => {
      // Semantic event
      tracker.emit({
        event: 'token_access',
        ts: new Date().toISOString(),
        category: category ?? null,
      });

      if (category) {
        const filtered = sourceReader.getTokensByCategory(category);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  category,
                  tokens: filtered,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const tokens = sourceReader.getTokens();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                path: tokens.path,
                content: tokens.content,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );
}
