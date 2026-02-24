import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { SourceReader, SourceFile } from '../data/source-reader';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';
import { getSourceBaseUrl, getSiteBaseUrl } from '../data/base-url';
import {
  parseIconPaths,
  scanUsedIcons,
  generateTrimmedIconPaths,
  COMMON_ICONS,
} from '../data/icon-utils';

// ── Font files served from public/ ───────────────────────────────────
const FONT_VARIANTS = [
  'Regular', 'Light', 'Medium', 'SemiBold', 'Bold', 'Black',
  'Italic', 'LightItalic', 'MediumItalic', 'SemiBoldItalic', 'BoldItalic', 'BlackItalic',
];
const FONT_FILES = FONT_VARIANTS.map(v => `fonts/DSIndigo-${v}/DSIndigo-${v}.woff2`);

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

// ── Smart App.tsx generation ─────────────────────────────────────────

/**
 * Detect the best layout pattern from the resolved component set
 * and generate a working App.tsx with correct imports and composition.
 *
 * Patterns (checked in priority order):
 * 1. Shell + DataTable  → full app with table, sample data, columns
 * 2. Shell + Form       → app with form fields
 * 3. Shell + Dashboard  → app with card grid
 * 4. Shell only         → minimal app shell
 * 5. DataTable (no shell) → standalone table
 * 6. Form (no shell)    → standalone form
 * 7. Fallback           → imports + placeholder
 */
