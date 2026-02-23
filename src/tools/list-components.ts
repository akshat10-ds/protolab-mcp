import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

export function registerListComponents(server: McpServer, registry: Registry, tracker: Tracker) {
  server.tool(
    'list_components',
    'Browse all Ink Design System components, optionally filtered by layer (2=utilities, 3=primitives, 4=composites, 5=patterns, 6=layouts)',
    { layer: z.number().min(2).max(6).optional().describe('Filter by layer number (2-6)') },
    withTracking(tracker, 'list_components', server, async ({ layer }) => {
      const components = registry.listComponents(layer);

      const grouped = new Map<number, typeof components>();
      for (const c of components) {
        if (!grouped.has(c.layer)) grouped.set(c.layer, []);
        grouped.get(c.layer)!.push(c);
      }

      const result = {
        stats: registry.getStats(),
        components: Array.from(grouped.entries())
          .sort(([a], [b]) => b - a) // Layer 6 first
          .map(([layerNum, comps]) => ({
            layer: layerNum,
            layerName: registry.getLayerName(layerNum),
            count: comps.length,
            components: comps.map(c => ({
              name: c.name,
              type: c.type,
              description: c.description,
            })),
          })),
      };

      // Semantic event
      tracker.emit({
        event: 'component_list',
        ts: new Date().toISOString(),
        layerFilter: layer ?? null,
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    })
  );
}
