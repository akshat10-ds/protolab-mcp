import type { ComponentMeta, Registry } from '../data/registry';

const LAYER_LABELS: Record<number, string> = {
  2: 'utility',
  3: 'primitive',
  4: 'composite',
  5: 'pattern',
  6: 'layout',
};

const LAYER_PLURALS: Record<number, string> = {
  2: 'utilities',
  3: 'primitives',
  4: 'composites',
  5: 'patterns',
  6: 'layouts',
};

/**
 * Generate a compact markdown API card for a component.
 * Contains everything an LLM needs to write correct JSX: import, key props, gotchas, example.
 */
export function apiCard(meta: ComponentMeta): string {
  const label = LAYER_LABELS[meta.layer] ?? 'unknown';
  const lines: string[] = [];

  // Header
  lines.push(`### ${meta.name} (L${meta.layer} ${label})`);

  // Import
  lines.push(`\`import { ${meta.name} } from '${meta.imports}';\``);

  // Props line — use propDetails if available for types/values, fall back to meta.props
  const propsStr = formatProps(meta);
  if (propsStr) {
    lines.push(`Props: ${propsStr}`);
  }

  // Composition warnings (the most valuable part for preventing errors)
  if (meta.composition) {
    const comp = meta.composition;

    // Warn about data-driven components (no children)
    if (comp.childrenType === 'none') {
      lines.push(`\u26a0\ufe0f Data-driven: NO children. ${comp.childrenDescription}`);
    }

    // Warn about slot props that take objects, not JSX
    if (comp.slotProps) {
      const objectSlots = Object.entries(comp.slotProps)
        .filter(([, def]) => def.type.includes('Props'))
        .map(([name, def]) => `${name} (${def.type})`);
      if (objectSlots.length > 0) {
        lines.push(`\u26a0\ufe0f Props objects, NOT JSX: ${objectSlots.join(', ')}`);
      }
    }

    // Typical children (useful for composition)
    if (comp.typicalChildren && comp.typicalChildren.length > 0) {
      lines.push(`Children: ${comp.typicalChildren.join(', ')}`);
    }
  }

  // Curated gotchas (common mistakes)
  if (meta.gotchas && meta.gotchas.length > 0) {
    for (const g of meta.gotchas) {
      lines.push(`\u26a0\ufe0f ${g}`);
    }
  }

  // One example — join all example lines into a single JSX snippet
  if (meta.examples && meta.examples.length > 0) {
    const joined = meta.examples.join(' ').replace(/\s{2,}/g, ' ').trim();
    const short = joined.length > 200 ? joined.substring(0, 200) + '...' : joined;
    lines.push(`Example: \`${short}\``);
  }

  return lines.join('\n');
}

/**
 * Format props into a compact one-line string.
 * Uses propDetails for types/values when available, falls back to meta.props.
 */
function formatProps(meta: ComponentMeta): string {
  if (meta.propDetails && meta.propDetails.props.length > 0) {
    // Use rich prop details — show required + key optional props
    const details = meta.propDetails.props;
    const required = details.filter(p => p.required && p.name !== 'children');
    const optional = details.filter(p => !p.required && p.name !== 'children');

    // Show fewer optional props for complex components to keep cards compact
    const optionalLimit = details.length > 10 ? 3 : 5;
    const shown = [...required, ...optional.slice(0, optionalLimit)];
    const parts = shown.map(p => {
      let s = p.required ? `${p.name}*` : p.name;
      // Show type info — simplify verbose generic types
      if (p.values && p.values.length > 0 && p.values.length <= 5) {
        s += ` (${p.values.map(v => `"${v}"`).join('|')})`;
      } else if (p.type) {
        // Simplify complex generic types for readability
        const simplified = p.type
          .replace(/Omit<(\w+),\s*[^>]+>/g, '$1')  // Omit<FooProps, 'x'> → FooProps
          .replace(/<T>/g, '')                       // Remove generic <T>
          .replace(/\(row: T, index: number\) => string \| number/, 'fn');
        if (!['string', 'boolean', 'number', 'ReactNode', 'React.ReactNode'].includes(simplified)) {
          s += ` (${simplified})`;
        }
      }
      return s;
    });

    // Add children if component accepts them
    if (details.some(p => p.name === 'children') || meta.props.includes('children')) {
      parts.push('children');
    }

    const remaining = optional.length - optionalLimit;
    if (remaining > 0) {
      parts.push(`+${remaining} more`);
    }

    return parts.join(', ');
  }

  // Fallback: just list prop names from meta.props
  return meta.props.join(', ');
}

