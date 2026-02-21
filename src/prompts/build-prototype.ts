import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import examples from '@/data/examples.json';

interface Example {
  id: string;
  title: string;
  description: string;
  complexity: string;
  componentsUsed: string[];
  code: string;
}

function findBestExample(description: string): Example | null {
  const q = description.toLowerCase();
  const exs = examples.examples as Example[];

  // Simple keyword matching to find the most relevant example
  const scored = exs.map(ex => {
    let score = 0;
    const words = q.split(/\s+/);
    for (const word of words) {
      if (ex.title.toLowerCase().includes(word)) score += 3;
      if (ex.description.toLowerCase().includes(word)) score += 2;
      for (const comp of ex.componentsUsed) {
        if (comp.toLowerCase().includes(word)) score += 1;
      }
    }
    return { ex, score };
  });

  const best = scored.sort((a, b) => b.score - a.score)[0];
  return best && best.score > 0 ? best.ex : exs[0]; // fallback to first example
}

export function registerBuildPrototypePrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'build_prototype',
    'Step-by-step guide for building a UI prototype using the Ink Design System. Returns a workflow with the right tool call sequence.',
    { description: z.string().describe("What you want to build, e.g. 'a settings page with user profile form'") },
    ({ description }) => {
      const searchResults = registry.searchComponents(description);
      const topMatches = searchResults.slice(0, 10).map(c => ({
        name: c.name,
        layer: c.layer,
        layerName: registry.getLayerName(c.layer),
        type: c.type,
        description: c.description,
        import: `import { ${c.name} } from '${c.imports}';`,
      }));

      const workflow = `You are building a prototype with the Ink Design System. Follow these steps IN ORDER:

## Step 1: Discover Components
Call \`search_components\` with keywords from the user's request.
For each major UI need (navigation, forms, data display, layout), search separately.

Example searches for "${description}":
- search_components("form input")
- search_components("navigation sidebar")
- search_components("layout shell")

## Step 2: Check Layer Hierarchy
Call \`list_components\` to see what's available at each layer.
Start from the top (Layer 6 → 2):
- Layer 6 (layouts): Full page shells — use if building a complete page
- Layer 5 (patterns): Navigation, data tables — major page sections
- Layer 4 (composites): Multi-part components (Modal, Tabs, SearchInput)
- Layer 3 (primitives): Atomic elements (Button, Input, Card)
- Layer 2 (utilities): Layout helpers (Stack, Grid, Inline)

## Step 3: Get Component Details
For each component you plan to use, call \`get_component\` to get:
- Full prop list with types
- Code examples
- Import path
- Dependencies

## Step 4: Set Up Project (if no project exists)
If the user needs a new project to run the prototype in, call \`scaffold_project\` with:
- projectName: a slug based on what they're building (e.g. "settings-prototype")
- components: the list of component names you identified in Steps 1-3

This creates a ready-to-run Vite + React + TypeScript project with only the
components needed. Write all returned files to disk, then run \`npm install\`
in the project directory.

Skip this step if the user already has an Ink Design System project.

## Step 5: Get Design Tokens
Call \`get_design_tokens\` for any custom styling needed:
- \`get_design_tokens({ category: "spacing" })\` for gaps/padding
- \`get_design_tokens({ category: "color" })\` for color tokens
- \`get_design_tokens({ category: "typography" })\` for font tokens

## Step 6: Generate Prototype Code
Write your prototype in \`src/App.tsx\` (or create additional page files).
Import components from \`@/design-system\`.

## Rules
- ONLY use components returned by the tools — don't invent components
- Use design tokens for all styling — never hardcoded values
- Import from '@/design-system' or specific layer paths
- Layer hierarchy: layouts contain patterns contain composites contain primitives`;

      // Find and include a relevant reference example
      const example = findBestExample(description);
      const exampleSection = example
        ? `\n\n## Reference Example: "${example.title}"\n\nHere is a complete working prototype (${example.complexity} complexity) showing correct component composition, prop usage, state management, and token application:\n\nComponents used: ${example.componentsUsed.join(', ')}\n\n\`\`\`tsx\n${example.code}\n\`\`\`\n\nAdapt this pattern to match the user's request. Key things to replicate:\n- Import all components from '@/design-system'\n- Use design tokens (var(--ink-spacing-*), var(--ink-font-*), etc.) for styling\n- Manage state with useState for interactive elements\n- Follow the layer hierarchy (layouts > patterns > composites > primitives > utilities)`
        : '';

      const initialResults = topMatches.length > 0
        ? `\n\n## Initial Component Matches for "${description}"\n\n${JSON.stringify(topMatches, null, 2)}\n\nUse these as a starting point. Call \`get_component\` on the most relevant matches to get full details.`
        : `\n\n## Initial Component Matches\n\nNo direct matches for "${description}". Try broader search terms with \`search_components\`.`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: workflow + exampleSection + initialResults,
            },
          },
        ],
      };
    }
  );
}
