import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { SourceReader, SourceFile } from '../data/source-reader';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

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

/**
 * Build a per-component barrel file (e.g. `Button/index.ts`) that
 * re-exports from the component's main .tsx file.
 *
 * We mirror the existing protoLab convention: each component directory
 * has an index.ts that re-exports from `./ComponentName`.
 */
function componentBarrel(componentName: string): string {
  return `export { ${componentName} } from './${componentName}';\n`;
}

/**
 * Build a layer barrel (e.g. `3-primitives/index.ts`) that re-exports
 * all included components in that layer.
 */
function layerBarrel(componentNames: string[]): string {
  return componentNames
    .map((name) => `export { ${name} } from './${name}';`)
    .join('\n') + '\n';
}

/**
 * Build the main design-system barrel that re-exports from each layer barrel.
 */
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
    'Generate a complete, ready-to-run Vite + React + TypeScript project with the specified Ink Design System components. Returns all files needed — the AI writes them to disk, user runs npm install && npm run dev.',
    {
      projectName: z
        .string()
        .describe('Directory name for the project, e.g. "my-prototype"'),
      components: z
        .array(z.string())
        .describe(
          'Component names to include, e.g. ["Button", "Input", "DocuSignShell"]. Transitive dependencies are resolved automatically.'
        ),
    },
    withTracking(tracker, 'scaffold_project', server, async ({ projectName, components }) => {
      // ── 1. Resolve & validate components ───────────────────────────
      const notFound: string[] = [];
      const allResolved = new Map<string, { name: string; layer: number }>();

      for (const name of components) {
        const meta = registry.getComponent(name);
        if (!meta) {
          notFound.push(name);
          continue;
        }

        // Resolve transitive dependencies (includes the component itself)
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

      // ── 2. Collect source files ────────────────────────────────────
      const files: Record<string, string> = {};
      const seenPaths = new Set<string>();

      // Group components by layer for barrel generation
      const layerComponents = new Map<number, string[]>();

      for (const { name, layer } of allResolved.values()) {
        // Track for barrel exports
        const layerList = layerComponents.get(layer) ?? [];
        layerList.push(name);
        layerComponents.set(layer, layerList);

        // Get component source files
        const componentFiles = sourceReader.getComponentFiles(name, layer);
        for (const file of componentFiles) {
          const destPath = `src/${file.path}`;
          if (!seenPaths.has(destPath)) {
            seenPaths.add(destPath);
            files[destPath] = file.content;
          }
        }

        // Generate per-component barrel (index.ts)
        const layerDir = LAYER_DIR[layer];
        const barrelPath = `src/design-system/${layerDir}/${name}/index.ts`;
        if (!seenPaths.has(barrelPath)) {
          seenPaths.add(barrelPath);
          files[barrelPath] = componentBarrel(name);
        }
      }

      // ── 3. Collect infrastructure ──────────────────────────────────
      try {
        const tokens = sourceReader.getTokens();
        files[`src/${tokens.path}`] = tokens.content;
      } catch {
        // tokens.css not found — skip
      }

      try {
        const utils = sourceReader.getUtility();
        files[`src/${utils.path}`] = utils.content;
      } catch {
        // utils.ts not found — skip
      }

      // ── 4. Generate barrel exports ─────────────────────────────────
      // Sort component names within each layer for deterministic output
      for (const [layer, names] of layerComponents) {
        layerComponents.set(layer, names.sort());
      }

      // Layer barrels
      for (const [layer, names] of layerComponents) {
        const dir = LAYER_DIR[layer];
        files[`src/design-system/${dir}/index.ts`] = layerBarrel(names);
      }

      // Main barrel
      files['src/design-system/index.ts'] = mainBarrel(layerComponents);

      // ── 5. Generate boilerplate ────────────────────────────────────
      files['package.json'] = packageJson(projectName);
      files['vite.config.ts'] = VITE_CONFIG;
      files['tsconfig.json'] = TSCONFIG;
      files['index.html'] = indexHtml(projectName);
      files['src/main.tsx'] = MAIN_TSX;
      files['src/App.tsx'] = APP_TSX;
      files['src/index.css'] = INDEX_CSS;

      // ── 6. Build result ────────────────────────────────────────────
      const componentCount = allResolved.size;
      const totalFiles = Object.keys(files).length;
      const componentNames = [...allResolved.values()].map((c) => c.name).sort();

      // Semantic event
      tracker.emit({
        event: 'search_query',
        ts: new Date().toISOString(),
        query: `scaffold: ${components.join(', ')}`,
        resultCount: componentCount,
        topMatches: componentNames,
      });

      const result = {
        projectName,
        totalFiles,
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
    })
  );
}
