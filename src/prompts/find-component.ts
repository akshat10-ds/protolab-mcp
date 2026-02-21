import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';

export function registerFindComponentPrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'find_component',
    'Find the right Ink Design System component for a UI need. Returns search results and matching guidance.',
    { need: z.string().describe("What you need, e.g. 'searchable dropdown', 'file upload', 'data table with sorting'") },
    ({ need }) => {
      const searchResults = registry.searchComponents(need);
      const topMatches = searchResults.slice(0, 8).map(c => ({
        name: c.name,
        layer: c.layer,
        layerName: registry.getLayerName(c.layer),
        type: c.type,
        description: c.description,
        import: `import { ${c.name} } from '${c.imports}';`,
        useCases: c.useCases,
      }));

      const topMatchName = topMatches[0]?.name ?? '[ComponentName]';

      const matchSection = topMatches.length > 0
        ? `### Search Results\n\n${topMatches.map((m, i) => `${i + 1}. **${m.name}** (Layer ${m.layer} — ${m.layerName})\n   ${m.description}\n   \`${m.import}\`\n   Use cases: ${m.useCases.join(', ')}`).join('\n\n')}`
        : `### Search Results\n\nNo direct matches found for "${need}".`;

      const text = `## Finding: "${need}"

${matchSection}

### If No Exact Match
Try these strategies:
1. **Broader terms**: search_components("dropdown") instead of "searchable dropdown"
2. **Use case terms**: search_components("file") or search_components("upload")
3. **Layer browsing**: list_components({ layer: 4 }) to browse all composites
4. **Composition**: Combine primitives — e.g., Input + Popover + List = custom combo

### Next Steps
- Call \`get_component("${topMatchName}")\` for full props and examples
- Call \`get_component_source("${topMatchName}")\` for implementation files`;

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
