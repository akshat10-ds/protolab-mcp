import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import { componentIndex, tokenQuickRef } from './format';

export function registerFigmaToCodePrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'figma_to_code',
    'Workflow for converting a Figma design to code using Ink Design System components. Includes component catalog and token reference for direct mapping.',
    () => {
      const workflow = `You are converting a Figma design to code using the Ink Design System.

## Step 1: Extract Design Data (using Figma MCP tools)
Use the Figma MCP server tools to extract design data:
1. \`get_metadata\` — get node structure (children, positions, sizes)
2. \`get_screenshot\` — visual reference
3. \`get_variable_defs\` — design tokens (colors, spacing, fonts)
4. \`get_design_context\` — code structure (use on small/atomic nodes)

Tip: Target specific child nodes, not large parent frames.

## Step 2: Identify and Map UI Elements

From the Figma extraction, identify every UI element and map to Ink components.

Common mappings:
| Figma Element | Ink Component |
|---|---|
| Auto Layout Vertical | Stack |
| Auto Layout Horizontal | Inline or Stack (direction="horizontal") |
| Grid Layout | Grid |
| Text Input | Input |
| Dropdown/Select | Select or ComboBox |
| Toggle/Switch | Switch |
| Sidebar Nav | LocalNav |
| Top Nav Bar | GlobalNav |
| Data Table | Table or DataTable |
| Dialog/Popup | Modal |
| Card/Panel | Card |
| Tabs | Tabs (data-driven: items prop, NOT children) |

Use \`search_components("keyword")\` if an element doesn't match the table above.
For full component details, call \`get_component("Name")\`.

${componentIndex(registry)}

## Step 3: Map Design Tokens

${tokenQuickRef()}

**Mapping Figma values:**
- Figma hex colors → closest \`var(--ink-*)\` CSS variable
- Figma spacing (px) → \`var(--ink-spacing-*)\` token
- Figma border radius → \`var(--ink-radius-*)\` token
- Figma font sizes → \`var(--ink-font-size-*)\` token

## Step 4: Present Mapping Plan
Before writing code, present:
- Each Figma element → Ink component mapping
- Token mappings (Figma value → Ink token)
- Component tree showing nesting hierarchy
- Any elements that don't have exact matches (with proposed compositions)

Get user confirmation before proceeding.

## Step 5: Generate Code
- Import all components from '@/design-system'
- Follow layer hierarchy (outermost layout first, then work inward)
- Use design token CSS variables for all styling
- Add comments linking back to Figma elements

## Step 6: Get Source (if needed)
If the consuming project needs the actual component source files:
Call \`get_component_source\` for each component used, with \`includeDependencies: true\`.`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: workflow,
            },
          },
        ],
      };
    }
  );
}
