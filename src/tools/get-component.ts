import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

export function registerGetComponent(
  server: McpServer,
  registry: Registry,
  resolver: DependencyResolver,
  tracker: Tracker
) {
  server.tool(
    'get_component',
    'Get full details for a single Ink Design System component — props, examples, dependencies, import pattern',
    { name: z.string().describe('Component name (e.g., "Button", "DataTable", "Modal")') },
    withTracking(tracker, 'get_component', server, async ({ name }) => {
      const meta = registry.getComponent(name);
      if (!meta) {
        const suggestions = registry.searchComponents(name).slice(0, 5);

        // Semantic event — not found
        tracker.emit({
          event: 'component_lookup',
          ts: new Date().toISOString(),
          component: name,
          found: false,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: `Component "${name}" not found`,
                  suggestions: suggestions.map(s => s.name),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // Semantic event — found
      tracker.emit({
        event: 'component_lookup',
        ts: new Date().toISOString(),
        component: meta.name,
        found: true,
      });

      const deps = resolver.getDependencies(meta.name);

      const result = {
        name: meta.name,
        layer: meta.layer,
        layerName: registry.getLayerName(meta.layer),
        type: meta.type,
        description: meta.description,
        import: `import { ${meta.name} } from '${meta.imports}';`,
        props: meta.props,
        ...(meta.propDetails && {
          propDetails: meta.propDetails.props,
          ...(meta.propDetails.extends && { extends: meta.propDetails.extends }),
          ...(meta.propDetails.types.length > 0 && { propTypes: meta.propDetails.types }),
        }),
        ...(meta.variants && { variants: meta.variants }),
        ...(meta.types && { types: meta.types }),
        ...(meta.sizes && { sizes: meta.sizes }),
        ...(meta.statuses && { statuses: meta.statuses }),
        ...(meta.iconList && { iconList: meta.iconList }),
        ...(meta.composition && { composition: meta.composition }),
        examples: meta.examples,
        useCases: meta.useCases,
        dependencies: deps.map(d => ({
          name: d.name,
          layer: d.layer,
          type: d.type,
        })),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    })
  );
}
