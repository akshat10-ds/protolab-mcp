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

Write your prototype in \`src/App.tsx\`. Follow this template structure:

\`\`\`tsx
import { useState } from 'react';
import {
  // Layer 6 layouts (outermost wrapper)
  DocuSignShell,
  // Layer 5 patterns (page-level sections)
  PageHeader, DataTable, FilterBar,
  // Layer 4 composites (multi-part UI)
  Modal, Tabs, Drawer,
  // Layer 3 primitives (atomic elements)
  Button, Input, Select, Card, Text, Heading, Badge,
  // Layer 2 utilities (layout helpers)
  Stack, Grid, Inline,
} from '@/design-system';

// 1. Define config objects for navigation (if using DocuSignShell)
const globalNavProps = {
  logo: <img src="/logo.svg" alt="Logo" height={24} />,
  navItems: [{ id: 'home', label: 'Home', href: '#', active: true }],
};

// 2. Define data and types
interface MyData { id: string; name: string; }
const DATA: MyData[] = [{ id: '1', name: 'Example' }];

export default function App() {
  // 3. State for interactive elements
  const [selected, setSelected] = useState<Set<string>>(new Set());

  return (
    // 4. Outermost: layout shell (globalNav/localNav are PROPS OBJECTS, not JSX)
    <DocuSignShell globalNav={globalNavProps}>
      {/* 5. Use Stack for vertical layout with token-based spacing */}
      <Stack gap="var(--ink-spacing-300)">
        {/* 6. Compose higher layers wrapping lower layers */}
        <Card>
          <Stack gap="var(--ink-spacing-200)">
            <Heading level={2}>Section Title</Heading>
            <Input label="Field" value="" onChange={() => {}} />
            <Button kind="brand">Action</Button>
          </Stack>
        </Card>
      </Stack>
    </DocuSignShell>
  );
}
\`\`\`

### Critical composition rules:
- **DocuSignShell.globalNav** and **localNav** are **props objects**, NOT JSX elements
- **DataTable/Table** are data-driven: use \`columns\` and \`data\` props (not children)
- **Tabs/Accordion** are data-driven: use \`items\` prop with \`{id, label, content}\`
- **Popover/Dropdown/Tooltip** children must be a **single ReactElement** (the trigger)
- **Modal/Drawer** have slot props: \`title\`, \`footer\` (ReactNode), and \`children\` for body
- **AgreementTableView** has slot props: \`pageHeader\`, \`filterBar\`, \`banner\`
- **Stack/Grid/Inline** are the primary layout utilities — use them everywhere
- Call \`get_component\` to check the \`composition\` field for any component you're unsure about

### Styling rules:
- Use \`var(--ink-spacing-*)\` for all padding, margin, gap (100=8px, 200=16px, 300=24px, 400=32px)
- Use \`var(--ink-font-color-*)\` for text colors, \`var(--ink-bg-color-*)\` for backgrounds
- Use \`var(--ink-border-color-*)\` for borders, \`var(--ink-radius-*)\` for border-radius
- NEVER hardcode colors or spacing — always use design tokens

## Step 7: Validate Your Code
After writing the prototype, call \`validate_component_usage\` with your code to check:
- All component names are valid
- Required props are present
- Composition patterns are correct
- No hardcoded values that should be tokens

Fix any issues before presenting the result.

## Rules
- ONLY use components returned by the tools — don't invent components
- Use design tokens for all styling — never hardcoded values
- Import from '@/design-system' or specific layer paths
- Layer hierarchy: layouts contain patterns contain composites contain primitives
- Always check the \`composition\` field on get_component for complex components`;

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
