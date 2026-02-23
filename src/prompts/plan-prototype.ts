import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import { componentIndex, tokenQuickRef, spacingCheatSheet } from './format';

export function registerPlanPrototypePrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'plan_prototype',
    'End-to-end workflow for planning and building a prototype. Accepts a Figma URL, screenshot description, or text description. Generates an ASCII layout plan for user approval, then scaffolds a complete runnable project.',
    {
      description: z
        .string()
        .describe(
          "What to build — a Figma URL (figma.com/design/...), a description of a screenshot you're looking at, or a text description like 'agreements table page with filters'"
        ),
    },
    ({ description }) => {
      const workflow = `You are helping the user plan and build a prototype with the Ink Design System.
Your job is to collaborate — understand what they want, propose a plan, get approval, then scaffold and build.

## Phase 1: Understand the Input

Detect what the user gave you:

**If Figma URL** (contains figma.com/design/):
1. Call \`get_design_context\` with the extracted fileKey and nodeId to get code + screenshot + metadata
2. Call \`get_screenshot\` if you need additional visual context
3. Identify every UI element from the design data

**If screenshot/image** (user says "here's a screenshot" or attaches an image):
1. Analyze the visual — identify navigation, content areas, interactive elements, data displays
2. Note layout structure, spacing patterns, color usage

**If text description**:
1. Parse the requirements — what page type, what data, what interactions
2. Identify implied components (e.g., "settings page" implies form, navigation, save button)

## Phase 2: Map to Ink Components

Call \`map_ui_elements\` with the identified UI elements to get component suggestions.
For each suggested component, call \`get_component("Name", detail="summary")\` to get key props and composition rules.

If \`map_ui_elements\` returns low confidence for an element, use \`search_components\` to find alternatives.

${componentIndex(registry)}

## Phase 3: Present the ASCII Prototype Plan

Generate an ASCII layout showing:
- Component nesting hierarchy
- Key props that will be used
- Layout structure (what wraps what)
- Data flow (which components need state)

**FORMAT — follow this template:**

\`\`\`
PROTOTYPE PLAN: [Title]
═══════════════════════════════════════

┌──────────────────────────────────────────────┐
│ [Outermost Layout Component]                 │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ [Component]  prop="value"                │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ [Component]  prop="value"                │ │
│ │   ┌─────────┐ ┌─────────┐ ┌──────────┐  │ │
│ │   │ [Child]  │ │ [Child]  │ │ [Child]   │  │ │
│ │   └─────────┘ └─────────┘ └──────────┘  │ │
│ └──────────────────────────────────────────┘ │
│                                              │
│ ┌──────────────────────────────────────────┐ │
│ │ [Component]  columns=[...]               │ │
│ │ ┌───────┬──────────┬──────────┐          │ │
│ │ │ Col1  │ Col2     │ Col3     │          │ │
│ │ ├───────┼──────────┼──────────┤          │ │
│ │ │ ...   │ ...      │ ...      │          │ │
│ │ └───────┴──────────┴──────────┘          │ │
│ └──────────────────────────────────────────┘ │
└──────────────────────────────────────────────┘

COMPONENTS: ComponentA, ComponentB, ComponentC, ...
TOKENS: spacing-200, spacing-300, bg-color-canvas-page, ...
STATE: [what needs useState — modals, filters, selections]
\`\`\`

After the ASCII plan, list:
1. **Component summary** — each component with its role and key props
2. **Gotchas** — any composition warnings or common mistakes (from the component API)
3. **Questions** — anything you're unsure about ("Should this be a Modal or a Drawer?")

Then ask: **"Does this plan look right? Any changes before I scaffold the project?"**

## Phase 4: Scaffold & Build (after user approval)

Once the user approves (or adjusts) the plan:

1. **Scaffold the project:**
   Call \`scaffold_project\` with the approved component list:
   \`scaffold_project({ projectName: "<name>", components: [<approved list>] })\`

   This generates a complete Vite + React + TypeScript project with:
   - All component source files and transitive dependencies
   - Design tokens CSS
   - Barrel exports
   - package.json, vite.config.ts, tsconfig.json
   - Boilerplate index.html, main.tsx, index.css

2. **Write the App.tsx:**
   Using the approved ASCII plan as your blueprint, write \`src/App.tsx\` that composes the components.

   Rules:
   - Follow the layer hierarchy: layouts (L6) → patterns (L5) → composites (L4) → primitives (L3) → utilities (L2)
   - Import from \`'@/design-system'\`
   - Use \`var(--ink-*)\` tokens for ALL colors, spacing, radius — never hardcode
   - Check composition warnings from Phase 2 (slot props, data-driven components, etc.)

3. **Validate:**
   Call \`validate_component_usage\` with the generated App.tsx code.
   Fix any issues it flags (unknown props, hardcoded values, invalid enum values).

4. **Present the result:**
   Show the user the complete App.tsx and the quickStart command to run it.

${tokenQuickRef()}

${spacingCheatSheet()}

## Common Layout Patterns

**Full app shell** (most common):
DocuSignShell → GlobalNav + main content area
  └─ PageHeader → title, actions
  └─ Content (DataTable, Form, Cards, etc.)

**Settings / admin page**:
DocuSignShell → GlobalNav + LocalNav sidebar + content
  └─ LocalNav → navigation sections
  └─ Stack → form fields, sections

**Dashboard**:
DocuSignShell → GlobalNav + content
  └─ PageHeader
  └─ Grid → Card widgets

**Data management**:
DocuSignShell → GlobalNav + content
  └─ PageHeader → actions (Button, Dropdown)
  └─ FilterBar / SearchInput
  └─ DataTable → columns, row actions

## User Request

Build: ${description}

Begin with Phase 1 — analyze the input and identify UI elements.`;

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
