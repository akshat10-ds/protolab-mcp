import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { SourceReader, SourceFile } from '../data/source-reader';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';
import { getSourceBaseUrl, getSiteBaseUrl } from '../data/base-url';

// ── Font variants served from public/fonts/ ─────────────────────────
const FONT_VARIANTS = [
  'Regular', 'Light', 'Medium', 'SemiBold', 'Bold', 'Black',
  'Italic', 'LightItalic', 'MediumItalic', 'SemiBoldItalic', 'BoldItalic', 'BlackItalic',
];

/** Convert a bundle path like "design-system/2-utilities/Stack/Stack.tsx" to a static URL path */
function toStaticPath(bundlePath: string): string {
  return bundlePath.replace(/^design-system\//, '');
}

/** Files excluded from Icon component source — served separately via iconCatalog */
const ICON_EXCLUDED_FILES = new Set(['iconPaths.ts', 'IconDemo.tsx']);

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

      // Get component's own files (with virtual component fallback)
      let componentFiles = sourceReader.getComponentFiles(meta.name, meta.layer);
      if (componentFiles.length === 0 && meta.sourceComponent) {
        // Virtual component — fall back to host component's files
        componentFiles = sourceReader.getComponentFiles(meta.sourceComponent, meta.layer);
      }

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

      // ── Filter Icon component files (exclude 64KB iconPaths.ts) ────
      const isIcon = meta.name === 'Icon';
      const filteredFiles = isIcon
        ? componentFiles.filter(f => {
            const fileName = f.path.split('/').pop() ?? '';
            return !ICON_EXCLUDED_FILES.has(fileName);
          })
        : componentFiles;

      // ── Inline mode: return full file contents (legacy behavior) ───
      if (mode === 'inline') {
        // Compute detailed stats only in inline mode (files already loaded)
        const allFiles = [
          ...filteredFiles,
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
          files: filteredFiles,
          ...(dependencies.length > 0 && { dependencies }),
          infrastructure,
          ...(isIcon && {
            iconCatalog: {
              totalIcons: meta.iconList?.length ?? 0,
              fullFileUrl: `${getSourceBaseUrl()}/3-primitives/Icon/iconPaths.ts`,
              manifestUrl: `${getSourceBaseUrl()}/3-primitives/Icon/icons/manifest.json`,
              iconUrlPattern: `${getSourceBaseUrl()}/3-primitives/Icon/icons/{name}.json`,
              note: 'Icon SVG paths excluded to save ~64KB. Fetch individual icons by name or the full file if needed.',
            },
          }),
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
        files: filesToRefs(filteredFiles, baseUrl),
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
          fontFiles: FONT_VARIANTS.map(v => `${getSiteBaseUrl()}/fonts/DSIndigo-${v}/DSIndigo-${v}.woff2`),
        },
        ...(isIcon && {
          iconCatalog: {
            totalIcons: meta.iconList?.length ?? 0,
            fullFileUrl: `${baseUrl}/3-primitives/Icon/iconPaths.ts`,
            manifestUrl: `${baseUrl}/3-primitives/Icon/icons/manifest.json`,
            iconUrlPattern: `${baseUrl}/3-primitives/Icon/icons/{name}.json`,
            note: 'Icon SVG paths excluded to save ~64KB. Fetch individual icons by name or the full file if needed.',
          },
        }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    })
  );
}
