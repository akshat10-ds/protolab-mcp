import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { STOP_WORDS, type Registry } from '../data/registry';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

// Module-level constants (avoids recreation per request)
const TOKEN_SUGGESTIONS: Record<string, string[]> = {
  layout: ['spacing', 'color'],
  navigation: ['color', 'spacing'],
  form: ['spacing', 'color', 'typography'],
  input: ['spacing', 'color', 'border-radius'],
  button: ['color', 'spacing', 'typography'],
  table: ['spacing', 'color', 'border'],
  card: ['spacing', 'color', 'border-radius', 'shadow'],
  modal: ['spacing', 'color', 'shadow', 'border-radius'],
  text: ['typography', 'color'],
  icon: ['color'],
};

function getTokenSuggestions(element: string): string[] {
  const lower = element.toLowerCase();
  const suggestions = new Set<string>();
  for (const [keyword, tokens] of Object.entries(TOKEN_SUGGESTIONS)) {
    if (lower.includes(keyword)) {
      for (const t of tokens) suggestions.add(t);
    }
  }
  // Default if nothing matched
  if (suggestions.size === 0) {
    suggestions.add('spacing');
    suggestions.add('color');
  }
  return Array.from(suggestions);
}

export function registerMapElements(server: McpServer, registry: Registry, tracker: Tracker) {
  server.tool(
    'map_ui_elements',
    'Given a list of UI element descriptions, find the best matching Ink Design System component for each one. Returns a complete mapping with components, layers, imports, and token suggestions.',
    {
      elements: z
        .array(z.string())
        .describe(
          'List of UI element descriptions, e.g. ["sidebar navigation", "search input", "data table", "submit button"]'
        ),
      includeTokenSuggestions: z
        .boolean()
        .optional()
        .default(false)
        .describe('Include relevant design token suggestions for each element'),
    },
    withTracking(tracker, 'map_ui_elements', server, async ({ elements, includeTokenSuggestions }) => {
      interface Mapping {
        element: string;
        match: {
          name: string;
          layer: number;
          type: string;
          description: string;
          import: string;
        } | null;
        alternatives: Array<{ name: string; layer: number; type: string }>;
        confidence: 'high' | 'medium' | 'low' | 'none';
        tokenSuggestions?: string[];
      }

      const mappings: Mapping[] = [];
      const unmapped: string[] = [];

      for (const element of elements) {
        const results = registry.searchComponentsWithScores(element);

        if (results.length === 0) {
          unmapped.push(element);
          mappings.push({
            element,
            match: null,
            alternatives: [],
            confidence: 'none',
            ...(includeTokenSuggestions && { tokenSuggestions: getTokenSuggestions(element) }),
          });
          continue;
        }

        const { meta: top, score: topScore } = results[0];
        const alternatives = results.slice(1, 4).map(r => ({
          name: r.meta.name,
          layer: r.meta.layer,
          type: r.meta.type,
        }));

        // Scale confidence thresholds by query complexity
        const termCount = element.split(/\s+/).filter((t: string) => !STOP_WORDS.has(t)).length || 1;
        const highThreshold = 10 + (termCount * 5);   // 1 term: 15, 2 terms: 20, 3 terms: 25
        const medThreshold = 5 + (termCount * 3);     // 1 term: 8, 2 terms: 11, 3 terms: 14

        let confidence: 'high' | 'medium' | 'low';
        if (topScore >= highThreshold) confidence = 'high';
        else if (topScore >= medThreshold) confidence = 'medium';
        else confidence = 'low';

        mappings.push({
          element,
          match: {
            name: top.name,
            layer: top.layer,
            type: top.type,
            description: top.description,
            import: `import { ${top.name} } from '${top.imports}';`,
          },
          alternatives,
          confidence,
          ...(includeTokenSuggestions && { tokenSuggestions: getTokenSuggestions(element) }),
        });
      }

      // Build a suggested hierarchy from matched components
      const matched = mappings
        .filter(m => m.match)
        .sort((a, b) => (b.match!.layer - a.match!.layer));

      let suggestedHierarchy = '';
      if (matched.length > 0) {
        const parts = matched.map(m => `${m.match!.name} (L${m.match!.layer})`);
        suggestedHierarchy = parts.join(' > ');
      }

      // Semantic event
      tracker.emit({
        event: 'search_query',
        ts: new Date().toISOString(),
        query: `map_elements: ${elements.join(', ')}`,
        resultCount: mappings.filter(m => m.match).length,
        topMatches: mappings.filter(m => m.match).map(m => m.match!.name),
      });

      const result = {
        mappings,
        unmapped,
        suggestedHierarchy,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    })
  );
}