/**
 * Generate a compact component index: all component names grouped by layer.
 * ~1K chars for all 63 components.
 */
export function componentIndex(registry: Registry): string {
  const lines: string[] = ['## All Ink Components'];

  for (const layer of [6, 5, 4, 3, 2]) {
    const components = registry.listComponents(layer);
    if (components.length === 0) continue;
    const plural = LAYER_PLURALS[layer] ?? 'unknown';
    const names = components.map(c => c.name).join(', ');
    lines.push(`**L${layer} ${plural} (${components.length}):** ${names}`);
  }

  return lines.join('\n');
}

/**
 * Token quick reference for embedding in prompts.
 * Covers spacing, colors, typography, and common patterns — ~1.5K chars.
 */
export function tokenQuickRef(): string {
  return `## Design Tokens Quick Reference

**Spacing** (padding, margin, gap):
\`--ink-spacing-0\` 0px | \`--ink-spacing-50\` 4px | \`--ink-spacing-100\` 8px | \`--ink-spacing-150\` 12px
\`--ink-spacing-200\` 16px (most common) | \`--ink-spacing-300\` 24px | \`--ink-spacing-400\` 32px
\`--ink-spacing-500\` 40px | \`--ink-spacing-600\` 48px | \`--ink-spacing-700\` 64px

**Text colors:** \`--ink-font-color-default\` (primary), \`--ink-font-color-secondary\` (labels), \`--ink-font-color-tertiary\` (hints), \`--ink-font-color-error\`, \`--ink-font-color-accent\` (links), \`--ink-font-color-inverse\` (on dark)

**Backgrounds:** \`--ink-bg-color-canvas-page\` (page), \`--ink-bg-color-default\` (cards/panels), \`--ink-bg-color-accent-subtle\` (hover/selected), \`--ink-bg-color-error-subtle\`, \`--ink-bg-color-success-subtle\`

**Borders:** \`--ink-border-color-default\` (inputs), \`--ink-border-color-subtle\` (dividers), \`--ink-border-color-accent\` (active)

**Radius:** \`--ink-radius-sm\` 4px | \`--ink-radius-md\` 8px | \`--ink-radius-lg\` 12px | \`--ink-radius-full\` pill

**Font sizes:** \`--ink-font-size-xs\` | \`sm\` | \`md\` (default) | \`lg\` | \`xl\` | \`2xl\`
**Font weights:** \`--ink-font-weight-regular\` 400 | \`medium\` 500 | \`semibold\` 600 | \`bold\` 700

**Common patterns:**
- Card: \`background: var(--ink-bg-color-default); border: 1px solid var(--ink-border-color-subtle); border-radius: var(--ink-radius-md); padding: var(--ink-spacing-200)\`
- Section gap: \`gap: var(--ink-spacing-300)\`
- Form field gap: \`gap: var(--ink-spacing-200)\`

NEVER hardcode colors or spacing — always use \`var(--ink-*)\` tokens.`;
}

/**
 * Spacing cheat sheet — common spacing between component pairs.
 * Always included in build_prototype prompt. ~400 chars.
 */
export function spacingCheatSheet(): string {
  return `## Spacing Between Components
GlobalNav → Content: var(--ink-spacing-400) (32px)
PageHeader → FilterBar/Banner: var(--ink-spacing-200) (16px)
FilterBar → Table: var(--ink-spacing-300) (24px)
Section → Section: var(--ink-spacing-400) (32px)
Form field → Form field: var(--ink-spacing-200) (16px)
Card → Card (in grid): var(--ink-spacing-300) (24px)`;
}

/**
 * Visual hierarchy rules — when to use Cards, badge placement, typography.
 * Always included in build_prototype prompt. ~500 chars.
 */
