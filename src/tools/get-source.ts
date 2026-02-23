import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { SourceReader, SourceFile } from '../data/source-reader';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';
import { getSourceBaseUrl, getSiteBaseUrl } from '../data/base-url';

/** Convert a bundle path like "design-system/2-utilities/Stack/Stack.tsx" to a static URL path */
function toStaticPath(bundlePath: string): string {
  return bundlePath.replace(/^design-system\//, '');
}

interface FileRef {
  path: string;
  url: string;
}

function filesToRefs(files: SourceFile[], baseUrl: string): FileRef[] {
  return files.map(f => {
    const staticPath = toStaticPath(f.path);
    return { path: staticPath, url: `${baseUrl}/${staticPath}` };
  });
}

export function registerGetSource(
  server: McpServer,
  registry: Registry,
  sourceReader: SourceReader,
  resolver: DependencyResolver,
  tracker: Tracker
) {
  server.tool(
    'get_component_source',
    'Get source files (TSX, CSS modules, types) for a component and optionally all its transitive dependencies — ready to copy into a project. Default "urls" mode returns lightweight file URLs (~1-2KB) instead of inline content (~100KB+). Use "inline" mode only if your client cannot fetch URLs.',
    {
      name: z.string().describe('Component name (e.g., "Button", "DataTable")'),
      includeDependencies: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include transitive dependency source files (default: true)'),
      mode: z
        .enum(['urls', 'inline'])
        .optional()
        .default('urls')
        .describe('Response mode: "urls" returns file URLs (default, ~1-2KB), "inline" returns full file contents (~100KB+)'),
    },
    withTracking(tracker, 'get_component_source', server, async ({ name, includeDependencies, mode }) => {
      const meta = registry.getComponent(name);
      if (!meta) {
        const suggestions = registry.searchComponents(name).slice(0, 5);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                error: `Component "${name}" not found`,
                suggestions: suggestions.map(s => s.name),
              }),
            },
          ],
        };
      }

      // Get component's own files
      const componentFiles = sourceReader.getComponentFiles(meta.name, meta.layer);

      // Get dependency files if requested
      const dependencies: { name: string; layer: number; files: SourceFile[] }[] = [];
      if (includeDependencies) {
        const deps = resolver.getDependencies(meta.name);
        for (const dep of deps) {
          const depMeta = registry.getComponent(dep.name);
          if (!depMeta) continue;
          const depFiles = sourceReader.getComponentFiles(dep.name, dep.layer);
          if (depFiles.length > 0) {
            dependencies.push({
              name: dep.name,
              layer: dep.layer,
              files: depFiles,
            });
          }
        }
      }

      // Infrastructure files
      const infrastructure: SourceFile[] = [];
      try {
        infrastructure.push(sourceReader.getTokens());
      } catch {
        // tokens.css not found — skip
      }
      try {
        infrastructure.push(sourceReader.getUtility());
      } catch {
        // utils.ts not found — skip
      }

      // ── Inline mode: return full file contents (legacy behavior) ───
      if (mode === 'inline') {
        // Compute detailed stats only in inline mode (files already loaded)
        const allFiles = [
          ...componentFiles,
          ...dependencies.flatMap(d => d.files),
          ...infrastructure,
        ];
        tracker.emit({
          event: 'source_delivery',
          ts: new Date().toISOString(),
          component: meta.name,
          fileCount: allFiles.length,
          totalBytes: allFiles.reduce((sum, f) => sum + f.content.length, 0),
          depCount: dependencies.length,
          depNames: dependencies.map(d => d.name),
        });

        const result = {
          component: meta.name,
          layer: meta.layer,
          mode: 'inline' as const,
          import: `import { ${meta.name} } from '${meta.imports}';`,
          files: componentFiles,
          ...(dependencies.length > 0 && { dependencies }),
          infrastructure,
        };
        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      }

      // ── URLs mode (default): return lightweight file references ────
      const baseUrl = getSourceBaseUrl();

      const result = {
        component: meta.name,
        layer: meta.layer,
        mode: 'urls' as const,
        import: `import { ${meta.name} } from '${meta.imports}';`,
        baseUrl,
        files: filesToRefs(componentFiles, baseUrl),
        ...(dependencies.length > 0 && {
          dependencies: dependencies.map(d => ({
            name: d.name,
            layer: d.layer,
            files: filesToRefs(d.files, baseUrl),
          })),
        }),
        infrastructure: {
          tokens: `${baseUrl}/tokens.css`,
          utility: `${baseUrl}/utils.ts`,
          fonts: `${getSiteBaseUrl()}/fonts.css`,
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    })
  );
}
