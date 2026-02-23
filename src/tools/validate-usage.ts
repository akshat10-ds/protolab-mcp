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

// Module-level regex constants (avoids recompilation per request)
const JSX_COMPONENT_RE = /<([A-Z][A-Za-z0-9]*)/g;
const HARDCODED_COLOR_RE = /(?:color|background|border)(?:[Cc]olor)?(?:-color)?:\s*['"]?#[0-9a-fA-F]{3,8}['"]?/g;
const HARDCODED_SPACING_RE = /(?:padding|margin|gap|[Pp]adding|[Mm]argin|[Gg]ap)(?:Top|Right|Bottom|Left|Inline|Block)?:\s*['"]?\d+px['"]?/g;

/** Extract JSX attribute blocks for a component, handling nested {} and strings */
function extractJsxAttrBlocks(code: string, componentName: string): string[] {
  const tagRe = new RegExp(`<${componentName}\\s`, 'g');
  const blocks: string[] = [];
  for (const match of code.matchAll(tagRe)) {
    let i = match.index! + match[0].length;
    let depth = 0;
    let inStr: string | null = null;
    const start = i;
    while (i < code.length) {
      const ch = code[i];
      if (inStr) {
        if (ch === inStr && code[i - 1] !== '\\') inStr = null;
      } else if (ch === '"' || ch === "'" || ch === '`') {
        inStr = ch;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
      } else if ((ch === '>' || (ch === '/' && code[i + 1] === '>')) && depth === 0) {
        blocks.push(code.slice(start, i));
        break;
      }
      i++;
    }
  }
  return blocks;
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
      const allNames = registry.getAllNamesSet();

      // 1. Extract component names used in JSX: <ComponentName or <ComponentName.
      const usedComponents = new Set<string>();
      for (const match of code.matchAll(JSX_COMPONENT_RE)) {
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

        // 4. Unknown prop detection
        // Skip if component extends HTMLAttributes (too many valid HTML attrs)
        const extendsHTML = meta.propDetails?.extends &&
          /HTMLAttributes/i.test(meta.propDetails.extends);
        if (meta.propDetails && !extendsHTML) {
          const knownProps = new Set([
            ...meta.propDetails.props.map(p => p.name),
            'children', 'className', 'style', 'key', 'ref', 'id',
            'data-testid', 'aria-label', 'aria-describedby',
            'onClick', 'onChange', 'onBlur', 'onFocus', 'onSubmit', 'onKeyDown', 'onKeyUp', 'onMouseEnter', 'onMouseLeave',
          ]);

          // Extract JSX attribute blocks with proper brace/string handling
          const attrBlocks = extractJsxAttrBlocks(code, name);
          for (const attrsBlock of attrBlocks) {
            // Match prop names: word= or word /> or word> (boolean props)
            const propNames = [...attrsBlock.matchAll(/\b([a-zA-Z][a-zA-Z0-9]*)\s*(?==|\/?>)/g)]
              .map(m => m[1])
              .filter(p => p !== name); // exclude component name itself

            for (const prop of propNames) {
              if (!knownProps.has(prop) && !prop.startsWith('data') && !prop.startsWith('aria')) {
                issues.push({
                  severity: 'warning',
                  component: name,
                  message: `Unknown prop "${prop}" on <${name}>`,
                  suggestion: `Known props: ${meta.propDetails!.props.slice(0, 8).map(p => p.name).join(', ')}${meta.propDetails!.props.length > 8 ? '...' : ''}`,
                });
              }
            }
          }
        }

        // 5. Prop value validation for enums
        if (meta.propDetails) {
          for (const propDef of meta.propDetails.props) {
            if (!propDef.values || propDef.values.length === 0) continue;
            // Match: propName="value" or propName='value'
            const valuePattern = new RegExp(`<${name}[^>]*\\b${propDef.name}=["']([^"']+)["']`, 'gs');
            for (const match of code.matchAll(valuePattern)) {
              const usedValue = match[1];
              if (!propDef.values.includes(usedValue)) {
                issues.push({
                  severity: 'warning',
                  component: name,
                  message: `Invalid value "${usedValue}" for prop "${propDef.name}" on <${name}>`,
                  suggestion: `Valid values: ${propDef.values.join(', ')}`,
                });
              }
            }
          }
        }

        // 6. Composition checks
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

      // 7. Check for hardcoded colors (suggest tokens)
      const hardcodedColors = code.match(HARDCODED_COLOR_RE);
      if (hardcodedColors && hardcodedColors.length > 0) {
        issues.push({
          severity: 'warning',
          component: 'global',
          message: `Found ${hardcodedColors.length} hardcoded color(s). Use design tokens instead.`,
          suggestion: 'Use var(--ink-font-color-default), var(--ink-bg-color-default), etc. Call get_design_tokens({ category: "guide" }) for the full guide.',
        });
      }

      // 8. Check for hardcoded pixel spacing (suggest tokens)
      const hardcodedSpacing = code.match(HARDCODED_SPACING_RE);
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
        content: [{ type: 'text' as const, text: JSON.stringify(summary) }],
      };
    })
  );
}
