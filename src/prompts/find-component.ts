import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import { apiCard } from './format';

export function registerFindComponentPrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'find_component',
    'Find the right Ink Design System component for a UI need. Returns matching components with full API details — ready to use without additional tool calls.',
    { need: z.string().describe("What you need, e.g. 'searchable dropdown', 'file upload', 'data table with sorting'") },
    ({ need }) => {
      const searchResults = registry.searchComponents(need);
      const topMatches = searchResults.slice(0, 8);

      const matchSection = topMatches.length > 0
        ? `### Best Matches\n\n${topMatches.map((c, i) => `**${i + 1}. ${c.name}** — ${c.description}\n\n${apiCard(c)}`).join('\n\n')}`
        : `### No Direct Matches\n\nNo components matched "${need}". Try broader terms like "dropdown", "input", or "table".`;

      const text = `## Finding: "${need}"

${matchSection}

### If No Exact Match
1. **Broader terms**: try "dropdown" instead of "searchable dropdown"
2. **Browse by layer**: call \`list_components({ layer: 4 })\` for all composites
3. **Compose**: combine primitives — e.g., Input + Popover + List = custom combo

### Getting Source Files
To copy a component's source into your project:
\`get_component_source("${topMatches[0]?.name ?? 'ComponentName'}")\``;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text,
            },
          },
        ],
      };
    }
  );
}
