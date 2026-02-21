import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

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

      interface Mapping {
        element: string;
        match: {
          name: string;
          layer: number;
          type: string;
          description: string;
          import: string;
        } | null;
        alternatives: Array<{ name: string; layer: number; reason: string }>;
        confidence: 'high' | 'medium' | 'low' | 'none';
        tokenSuggestions?: string[];
      }

      const mappings: Mapping[] = [];
      const unmapped: string[] = [];

      for (const element of elements) {
        const results = registry.searchComponents(element);

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

        const top = results[0];
        const alternatives = results.slice(1, 4).map(c => ({
          name: c.name,
          layer: c.layer,
          reason: c.description,
        }));

        // Determine confidence based on score gap
        // Re-score the top result to check quality
        const q = element.toLowerCase();
        const terms = q.split(/\s+/);
        let topScore = 0;
        for (const term of terms) {
          if (top.name.toLowerCase().includes(term)) topScore += 10;
          if (top.name.toLowerCase() === term) topScore += 5;
          if (top.type.toLowerCase().includes(term)) topScore += 3;
          if (top.description.toLowerCase().includes(term)) topScore += 5;
          for (const uc of top.useCases) {
            if (uc.toLowerCase().includes(term)) topScore += 7;
          }
        }

        let confidence: 'high' | 'medium' | 'low';
        if (topScore >= 15) confidence = 'high';
        else if (topScore >= 7) confidence = 'medium';
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
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    })
  );
}