function generateAppTsx(componentNames: Set<string>, requestedComponents?: Set<string>): string {
  const has = (name: string) => componentNames.has(name);
  // For pattern detection, only check explicitly-requested components (not transitive deps)
  // This prevents e.g. SearchInput pulling in Input and triggering form pattern
  const requested = requestedComponents ?? componentNames;
  const wasRequested = (name: string) => requested.has(name);

  const hasShell = has('DocuSignShell');
  const hasTable = has('DataTable');
  const hasForm = wasRequested('Input') || wasRequested('Select') || wasRequested('ComboBox') || wasRequested('TextArea');
  const hasDashboard = has('Card') && (has('Grid') || has('Inline'));
  const hasModal = has('Modal');
  const hasPageHeader = has('PageHeader');
  const hasTabs = has('Tabs');

  // Build import list based on what's used in the template
  const imports = new Set<string>();

  // ── Shell wrapper (open/close) ───────────────────────────────────
  let shellOpen = '';
  let shellClose = '';
  let topLevelCode = '';

  if (hasShell) {
    imports.add('DocuSignShell');

    // Determine which nav item should be active based on pattern
    let activeNavItem = 'home';
    if (hasTable) activeNavItem = 'agreements';
    else if (hasForm) activeNavItem = 'admin';
    else if (hasDashboard) activeNavItem = 'home';

    const globalNavLines = `const globalNavConfig = {
  logo: <span style={{ fontWeight: 700, fontSize: 18 }}>MyApp</span>,
  navItems: [
    { id: 'home', label: 'Home', href: '#'${activeNavItem === 'home' ? ', active: true' : ''} },
    { id: 'agreements', label: 'Agreements', href: '#'${activeNavItem === 'agreements' ? ', active: true' : ''} },
    { id: 'templates', label: 'Templates', href: '#' },
    { id: 'reports', label: 'Reports', href: '#' },
    { id: 'admin', label: 'Admin', href: '#'${activeNavItem === 'admin' ? ', active: true' : ''} },
  ],
  showSearch: true,
  showNotifications: true,
  notificationCount: 3,
  showSettings: true,
  user: { name: 'Jane Smith', email: 'jane@example.com' },
};`;

    // Add LocalNav for shell + form patterns (settings/admin pages)
    const includeLocalNav = hasForm;
    let localNavLines = '';
    if (includeLocalNav) {
      localNavLines = `

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
};`;
    }

    topLevelCode = globalNavLines + localNavLines + (topLevelCode ? '\n' + topLevelCode : '');

    const navProps = includeLocalNav
      ? 'globalNav={globalNavConfig} localNav={localNavConfig}'
      : 'globalNav={globalNavConfig}';
    shellOpen = `    <DocuSignShell ${navProps}>`;
    shellClose = '    </DocuSignShell>';
  }

  // ── Page header ──────────────────────────────────────────────────
  let headerBlock = '';
  if (hasPageHeader) {
    imports.add('PageHeader');
    if (has('Button')) {
      imports.add('Button');
      headerBlock = `      <PageHeader title="My Page" actions={<Button kind="brand">New</Button>} />`;
    } else {
      headerBlock = '      <PageHeader title="My Page" />';
    }
  }

  // ── Content block (the main body) ────────────────────────────────
  let contentBlock = '';
  let stateBlock = '';

  if (hasTable) {
    // DataTable template with sample data
    imports.add('DataTable');
    if (has('Badge')) imports.add('Badge');

    topLevelCode += `
// Sample data — replace with your own
interface Row {
  id: string;
  name: string;
  status: string;
  date: string;
}

const sampleData: Row[] = [
  { id: '1', name: 'NDA - Acme Corp', status: 'Active', date: '2024-01-15' },
  { id: '2', name: 'MSA - Globex Inc', status: 'Pending', date: '2024-02-20' },
  { id: '3', name: 'SOW - Initech', status: 'Completed', date: '2024-03-10' },
];

const columns = [
  { key: 'name' as const, header: 'Name', sortable: true },${has('Badge') ? `
  {
    key: 'status' as const,
    header: 'Status',
    cell: (row: Row) => <Badge kind={row.status === 'Active' ? 'success' : 'subtle'}>{row.status}</Badge>,
  },` : `
  { key: 'status' as const, header: 'Status' },`}
  { key: 'date' as const, header: 'Date' },
];
`;

    contentBlock = `      <DataTable
          columns={columns}
          data={sampleData}
          getRowKey={(row) => row.id}
        />`;
  } else if (hasForm) {
    // Form template
    imports.add('Stack');
    if (has('Input')) imports.add('Input');
    if (has('Select')) imports.add('Select');
    if (has('TextArea')) imports.add('TextArea');
    if (has('ComboBox')) imports.add('ComboBox');
    if (has('Button')) imports.add('Button');

    const fields: string[] = [];
    if (has('Input')) {
      fields.push('        <Input label="Full Name" placeholder="Enter your name" />');
      fields.push('        <Input label="Email" type="email" placeholder="you@example.com" />');
    }
    if (has('Select')) {
      fields.push(`        <Select label="Role" options={[
          { value: 'admin', label: 'Admin' },
          { value: 'user', label: 'User' },
          { value: 'viewer', label: 'Viewer' },
        ]} />`);
    }
    if (has('TextArea')) {
      fields.push('        <TextArea label="Notes" placeholder="Additional notes..." rows={4} />');
    }
    if (has('ComboBox')) {
      fields.push(`        <ComboBox label="Department" options={[
          { value: 'eng', label: 'Engineering' },
          { value: 'design', label: 'Design' },
          { value: 'product', label: 'Product' },
        ]} />`);
    }
    if (has('Button')) {
      fields.push('        <Button kind="brand">Save Changes</Button>');
    }

    contentBlock = `      <Stack gap="medium" style={{ maxWidth: 600, padding: 'var(--ink-spacing-300)' }}>
${fields.join('\n')}
      </Stack>`;
  } else if (hasDashboard) {
    // Dashboard with cards
    imports.add('Card');
    if (has('Grid')) imports.add('Grid');
    if (has('Inline')) imports.add('Inline');

    const layout = has('Grid') ? 'Grid' : 'Inline';
    contentBlock = `      <${layout} ${has('Grid') ? 'columns={3} ' : ''}gap="medium" style={{ padding: 'var(--ink-spacing-300)' }}>
        <Card>
          <Card.Header title="Metric A" />
          <Card.Body>Content here</Card.Body>
        </Card>
        <Card>
          <Card.Header title="Metric B" />
          <Card.Body>Content here</Card.Body>
        </Card>
        <Card>
          <Card.Header title="Metric C" />
          <Card.Body>Content here</Card.Body>
        </Card>
      </${layout}>`;
  } else {
    // Generic content placeholder
    imports.add('Stack');
    contentBlock = `      <Stack gap="medium" style={{ padding: 'var(--ink-spacing-300)' }}>
        {/* Your content here */}
      </Stack>`;
  }

  // ── Modal (added as bonus if present) ────────────────────────────
  let modalBlock = '';
  if (hasModal) {
    imports.add('Modal');
    if (has('Button')) imports.add('Button');
    stateBlock = "  const [modalOpen, setModalOpen] = useState(false);\n";

    modalBlock = `
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example Modal"
      >
        <p>Modal content goes here.</p>
      </Modal>`;
  }

  // ── Tabs wrapper (if present, wrap content) ──────────────────────
  if (hasTabs) {
    imports.add('Tabs');
    stateBlock += "  const [activeTab, setActiveTab] = useState('tab1');\n";

    contentBlock = `      <Tabs
        items={[
          { id: 'tab1', label: 'Overview' },
          { id: 'tab2', label: 'Details' },
          { id: 'tab3', label: 'History' },
        ]}
        activeId={activeTab}
        onActivate={setActiveTab}
      />
${contentBlock}`;
  }

  // ── Assemble the full file ───────────────────────────────────────
  const needsState = stateBlock.length > 0;
  const reactImport = needsState ? "import { useState } from 'react';\n" : '';
  const dsImport = `import { ${[...imports].sort().join(', ')} } from '@/design-system';`;

  const bodyParts = [headerBlock, contentBlock, modalBlock].filter(Boolean);

  let body: string;
  if (hasShell) {
    body = `${shellOpen}\n${bodyParts.join('\n')}\n${shellClose}`;
  } else {
    // No shell — wrap in a div with padding
    body = bodyParts.length === 1
      ? bodyParts[0]
      : `    <div style={{ padding: 'var(--ink-spacing-300)' }}>\n${bodyParts.join('\n')}\n    </div>`;
  }

  return `${reactImport}${dsImport}
${topLevelCode}
export default function App() {
${stateBlock}  return (
${body}
  );
}
`;
}

