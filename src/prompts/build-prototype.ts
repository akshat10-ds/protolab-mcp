import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';

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

      const initialResults = topMatches.length > 0
        ? `\n\n## Initial Component Matches for "${description}"\n\n${JSON.stringify(topMatches, null, 2)}\n\nUse these as a starting point. Call \`get_component\` on the most relevant matches to get full details.`
        : `\n\n## Initial Component Matches\n\nNo direct matches for "${description}". Try broader search terms with \`search_components\`.`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: workflow + initialResults,
            },
          },
        ],
      };
    }
  );
}
