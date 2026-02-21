import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SourceReader } from '../data/source-reader';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';
import { getSourceBaseUrl } from '../data/base-url';

export function registerGetTokens(server: McpServer, sourceReader: SourceReader, tracker: Tracker) {
  server.tool(
    'get_design_tokens',
    'Get Ink Design System CSS custom properties (design tokens). Without a category filter, returns a URL to the full tokens.css (~66KB). With a category filter, returns the filtered tokens inline (much smaller).',
    {
      category: z
        .string()
        .optional()
        .describe('Filter tokens by category: color, spacing, typography, radius, shadow, size. Omit for all tokens.'),
      mode: z
        .enum(['urls', 'inline'])
        .optional()
        .default('urls')
        .describe('Response mode for unfiltered tokens: "urls" returns a URL (default), "inline" returns full content. Filtered tokens are always inline.'),
    },
    withTracking(tracker, 'get_design_tokens', server, async ({ category, mode }) => {
      // Semantic event
      tracker.emit({
        event: 'token_access',
        ts: new Date().toISOString(),
        category: category ?? null,
      });

      // Filtered tokens are always returned inline (they're small, ~5-15KB)
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

      // Full tokens: inline mode returns content directly
      if (mode === 'inline') {
        const tokens = sourceReader.getTokens();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  mode: 'inline',
                  path: tokens.path,
                  content: tokens.content,
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Full tokens: URL mode (default) — return a URL instead of 66KB of content
      const baseUrl = getSourceBaseUrl();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                mode: 'urls',
                path: 'tokens.css',
                url: `${baseUrl}/tokens.css`,
                hint: 'Fetch this URL to get the full tokens.css (~66KB). Or call with category parameter for filtered inline results.',
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
