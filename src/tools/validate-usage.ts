import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

interface ValidationIssue {
  severity: 'error' | 'warning';
  component: string;
  message: string;
  suggestion?: string;
}

export function registerValidateUsage(
  server: McpServer,
  registry: Registry,
  tracker: Tracker
) {
  server.tool(
    'validate_component_usage',
    'Validate that component names, props, and composition in generated code are correct. Pass your JSX/TSX code and get back a list of issues.',
    {
      code: z
        .string()
        .describe('The JSX/TSX code to validate (e.g., the contents of App.tsx)'),
    },
    withTracking(tracker, 'validate_component_usage', server, async ({ code }) => {
      const issues: ValidationIssue[] = [];
      const allNames = new Set(registry.getAllNames());

      // 1. Extract component names used in JSX: <ComponentName or <ComponentName.
      const jsxPattern = /<([A-Z][A-Za-z0-9]*)/g;
      const usedComponents = new Set<string>();
      let match;
      while ((match = jsxPattern.exec(code)) !== null) {
        usedComponents.add(match[1]);
      }

      // 2. Check each used component exists in the registry
      for (const name of usedComponents) {
        if (!allNames.has(name)) {
          // Try fuzzy match
          const suggestions = registry.searchComponents(name).slice(0, 3);
          issues.push({
            severity: 'error',
            component: name,
            message: `Component "${name}" is not in the Ink Design System`,
            suggestion: suggestions.length > 0
              ? `Did you mean: ${suggestions.map(s => s.name).join(', ')}?`
              : undefined,
          });
        }
      }

      // 3. For known components, check required props and composition
      for (const name of usedComponents) {
        const meta = registry.getComponent(name);
        if (!meta) continue;

        // Check required props from propDetails
        if (meta.propDetails) {
          const requiredProps = meta.propDetails.props
            .filter(p => p.required && p.name !== 'children')
            .map(p => p.name);

          for (const reqProp of requiredProps) {
            // Simple heuristic: check if the prop name appears near the component usage
            // Look for <ComponentName ... reqProp= or <ComponentName ... reqProp={
            const propPattern = new RegExp(
              `<${name}[^>]*\\b${reqProp}\\s*[={]`,
              's'
            );
            if (!propPattern.test(code)) {
              issues.push({
                severity: 'warning',
                component: name,
                message: `Required prop "${reqProp}" may be missing on <${name}>`,
                suggestion: meta.propDetails.props.find(p => p.name === reqProp)?.description,
              });
            }
          }
        }

        // 4. Composition checks
        if (meta.composition) {
          const comp = meta.composition;

          // Check slot props that take config objects (not JSX)
          if (comp.slotProps) {
            for (const [slotName, slotDef] of Object.entries(comp.slotProps)) {
              // If the slot prop type contains "Props" (e.g., GlobalNavProps), warn about passing JSX
              if (slotDef.type.includes('Props')) {
                // Check for pattern like: slotName={<Component instead of slotName={{
                const jsxInSlotPattern = new RegExp(
                  `${slotName}\\s*=\\s*\\{\\s*<`,
                  's'
                );
                if (jsxInSlotPattern.test(code)) {
                  issues.push({
                    severity: 'error',
                    component: name,
                    message: `Slot "${slotName}" expects a props object (${slotDef.type}), not JSX. Pass a config object instead.`,
                    suggestion: `Use ${slotName}={{ ... }} instead of ${slotName}={<Component />}`,
                  });
                }
              }
            }
          }
        }
      }

      // 5. Check for hardcoded colors (suggest tokens)
      const hardcodedColorPattern = /(?:color|background|border)(?:-color)?:\s*#[0-9a-fA-F]{3,8}/g;
      const hardcodedColors = code.match(hardcodedColorPattern);
      if (hardcodedColors && hardcodedColors.length > 0) {
        issues.push({
          severity: 'warning',
          component: 'global',
          message: `Found ${hardcodedColors.length} hardcoded color(s). Use design tokens instead.`,
          suggestion: 'Use var(--ink-font-color-default), var(--ink-bg-color-default), etc. Call get_design_tokens({ category: "guide" }) for the full guide.',
        });
      }

      // 6. Check for hardcoded pixel spacing (suggest tokens)
      const hardcodedSpacingPattern = /(?:padding|margin|gap):\s*\d+px/g;
      const hardcodedSpacing = code.match(hardcodedSpacingPattern);
      if (hardcodedSpacing && hardcodedSpacing.length > 0) {
        issues.push({
          severity: 'warning',
          component: 'global',
          message: `Found ${hardcodedSpacing.length} hardcoded spacing value(s). Use design tokens instead.`,
          suggestion: 'Use var(--ink-spacing-100) through var(--ink-spacing-700). E.g., gap: var(--ink-spacing-200) for 16px.',
        });
      }

      // Semantic event
      tracker.emit({
        event: 'validation',
        ts: new Date().toISOString(),
        componentsChecked: usedComponents.size,
        issueCount: issues.length,
        errorCount: issues.filter(i => i.severity === 'error').length,
      });

      const summary = {
        valid: issues.filter(i => i.severity === 'error').length === 0,
        componentsFound: [...usedComponents].filter(n => allNames.has(n)),
        componentsUnknown: [...usedComponents].filter(n => !allNames.has(n)),
        issues,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(summary, null, 2) }],
      };
    })
  );
}
