import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { SourceReader, SourceFile } from '../data/source-reader';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';
import { getSourceBaseUrl, getSiteBaseUrl } from '../data/base-url';

// ── Layer directory names ────────────────────────────────────────────
const LAYER_DIR: Record<number, string> = {
  2: '2-utilities',
  3: '3-primitives',
  4: '4-composites',
  5: '5-patterns',
  6: '6-layouts',
};

// ── Boilerplate templates ────────────────────────────────────────────

function packageJson(projectName: string): string {
  return JSON.stringify(
    {
      name: projectName,
      private: true,
      type: 'module',
      scripts: {
        dev: 'vite',
        build: 'vite build',
        preview: 'vite preview',
      },
      dependencies: {
        react: '^19.0.0',
        'react-dom': '^19.0.0',
        'lucide-react': '^0.487.0',
      },
      devDependencies: {
        typescript: '~5.7.0',
        vite: '^6.3.0',
        '@vitejs/plugin-react-swc': '^3.10.0',
        '@types/react': '^19.0.0',
        '@types/react-dom': '^19.0.0',
      },
    },
    null,
    2
  );
}

const VITE_CONFIG = `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: { port: 3000, open: true },
});
`;

const TSCONFIG = JSON.stringify(
  {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      moduleResolution: 'bundler',
      jsx: 'react-jsx',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      paths: { '@/*': ['./src/*'] },
      baseUrl: '.',
    },
    include: ['src'],
  },
  null,
  2
);