export function visualHierarchyRules(): string {
  return `## Visual Hierarchy

**Cards:** Use for dashboard widgets, form sections, stat blocks. NOT for tables or full-width content.

**Status badges:**
- List pages: inline with row data
- Detail pages: above the title (Badge then Heading in a Stack)

**Typography:**
- Page title: Heading level={1} (32px)
- Section: Heading level={2} (24px)
- Card title: Heading level={3} (20px)
- Body: Text (16px), Labels: Text size="sm" (14px)

**Border radius:** var(--ink-radius-sm) (4px) universally.`;
}

/**
 * Navigation defaults — rich GlobalNav/LocalNav configs that LLMs should preserve.
 * Prevents over-simplification of navigation in generated prototypes.
 */
export function navigationDefaults(): string {
  return `## Navigation Defaults

IMPORTANT: Do NOT simplify navigation. Always include the full config with logo, 5 nav items, search, notifications, settings, and user.

**GlobalNav default config** (pass to DocuSignShell.globalNav):
\`\`\`tsx
const globalNavConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: 18 }}>MyApp</span>,
  navItems: [
    { id: 'home', label: 'Home', href: '#', active: true },
    { id: 'agreements', label: 'Agreements', href: '#' },
    { id: 'templates', label: 'Templates', href: '#' },
    { id: 'reports', label: 'Reports', href: '#' },
    { id: 'admin', label: 'Admin', href: '#' },
  ],
  showSearch: true,
  showNotifications: true,
  notificationCount: 3,
  showSettings: true,
  user: { name: 'Jane Smith', email: 'jane@example.com' },
};
\`\`\`

**LocalNav default config** (pass to DocuSignShell.localNav for settings/admin pages):
\`\`\`tsx
const localNavConfig = {
  sections: [{
    id: 'settings',
    items: [
      { id: 'general', label: 'General', active: true },
      { id: 'notifications', label: 'Notifications' },
      { id: 'security', label: 'Security' },
      { id: 'integrations', label: 'Integrations' },
      { id: 'billing', label: 'Billing' },
    ],
  }],
};
\`\`\`

Rules:
- ALWAYS include \`logo\`, all 5 \`navItems\`, \`showSearch\`, \`showNotifications\`, \`showSettings\`, and \`user\`
- Set \`active: true\` on ONE nav item matching the current page
- For settings/admin pages, include LocalNav with 4-5 section items
- Do NOT reduce nav items to fewer than 5. Do NOT omit search, notifications, or settings.`;
}

/**
 * Layout preset section — rendered when a preset matches the user's description.
 * Includes component tree, spacing, rules, code sketch, and optional showcase config.
 */
export interface LayoutPreset {
  id: string;
  title: string;
  keywords: string[];
  componentTree: string;
  components: string[];
  spacingStack: Array<{ from: string; to: string; token: string; px: number }>;
  rules: string[];
  codeSketch: string;
  showcaseConfig?: {
    globalNav: string;
    localNav?: string;
  };
}

export function layoutPresetSection(preset: LayoutPreset): string {
  const lines: string[] = [];

  lines.push(`## Layout Recipe: ${preset.title}`);
  lines.push('');
  lines.push('Component Tree:');
  lines.push('```');
  lines.push(preset.componentTree);
  lines.push('```');
  lines.push('');

  // Spacing
  lines.push('Spacing:');
  for (const s of preset.spacingStack) {
    lines.push(`- ${s.from} → ${s.to}: ${s.px}px (${s.token})`);
  }
  lines.push('');

  // Rules
  lines.push('Rules:');
  for (const rule of preset.rules) {
    lines.push(`- ${rule}`);
  }
  lines.push('');

  // Code sketch
  lines.push('Code Sketch:');
  lines.push('```tsx');
  lines.push(preset.codeSketch);
  lines.push('```');

  // Showcase config
  if (preset.showcaseConfig) {
    lines.push('');
    lines.push('Default Nav Config (use as-is for prototyping):');
    lines.push('```tsx');
    lines.push(preset.showcaseConfig.globalNav);
    if (preset.showcaseConfig.localNav) {
      lines.push('');
      lines.push(preset.showcaseConfig.localNav);
    }
    lines.push('```');
  }

  return lines.join('\n');
}
