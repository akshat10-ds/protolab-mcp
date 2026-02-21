import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

export function registerFigmaToCodePrompt(server: McpServer) {
  server.prompt(
    'figma_to_code',
    'Workflow for converting a Figma design to code using Ink Design System components. Guides element mapping and token translation.',
    () => {
      const workflow = `You are converting a Figma design to code using the Ink Design System. Follow these steps:

## Step 1: Extract Design Data (using Figma MCP tools)
Use the Figma MCP server tools to extract design data:
1. \`get_metadata\` — get node structure (children, positions, sizes)
2. \`get_screenshot\` — visual reference
3. \`get_variable_defs\` — design tokens (colors, spacing, fonts)
4. \`get_design_context\` — code structure (use on small/atomic nodes)

Tip: Target specific child nodes, not large parent frames.

## Step 2: Identify UI Elements
From the Figma extraction, make a list of every UI element:
- Buttons, inputs, dropdowns, checkboxes
- Cards, tables, lists
- Navigation (sidebar, top bar, tabs, breadcrumbs)
- Layout structure (vertical stacks, grids, containers)
- Feedback (modals, alerts, banners, tooltips)

## Step 3: Map Elements to Ink Components
For EACH element, call \`search_components\` to find the matching Ink component.
Or use \`map_ui_elements\` with all elements at once for a batch mapping.

Common mappings:
| Figma Element | Search Query | Typical Match |
|---|---|---|
| Auto Layout Vertical | "stack vertical" | Stack |
| Auto Layout Horizontal | "inline horizontal" | Inline or Stack |
| Grid Layout | "grid columns" | Grid |
| Text Input | "input text field" | Input |
| Dropdown/Select | "select dropdown" | Select or ComboBox |
| Toggle | "switch toggle" | Switch |
| Sidebar Nav | "navigation sidebar" | LocalNav |
| Top Nav Bar | "navigation global" | GlobalNav |
| Data Table | "table data" | Table or DataTable |
| Dialog/Popup | "modal dialog" | Modal |
| Card/Panel | "card container" | Card |

Call \`get_component\` for each match to confirm props and get examples.

## Step 4: Map Tokens
Call \`get_design_tokens({ category: "color" })\` and map Figma values:
- Figma hex colors → closest \`--ink-*\` CSS variable
- Figma spacing (px) → \`--ink-spacing-*\` tokens
- Figma border radius → \`--ink-radius-*\` tokens
- Figma font sizes → \`--ink-font-size-*\` tokens

Spacing guide:
  4px → --ink-spacing-50     8px → --ink-spacing-100
  12px → --ink-spacing-150   16px → --ink-spacing-200
  24px → --ink-spacing-300   32px → --ink-spacing-400

## Step 5: Present Mapping Plan
Before writing code, present:
- Each Figma element → Ink component mapping
- Token mappings (Figma value → Ink token)
- Component tree showing nesting hierarchy
- Any elements that don't have exact matches (with proposed compositions)

Get user confirmation before proceeding.

## Step 6: Generate Code
- Import all components from '@/design-system'
- Follow layer hierarchy (outermost layout first, then work inward)
- Use design token CSS variables for all styling
- Add comments linking back to Figma elements

## Step 7: Get Source (if needed)
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
