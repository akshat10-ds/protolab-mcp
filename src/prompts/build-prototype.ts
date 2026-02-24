import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import { apiCard, componentIndex, tokenQuickRef, spacingCheatSheet, visualHierarchyRules, navigationDefaults, layoutPresetSection, type LayoutPreset } from './format';
import examples from '@/data/examples.json';
import layoutPresetsData from '@/data/layout-presets.json';
import compositionRecipesData from '@/data/composition-recipes.json';

interface Example {
  id: string;
  title: string;
  description: string;
  complexity: string;
  componentsUsed: string[];
  code: string;
}

interface CompositionRecipe {
  name: string;
  keywords: string[];
  composition: string;
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

/**
 * Match a description to a layout preset using keyword scoring.
 */
function findMatchingPreset(description: string): LayoutPreset | null {
  const q = description.toLowerCase();
  let best: { preset: LayoutPreset; score: number } | null = null;
  for (const preset of layoutPresetsData.presets as LayoutPreset[]) {
    const score = preset.keywords.reduce((s, kw) => s + (q.includes(kw) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) {
      best = { preset, score };
    }
  }
  return best?.preset ?? null;
}

/**
 * Match a description to composition recipes using keyword matching.
 */
function findMatchingRecipes(description: string): CompositionRecipe[] {
  const q = description.toLowerCase();
  return (compositionRecipesData.recipes as CompositionRecipe[]).filter(recipe =>
    recipe.keywords.some(kw => q.includes(kw))
  );
}

// Essential layout components that should always be included if not already matched
const ESSENTIAL_COMPONENTS = ['Stack', 'Inline', 'Grid'];

export function registerBuildPrototypePrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'build_prototype',
    'Complete guide for building a UI prototype using the Ink Design System. Returns component API references, design tokens, and a code template — everything needed to write correct code without additional tool calls.',
    { description: z.string().describe("What you want to build, e.g. 'a settings page with user profile form'") },
    ({ description }) => {
      // Find relevant components via search
      const searchResults = registry.searchComponents(description);
      const matchedNames = new Set(searchResults.slice(0, 15).map(c => c.name));

      // Match layout preset
      const preset = findMatchingPreset(description);

      // If a preset matched, ensure its components are included in API cards
      if (preset) {
        for (const name of preset.components) {
          matchedNames.add(name);
        }
      }

      // Ensure essential layout utilities are always included
      for (const name of ESSENTIAL_COMPONENTS) {
        matchedNames.add(name);
      }

      // Build API cards for all matched components, sorted by layer (high → low)
      const matched = [...matchedNames]
        .map(name => registry.getComponent(name))
        .filter((m): m is NonNullable<typeof m> => m !== undefined)
        .sort((a, b) => b.layer - a.layer);

      const apiCards = matched.map(m => apiCard(m)).join('\n\n');
      const componentNames = matched.map(m => m.name);

      // Match composition recipes
      const recipes = findMatchingRecipes(description);
      const recipesSection = recipes.length > 0
        ? `## Composition Recipes\n\n${recipes.map(r => `**${r.name}:** ${r.composition}`).join('\n\n')}`
        : '';

      // Layout preset section
      const presetSection = preset ? layoutPresetSection(preset) : '';

      // Reference example
      const example = findBestExample(description);
      const exampleSection = example
        ? `## Reference Example: "${example.title}"

Complete working prototype (${example.complexity} complexity):

Components used: ${example.componentsUsed.join(', ')}

\`\`\`tsx
${example.code}
\`\`\`

Adapt this pattern to match the user's request.`
        : '';

      // Assemble the self-contained prompt
      const text = `You are building a prototype with the Ink Design System.

## Your Task
Build: ${description}

## Component API Reference

Everything you need to use each component — import, props, gotchas, and examples.
Use ONLY these components (and others from the full index below). Do NOT invent components.

${apiCards}

${componentIndex(registry)}

For any component not in the API reference above, call \`get_component("Name")\` to get its details.

${tokenQuickRef()}

${spacingCheatSheet()}

${visualHierarchyRules()}

${navigationDefaults()}

${presetSection}

${recipesSection}

## Code Template

Write your prototype in \`src/App.tsx\`:

\`\`\`tsx
import { useState } from 'react';
import {
  // Import only the components you need
  ${componentNames.join(', ')}
} from '@/design-system';

export default function App() {
  return (
    // Start with the outermost layout (Layer 6/5), work inward
    // Use Stack/Inline/Grid for all layout structure
    // Use var(--ink-spacing-*) for all gaps, padding, margin
    <Stack gap="var(--ink-spacing-300)">
      {/* Your prototype here */}
    </Stack>
  );
}
\`\`\`

## Rules

1. **Layer hierarchy**: layouts (L6) > patterns (L5) > composites (L4) > primitives (L3) > utilities (L2)
2. **Tokens only**: Use \`var(--ink-*)\` for ALL colors, spacing, radius, shadows. Never hardcode.
3. **Composition**: Check the \u26a0\ufe0f warnings in the API cards above — they prevent the most common errors.
4. **Imports**: Use \`'@/design-system'\` or specific layer paths like \`'@/design-system/3-primitives'\`

${exampleSection}

For detailed page template diagrams with measurements, read the \`ink://page-templates\` resource.

## Workflow

1. **Review** the Component API Reference above — it has everything you need
2. **Set up project** (if needed): call \`scaffold_project({ projectName: "my-prototype", components: [${componentNames.slice(0, 8).map(n => `"${n}"`).join(', ')}] })\`
3. **Write code** in \`src/App.tsx\` using the API reference and template above
4. **Validate**: call \`validate_component_usage\` with your code to check for errors
5. Fix any issues and present the result`;

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