const INDEX_CSS_WITH_FONTS = `@import './design-system/1-tokens/tokens.css';
@import './styles/fonts.css';

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

const INDEX_CSS_NO_FONTS = `@import './design-system/1-tokens/tokens.css';

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
 * Generate a barrel file for a component directory.
 * For host components that have virtual children (e.g. Typography hosts Heading+Text),
 * export both the host and virtual names from the same directory.
 */
function componentBarrel(componentName: string, virtualExports?: string[]): string {
  const names = [componentName, ...(virtualExports ?? [])];
  return `export { ${names.join(', ')} } from './${componentName}';\n`;
}

/**
 * Generate a layer barrel. Virtual components are routed to their host directory.
 * @param componentNames - all component names in this layer
 * @param virtualToHost - map of virtual component name → host component name
 */
function layerBarrel(componentNames: string[], virtualToHost: Map<string, string>): string {
  // Group exports by directory: host components + virtual components pointing to same dir
  const dirExports = new Map<string, string[]>();
  for (const name of componentNames) {
    const dir = virtualToHost.get(name) ?? name;
    const exports = dirExports.get(dir) ?? [];
    exports.push(name);
    dirExports.set(dir, exports);
  }
  return [...dirExports.entries()]
    .map(([dir, names]) => `export { ${names.join(', ')} } from './${dir}';`)
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
      includeFonts: z
        .boolean()
        .optional()
        .default(true)
        .describe('Include DS Indigo font files (12 woff2 variants). Set false to use system fonts and reduce response size.'),
    },
    withTracking(tracker, 'scaffold_project', server, async ({ projectName, components, mode, includeFonts }) => {
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
              text: JSON.stringify({
                error: `No valid components found. Unknown: ${notFound.join(', ')}`,
                suggestions: [...new Set(suggestions)],
              }),
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

      // ── 3. Generate barrel exports (virtual-component-aware) ───────
      const barrelFiles: Record<string, string> = {};

      // Build virtual → host mapping from registry metadata
      const virtualToHost = new Map<string, string>();
      for (const { name } of allResolved.values()) {
        const meta = registry.getComponent(name);
        if (meta?.sourceComponent) {
          virtualToHost.set(name, meta.sourceComponent);
        }
      }

      // Group virtual components by their host for barrel generation
      const hostVirtuals = new Map<string, string[]>();
      for (const [virtual, host] of virtualToHost) {
        const list = hostVirtuals.get(host) ?? [];
        list.push(virtual);
        hostVirtuals.set(host, list);
      }

      for (const { name, layer } of allResolved.values()) {
        // Skip virtual components — they share their host's directory
        if (virtualToHost.has(name)) continue;

        const layerDir = LAYER_DIR[layer];
        const barrelPath = `src/design-system/${layerDir}/${name}/index.ts`;
        const virtualExports = hostVirtuals.get(name);
        barrelFiles[barrelPath] = componentBarrel(name, virtualExports);
      }

      for (const [layer, names] of layerComponents) {
        const dir = LAYER_DIR[layer];
        barrelFiles[`src/design-system/${dir}/index.ts`] = layerBarrel(names, virtualToHost);
      }

      barrelFiles['src/design-system/index.ts'] = mainBarrel(layerComponents);

      // ── 4. Build trimmed iconPaths if Icon is in the resolved set ──
      let trimmedIconPaths: string | null = null;
      if (allResolved.has('Icon')) {
        // Collect all component source contents to scan for icon usage
        const allSourceContents: string[] = [];
        for (const { name, layer } of allResolved.values()) {
          const files = sourceReader.getComponentFiles(name, layer);
          for (const f of files) {
            allSourceContents.push(f.content);
          }
        }

        // Scan for icon names used in component source code
        const usedIcons = scanUsedIcons(allSourceContents);

        // Merge with common icons safety net
        for (const icon of COMMON_ICONS) {
          usedIcons.add(icon);
        }

        // Parse full iconPaths.ts and generate trimmed version
        const iconFiles = sourceReader.getComponentFiles('Icon', 3);
        const iconPathsFile = iconFiles.find(f => f.path.endsWith('iconPaths.ts'));
        if (iconPathsFile) {
          const allIcons = parseIconPaths(iconPathsFile.content);
          trimmedIconPaths = generateTrimmedIconPaths(usedIcons, allIcons, getSourceBaseUrl());
        }
      }

      // ── 5. Generate boilerplate ────────────────────────────────────
      const componentCount = allResolved.size;
      const componentNames = [...allResolved.values()].map((c) => c.name).sort();

      const boilerplateFiles: Record<string, string> = {
        'package.json': packageJson(projectName),
        'vite.config.ts': VITE_CONFIG,
        'tsconfig.json': TSCONFIG,
        'index.html': indexHtml(projectName),
        'src/main.tsx': MAIN_TSX,
        'src/App.tsx': generateAppTsx(new Set(componentNames), new Set(components)),
        'src/index.css': includeFonts ? INDEX_CSS_WITH_FONTS : INDEX_CSS_NO_FONTS,
      };

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
          // Skip virtual components whose host is already in the resolved set (avoids duplicate files)
          const host = virtualToHost.get(name);
          if (host && allResolved.has(host)) continue;

          const componentFiles = sourceReader.getComponentFiles(name, layer);
          for (const file of componentFiles) {
            const destPath = `src/${file.path}`;
            if (!seenPaths.has(destPath)) {
              seenPaths.add(destPath);
              // Replace full iconPaths.ts with trimmed version
              if (trimmedIconPaths && file.path.endsWith('iconPaths.ts')) {
                files[destPath] = trimmedIconPaths;
              } else {
                files[destPath] = file.content;
              }
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

        const siteUrl = getSiteBaseUrl();
        const result = {
          projectName,
          mode: 'inline' as const,
          totalFiles: Object.keys(files).length,
          componentCount,
          components: componentNames,
          ...(notFound.length > 0 && { notFound }),
          quickStart: `cd ${projectName} && npm install && npm run dev`,
          instructions: includeFonts
            ? `Write all files, fetch fonts.css to src/styles/fonts.css, fetch fontFiles to public/fonts/, then run quickStart. Import from '@/design-system'.`
            : `Write all files, then run quickStart. Import from '@/design-system'.`,
          files,
          ...(includeFonts && {
            fonts: { destPath: 'src/styles/fonts.css', url: `${siteUrl}/fonts.css` },
            fontFiles: FONT_FILES.map(f => ({
              destPath: `public/${f}`,
              url: `${siteUrl}/${f}`,
            })),
          }),
        };

        return {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
        };
      }

      // ── URLs mode (default): return lightweight file references ────
      const baseUrl = getSourceBaseUrl();

      // Build source file URL list (component files + infrastructure)
      const sourceFiles: { destPath: string; url: string }[] = [];
      const generatedFiles: Record<string, string> = {};
      const seenPaths = new Set<string>();

      for (const { name, layer } of allResolved.values()) {
        // Skip virtual components whose host is already in the resolved set
        const host = virtualToHost.get(name);
        if (host && allResolved.has(host)) continue;

        const componentFiles = sourceReader.getComponentFiles(name, layer);
        for (const file of componentFiles) {
          const destPath = `src/${file.path}`;
          if (!seenPaths.has(destPath)) {
            seenPaths.add(destPath);
            // Replace full iconPaths.ts with trimmed version (inline, since it's generated)
            if (trimmedIconPaths && file.path.endsWith('iconPaths.ts')) {
              generatedFiles[destPath] = trimmedIconPaths;
            } else {
              const staticPath = toStaticPath(file.path);
              sourceFiles.push({ destPath, url: `${baseUrl}/${staticPath}` });
            }
          }
        }
      }

      const infrastructure: Record<string, { destPath: string; url: string }> = {
        tokens: { destPath: 'src/design-system/1-tokens/tokens.css', url: `${baseUrl}/tokens.css` },
        utility: { destPath: 'src/lib/utils.ts', url: `${baseUrl}/utils.ts` },
      };
      if (includeFonts) {
        infrastructure.fonts = { destPath: 'src/styles/fonts.css', url: `${getSiteBaseUrl()}/fonts.css` };
      }

      const result = {
        projectName,
        mode: 'urls' as const,
        baseUrl,
        totalFiles: Object.keys(boilerplateFiles).length + Object.keys(barrelFiles).length + sourceFiles.length + Object.keys(generatedFiles).length + 2, // +2 for tokens + utils
        componentCount,
        components: componentNames,
        ...(notFound.length > 0 && { notFound }),
        quickStart: `cd ${projectName} && npm install && npm run dev`,
        instructions: `Write boilerplate/barrels/generatedFiles directly, fetch sourceFiles URLs to destPaths, fetch infrastructure URLs, ${includeFonts ? 'fetch fontFiles to public/fonts/, ' : ''}then run quickStart. Import from '@/design-system'.`,
        boilerplate: boilerplateFiles,
        barrels: barrelFiles,
        ...(Object.keys(generatedFiles).length > 0 && { generatedFiles }),
        sourceFiles,
        infrastructure,
        ...(includeFonts && {
          fontFiles: FONT_FILES.map(f => ({
            destPath: `public/${f}`,
            url: `${getSiteBaseUrl()}/${f}`,
          })),
        }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    })
  );
}