function indexHtml(projectName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

const MAIN_TSX = `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`;

const APP_TSX = `export default function App() {
  return (
    <div>
      {/* Your prototype here */}
    </div>
  );
}
`;

const INDEX_CSS = `@import './design-system/1-tokens/tokens.css';

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html {
  -webkit-text-size-adjust: 100%;
  line-height: 1.5;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: var(--ink-font-default);
  background-color: var(--ink-bg-default);
  -webkit-font-smoothing: antialiased;
}

button, input, select, textarea { font: inherit; color: inherit; }
img, svg { display: block; max-width: 100%; }
`;

// ── Barrel export generation ─────────────────────────────────────────

function componentBarrel(componentName: string): string {
  return `export { ${componentName} } from './${componentName}';\n`;
}

function layerBarrel(componentNames: string[]): string {
  return componentNames
    .map((name) => `export { ${name} } from './${name}';`)
    .join('\n') + '\n';
}

function mainBarrel(layerComponents: Map<number, string[]>): string {
  const lines: string[] = [];
  for (const layer of [2, 3, 4, 5, 6]) {
    const names = layerComponents.get(layer);
    if (!names || names.length === 0) continue;
    const dir = LAYER_DIR[layer];
    lines.push(`export { ${names.join(', ')} } from './${dir}';`);
  }
  return lines.join('\n') + '\n';
}

/** Convert a bundle path like "design-system/2-utilities/Stack/Stack.tsx" to a static URL path */
function toStaticPath(bundlePath: string): string {
  return bundlePath.replace(/^design-system\//, '');
}

// ── Tool registration ────────────────────────────────────────────────

export function registerScaffoldProject(
  server: McpServer,
  registry: Registry,
  sourceReader: SourceReader,
  resolver: DependencyResolver,
  tracker: Tracker
) {
  server.tool(
    'scaffold_project',
    'Generate a complete, ready-to-run Vite + React + TypeScript project with the specified Ink Design System components. Default "urls" mode returns lightweight file URLs for source code (~5KB) instead of inline content (~200KB+). Use "inline" mode only if your client cannot fetch URLs.',
    {
      projectName: z
        .string()
        .describe('Directory name for the project, e.g. "my-prototype"'),
      components: z
        .array(z.string())
        .describe(
          'Component names to include, e.g. ["Button", "Input", "DocuSignShell"]. Transitive dependencies are resolved automatically.'
        ),
      mode: z
        .enum(['urls', 'inline'])
        .optional()
        .default('urls')
        .describe('Response mode: "urls" returns file URLs for source code (default, ~5KB), "inline" returns full file contents (~200KB+)'),
    },
    withTracking(tracker, 'scaffold_project', server, async ({ projectName, components, mode }) => {
      // ── 1. Resolve & validate components ───────────────────────────
      const notFound: string[] = [];
      const allResolved = new Map<string, { name: string; layer: number }>();

      for (const name of components) {
        const meta = registry.getComponent(name);
        if (!meta) {
          notFound.push(name);
          continue;
        }

        const deps = resolver.resolve(meta.name);
        for (const dep of deps) {
          if (!allResolved.has(dep.name)) {
            allResolved.set(dep.name, { name: dep.name, layer: dep.layer });
          }
        }
      }

      if (notFound.length > 0 && allResolved.size === 0) {
        const suggestions = notFound.flatMap((n) =>
          registry.searchComponents(n).slice(0, 3).map((s) => s.name)
        );
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: `No valid components found. Unknown: ${notFound.join(', ')}`,
                  suggestions: [...new Set(suggestions)],
                },
                null,
                2
              ),
            },
          ],
        };
      }

      // ── 2. Group components by layer for barrel generation ──────────
      const layerComponents = new Map<number, string[]>();
      for (const { name, layer } of allResolved.values()) {
        const layerList = layerComponents.get(layer) ?? [];
        layerList.push(name);
        layerComponents.set(layer, layerList);
      }

      // Sort for deterministic output
      for (const [layer, names] of layerComponents) {
        layerComponents.set(layer, names.sort());
      }

      // ── 3. Generate barrel exports ─────────────────────────────────
      const barrelFiles: Record<string, string> = {};

      for (const { name, layer } of allResolved.values()) {
        const layerDir = LAYER_DIR[layer];
        const barrelPath = `src/design-system/${layerDir}/${name}/index.ts`;
        barrelFiles[barrelPath] = componentBarrel(name);
      }

      for (const [layer, names] of layerComponents) {
        const dir = LAYER_DIR[layer];
        barrelFiles[`src/design-system/${dir}/index.ts`] = layerBarrel(names);
      }

      barrelFiles['src/design-system/index.ts'] = mainBarrel(layerComponents);

      // ── 4. Generate boilerplate ────────────────────────────────────
      const boilerplateFiles: Record<string, string> = {
        'package.json': packageJson(projectName),
        'vite.config.ts': VITE_CONFIG,
        'tsconfig.json': TSCONFIG,
        'index.html': indexHtml(projectName),
        'src/main.tsx': MAIN_TSX,
        'src/App.tsx': APP_TSX,
        'src/index.css': INDEX_CSS,
      };

      const componentCount = allResolved.size;
      const componentNames = [...allResolved.values()].map((c) => c.name).sort();

      // Semantic event
      tracker.emit({
        event: 'search_query',
        ts: new Date().toISOString(),
        query: `scaffold: ${components.join(', ')}`,
        resultCount: componentCount,
        topMatches: componentNames,
      });

      // ── Inline mode: return full file contents (legacy behavior) ───
      if (mode === 'inline') {
        const files: Record<string, string> = {};
        const seenPaths = new Set<string>();

        for (const { name, layer } of allResolved.values()) {
          const componentFiles = sourceReader.getComponentFiles(name, layer);
          for (const file of componentFiles) {
            const destPath = `src/${file.path}`;
            if (!seenPaths.has(destPath)) {
              seenPaths.add(destPath);
              files[destPath] = file.content;
            }
          }
        }

        try {
          const tokens = sourceReader.getTokens();
          files[`src/${tokens.path}`] = tokens.content;
        } catch { /* skip */ }

        try {
          const utils = sourceReader.getUtility();
          files[`src/${utils.path}`] = utils.content;
        } catch { /* skip */ }

        Object.assign(files, barrelFiles, boilerplateFiles);

        const result = {
          projectName,
          mode: 'inline' as const,
          totalFiles: Object.keys(files).length,
          componentCount,
          components: componentNames,
          ...(notFound.length > 0 && { notFound }),
          instructions: [
            `1. Write all files to a '${projectName}' directory`,
            `2. cd ${projectName} && npm install`,
            '3. npm run dev',
            '4. Write your prototype in src/App.tsx',
            `5. Import components from '@/design-system'`,
          ].join('\n'),
          files,
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      // ── URLs mode (default): return lightweight file references ────
      const baseUrl = getSourceBaseUrl();

      // Build source file URL list (component files + infrastructure)
      const sourceFiles: { destPath: string; url: string }[] = [];
      const seenPaths = new Set<string>();

      for (const { name, layer } of allResolved.values()) {
        const componentFiles = sourceReader.getComponentFiles(name, layer);
        for (const file of componentFiles) {
          const destPath = `src/${file.path}`;
          if (!seenPaths.has(destPath)) {
            seenPaths.add(destPath);
            const staticPath = toStaticPath(file.path);
            sourceFiles.push({ destPath, url: `${baseUrl}/${staticPath}` });
          }
        }
      }

      const result = {
        projectName,
        mode: 'urls' as const,
        baseUrl,
        totalFiles: Object.keys(boilerplateFiles).length + Object.keys(barrelFiles).length + sourceFiles.length + 2, // +2 for tokens + utils
        componentCount,
        components: componentNames,
        ...(notFound.length > 0 && { notFound }),
        instructions: [
          `1. Create a '${projectName}' directory`,
          '2. Write the "boilerplate" and "barrels" files directly (content is included)',
          '3. For each entry in "sourceFiles", fetch the URL and write to the destPath',
          '4. Fetch the infrastructure URLs and write tokens.css + utils.ts',
          `5. cd ${projectName} && npm install && npm run dev`,
          '6. Write your prototype in src/App.tsx',
          `7. Import components from '@/design-system'`,
        ].join('\n'),
        boilerplate: boilerplateFiles,
        barrels: barrelFiles,
        sourceFiles,
        infrastructure: {
          tokens: { destPath: 'src/design-system/1-tokens/tokens.css', url: `${baseUrl}/tokens.css` },
          utility: { destPath: 'src/lib/utils.ts', url: `${baseUrl}/utils.ts` },
          fonts: { destPath: 'src/styles/fonts.css', url: `${getSiteBaseUrl()}/fonts.css` },
        },
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }],
      };
    })
  );
}
