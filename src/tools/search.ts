import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

export function registerSearch(server: McpServer, registry: Registry, tracker: Tracker) {
  server.tool(
    'search_components',
    'Search Ink Design System components by keyword or use case (e.g., "form", "navigation", "table", "loading")',
    {
      query: z.string().describe('Search keyword or use case description'),
      limit: z.number().optional().default(10).describe('Max results to return (default: 10)'),
    },
    withTracking(tracker, 'search_components', server, async ({ query, limit }) => {
      const allResults = registry.searchComponents(query);
      const results = allResults.slice(0, limit);

      // Semantic event
      tracker.emit({
        event: 'search_query',
        ts: new Date().toISOString(),
        query,
        resultCount: results.length,
        topMatches: results.slice(0, 5).map(c => c.name),
      });

      if (results.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  query,
                  matches: 0,
                  message: 'No components matched. Try broader terms or check available components with list_components.',
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const result = {
        query,
        matches: results.length,
        components: results.map(c => ({
          name: c.name,
          layer: c.layer,
          layerName: registry.getLayerName(c.layer),
          type: c.type,
          description: c.description,
          useCases: c.useCases,
          import: `import { ${c.name} } from '${c.imports}';`,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    })
  );
}
