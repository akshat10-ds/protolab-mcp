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
  const hasAgreementView = has('AgreementTableView');
  const hasFilterBar = has('FilterBar');
  const hasBreadcrumb = has('Breadcrumb');
  const hasBanner = has('Banner');
  const hasIconButton = has('IconButton');
  const hasSearchInput = has('SearchInput');

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
  logo: <img src="/docusign-logo.svg" alt="DocuSign" />,
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

    // Add LocalNav for shell patterns that have sidebar navigation
    const includeLocalNav = hasForm || hasTable;
    let localNavLines = '';
    if (includeLocalNav && hasTable) {
      localNavLines = `

const localNavConfig = {
  headerLabel: 'New',
  sections: [
    {
      id: 'main',
      items: [
        { id: 'inbox', label: 'Inbox', icon: 'envelope' },
        { id: 'agreements', label: 'Agreements', icon: 'edit', active: true },
        { id: 'templates', label: 'Templates', icon: 'star' },
      ],
    },
    {
      id: 'folders',
      title: 'Folders',
      headerLabel: true,
      items: [
        { id: 'all', label: 'All' },
        { id: 'sent', label: 'Sent' },
        { id: 'drafts', label: 'Drafts' },
        { id: 'archived', label: 'Archived' },
      ],
    },
  ],
};`;
    } else if (includeLocalNav) {
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

  if (hasTable && hasAgreementView) {
    // Rich AgreementTableView + DataTable pattern — full agreement management page
    imports.add('DataTable');
    imports.add('AgreementTableView');
    if (has('Badge')) imports.add('Badge');
    if (hasBreadcrumb) imports.add('Breadcrumb');
    if (hasBanner) imports.add('Banner');
    if (hasFilterBar) imports.add('FilterBar');
    if (hasSearchInput) imports.add('SearchInput');
    if (hasIconButton) imports.add('IconButton');
    if (hasPageHeader) imports.add('PageHeader');
    if (has('Button')) imports.add('Button');

    topLevelCode += `
// Sample agreement data — replace with your own
interface Agreement {
  id: string;
  name: string;
  status: 'Completed' | 'Action Required' | 'Waiting for Others' | 'Expiring Soon' | 'Voided';
  sender: string;
  recipient: string;
  type: string;
  lastUpdated: string;
  expires: string;
}

const agreements: Agreement[] = [
  { id: '1', name: 'NDA - Acme Corp', status: 'Completed', sender: 'Jane Smith', recipient: 'John Davis', type: 'NDA', lastUpdated: '2024-12-15', expires: '2025-12-15' },
  { id: '2', name: 'MSA - Globex Inc', status: 'Action Required', sender: 'Jane Smith', recipient: 'Sarah Chen', type: 'MSA', lastUpdated: '2025-01-08', expires: '2026-01-08' },
  { id: '3', name: 'SOW - Initech', status: 'Waiting for Others', sender: 'Mike Johnson', recipient: 'Jane Smith', type: 'SOW', lastUpdated: '2025-01-20', expires: '2025-07-20' },
  { id: '4', name: 'Lease Agreement - 123 Main St', status: 'Completed', sender: 'Jane Smith', recipient: 'Tom Wilson', type: 'Lease', lastUpdated: '2024-11-01', expires: '2025-11-01' },
  { id: '5', name: 'Vendor Agreement - CloudCo', status: 'Expiring Soon', sender: 'Jane Smith', recipient: 'Lisa Park', type: 'Vendor', lastUpdated: '2024-06-15', expires: '2025-02-28' },
  { id: '6', name: 'Employment Offer - R. Patel', status: 'Voided', sender: 'HR Team', recipient: 'Raj Patel', type: 'Offer Letter', lastUpdated: '2025-01-25', expires: '-' },
];

const statusKind: Record<string, 'success' | 'warning' | 'error' | 'info' | 'subtle'> = {
  'Completed': 'success',
  'Action Required': 'warning',
  'Waiting for Others': 'info',
  'Expiring Soon': 'error',
  'Voided': 'subtle',
};

const columns = [
  { key: 'name' as const, header: 'Name', sortable: true },${has('Badge') ? `
  {
    key: 'status' as const,
    header: 'Status',
    cell: (row: Agreement) => <Badge kind={statusKind[row.status] ?? 'subtle'}>{row.status}</Badge>,
  },` : `
  { key: 'status' as const, header: 'Status', sortable: true },`}
  { key: 'sender' as const, header: 'Sender', sortable: true },
  { key: 'recipient' as const, header: 'Recipient', sortable: true },
  { key: 'type' as const, header: 'Type', sortable: true },
  { key: 'lastUpdated' as const, header: 'Last Updated', sortable: true },
  { key: 'expires' as const, header: 'Expires', sortable: true },
];
`;

    // AgreementTableView uses props: pageHeader, banner, filterBar, children
    // Breadcrumb goes above AgreementTableView, Tabs go into filterBar area

    // pageHeader prop
    let pageHeaderProp = '';
    if (hasPageHeader) {
      const headerActions = has('Button') ? ` actions={<Button kind="brand">Start</Button>}` : '';
      pageHeaderProp = `<PageHeader title="Agreements"${headerActions} />`;
    }

    // banner prop — Banner uses children for content, closable for dismiss
    let bannerProp = '';
    if (hasBanner) {
      bannerProp = `<Banner kind="information" closable>Try Docusign AI — automate agreement workflows with AI-powered insights.</Banner>`;
    }

    // filterBar prop — FilterBar uses search/filters/quickActions props (not children)
    let filterBarProp = '';
    if (hasFilterBar) {
      const filterBarProps: string[] = [];
      if (hasSearchInput) {
        filterBarProps.push(`search={{ placeholder: 'Search agreements...' }}`);
      }
      if (hasIconButton) {
        filterBarProps.push(`filters={<IconButton icon="filter" label="Filter" />}`);
      }
      filterBarProp = `<FilterBar ${filterBarProps.join(' ')} />`;
    }

    // Tabs — uses activeTab/onChange props
    if (hasTabs) {
      imports.add('Tabs');
      stateBlock += "  const [activeTab, setActiveTab] = useState('all');\n";
    }

    // renderRowActions
    const renderRowActions = hasIconButton
      ? `\n            renderRowActions={() => <IconButton icon="more-horizontal" label="Actions" size="small" />}`
      : '';

    // Compose AgreementTableView with props
    const viewProps: string[] = [];
    if (pageHeaderProp) viewProps.push(`        pageHeader={${pageHeaderProp}}`);
    if (bannerProp) viewProps.push(`        banner={${bannerProp}}`);
    if (filterBarProp) viewProps.push(`        filterBar={${filterBarProp}}`);

    const viewPropStr = viewProps.length > 0 ? `\n${viewProps.join('\n')}\n      ` : '';

    const parts: string[] = [];

    // Breadcrumb above AgreementTableView with matching padding
    if (hasBreadcrumb) {
      parts.push(`      <div style={{ padding: '12px 80px 0' }}>
        <Breadcrumb items={[{ label: 'Home', href: '#' }, { label: 'Agreements' }]} />
      </div>`);
    }

    // Tabs above AgreementTableView
    if (hasTabs) {
      parts.push(`      <div style={{ padding: '0 80px' }}>
        <Tabs
          items={[
            { id: 'all', label: 'All' },
            { id: 'action', label: 'Action Required' },
            { id: 'waiting', label: 'Waiting for Others' },
            { id: 'expiring', label: 'Expiring Soon' },
            { id: 'completed', label: 'Completed' },
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />
      </div>`);
    }

    parts.push(`      <AgreementTableView${viewPropStr}>
          <DataTable
            columns={columns}
            data={agreements}
            getRowKey={(row) => row.id}
            selectable${renderRowActions}
          />
      </AgreementTableView>`);

    contentBlock = parts.join('\n');

    // Override headerBlock — PageHeader is inside AgreementTableView
    headerBlock = '';

    // Override tabs — already handled above
    // We skip the generic tabs wrapper below by not setting hasTabs path
  } else if (hasTable) {
    // DataTable template with sample data (no AgreementTableView)
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
    stateBlock += "  const [modalOpen, setModalOpen] = useState(false);\n";

    modalBlock = `
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Example Modal"
      >
        <p>Modal content goes here.</p>
      </Modal>`;
  }

  // ── Tabs wrapper (if present and not already handled by AgreementTableView) ──
  if (hasTabs && !hasAgreementView) {
    imports.add('Tabs');
    stateBlock += "  const [activeTab, setActiveTab] = useState('tab1');\n";

    contentBlock = `      <Tabs
        items={[
          { id: 'tab1', label: 'Overview' },
          { id: 'tab2', label: 'Details' },
          { id: 'tab3', label: 'History' },
        ]}
        activeTab={activeTab}
        onChange={setActiveTab}
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
html, body, #root { height: 100%; }

html {
  -webkit-text-size-adjust: 100%;
  line-height: 1.5;
}

body {
  font-family: var(--ink-font-family, 'DS Indigo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
  color: var(--ink-font-default);
  background-color: var(--ink-bg-default);
  -webkit-font-smoothing: antialiased;
}

button, input, select, textarea { font: inherit; color: inherit; }
img, svg { display: block; max-width: 100%; }
`;

const INDEX_CSS_NO_FONTS = `@import './design-system/1-tokens/tokens.css';

*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { height: 100%; }

html {
  -webkit-text-size-adjust: 100%;
  line-height: 1.5;
}

body {
  font-family: var(--ink-font-family, 'DS Indigo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
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
  if (virtualExports && virtualExports.length > 0) {
    // Virtual children are the actual exports — the host (e.g. Typography) isn't exported directly
    return `export { ${virtualExports.sort().join(', ')} } from './${componentName}';\n`;
  }
  return `export { ${componentName} } from './${componentName}';\n`;
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

/**
 * Generate a self-contained shell script that sets up the project:
 * creates directories, downloads all source files, infrastructure, fonts,
 * writes boilerplate/barrels/generated files, and runs npm install.
 */
function generateSetupScript(
  projectName: string,
  boilerplate: Record<string, string>,
  barrels: Record<string, string>,
  generatedFiles: Record<string, string>,
  sourceFiles: { destPath: string; url: string }[],
  infrastructure: Record<string, { destPath: string; url: string }>,
  fontFiles?: { destPath: string; url: string }[],
): string {
  const lines: string[] = [
    '#!/bin/bash',
    'set -e',
    '',
    `echo "Setting up ${projectName}..."`,
    `mkdir -p "${projectName}"`,
    `cd "${projectName}"`,
    '',
  ];

  // Collect all directories needed
  const allDirs = new Set<string>();
  const addDir = (filePath: string) => {
    const dir = filePath.split('/').slice(0, -1).join('/');
    if (dir) allDirs.add(dir);
  };

  for (const path of Object.keys(boilerplate)) addDir(path);
  for (const path of Object.keys(barrels)) addDir(path);
  for (const path of Object.keys(generatedFiles)) addDir(path);
  for (const { destPath } of sourceFiles) addDir(destPath);
  for (const { destPath } of Object.values(infrastructure)) addDir(destPath);
  if (fontFiles) for (const { destPath } of fontFiles) addDir(destPath);

  // Create all directories
  const sortedDirs = [...allDirs].sort();
  lines.push('# Create directory structure');
  lines.push(`mkdir -p ${sortedDirs.map(d => `"${d}"`).join(' \\\n  ')}`);
  lines.push('');

  // Write boilerplate files (inline via heredoc)
  lines.push('# Write boilerplate files');
  for (const [path, content] of Object.entries(boilerplate)) {
    lines.push(`cat > "${path}" << 'PROTOLAB_EOF'`);
    lines.push(content.trimEnd());
    lines.push('PROTOLAB_EOF');
    lines.push('');
  }

  // Write barrel files
  lines.push('# Write barrel exports');
  for (const [path, content] of Object.entries(barrels)) {
    lines.push(`cat > "${path}" << 'PROTOLAB_EOF'`);
    lines.push(content.trimEnd());
    lines.push('PROTOLAB_EOF');
    lines.push('');
  }

  // Write generated files (e.g. trimmed iconPaths)
  if (Object.keys(generatedFiles).length > 0) {
    lines.push('# Write generated files');
    for (const [path, content] of Object.entries(generatedFiles)) {
      lines.push(`cat > "${path}" << 'PROTOLAB_EOF'`);
      lines.push(content.trimEnd());
      lines.push('PROTOLAB_EOF');
      lines.push('');
    }
  }

  // Download source files in parallel
  lines.push('# Download component source files');
  lines.push('echo "Downloading component sources..."');

  // Use curl with parallel flag — batch into groups of 50
  const batchSize = 50;
  for (let i = 0; i < sourceFiles.length; i += batchSize) {
    const batch = sourceFiles.slice(i, i + batchSize);
    const curlArgs = batch.map(f => `-o "${f.destPath}" "${f.url}"`).join(' \\\n  ');
    lines.push(`curl -s --parallel --create-dirs \\\n  ${curlArgs}`);
    lines.push('');
  }

  // Download infrastructure files
  lines.push('# Download infrastructure (tokens, utils, fonts.css)');
  const infraArgs = Object.values(infrastructure).map(f => `-o "${f.destPath}" "${f.url}"`).join(' \\\n  ');
  lines.push(`curl -s --parallel --create-dirs \\\n  ${infraArgs}`);
  lines.push('');

  // Download font files
  if (fontFiles && fontFiles.length > 0) {
    lines.push('# Download font files');
    lines.push('echo "Downloading fonts..."');
    const fontArgs = fontFiles.map(f => `-o "${f.destPath}" "${f.url}"`).join(' \\\n  ');
    lines.push(`curl -s --parallel --create-dirs \\\n  ${fontArgs}`);
    lines.push('');
  }

  // Install and run
  lines.push('# Install dependencies and start dev server');
  lines.push('echo "Installing dependencies..."');
  lines.push('npm install');
  lines.push('echo ""');
  lines.push(`echo "Done! Run: cd ${projectName} && npm run dev"`);

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

      // Auto-resolve virtual children: scan the full registry for any component
      // whose sourceComponent points to a resolved host (e.g. Typography hosts Heading+Text)
      for (const comp of registry.listComponents()) {
        if (comp.sourceComponent && allResolved.has(comp.sourceComponent) && !allResolved.has(comp.name)) {
          allResolved.set(comp.name, { name: comp.name, layer: comp.layer });
          const layerList = layerComponents.get(comp.layer) ?? [];
          layerList.push(comp.name);
          layerComponents.set(comp.layer, layerList);
          virtualToHost.set(comp.name, comp.sourceComponent);
        }
      }

      // Re-sort layer components after adding virtual children
      for (const [layer, names] of layerComponents) {
        layerComponents.set(layer, names.sort());
      }

      // Group virtual components by their host for barrel generation
      const hostVirtuals = new Map<string, string[]>();
      for (const [virtual, host] of virtualToHost) {
        const list = hostVirtuals.get(host) ?? [];
        list.push(virtual);
        hostVirtuals.set(host, list);
      }

      // Remove host-only names from layerComponents — hosts that only exist as
      // containers for virtual exports shouldn't appear in barrel exports themselves
      for (const [host, virtuals] of hostVirtuals) {
        if (virtuals.length > 0) {
          const hostMeta = allResolved.get(host);
          if (hostMeta) {
            const layerList = layerComponents.get(hostMeta.layer);
            if (layerList) {
              const idx = layerList.indexOf(host);
              if (idx !== -1) layerList.splice(idx, 1);
            }
          }
        }
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
        const availableIcons = allResolved.has('Icon') ? [...COMMON_ICONS].sort() : undefined;
        const result = {
          projectName,
          mode: 'inline' as const,
          totalFiles: Object.keys(files).length,
          componentCount,
          components: componentNames,
          ...(availableIcons && { availableIcons }),
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
        logo: { destPath: 'public/docusign-logo.svg', url: `${getSiteBaseUrl()}/docusign-logo.svg` },
      };
      if (includeFonts) {
        infrastructure.fonts = { destPath: 'src/styles/fonts.css', url: `${getSiteBaseUrl()}/fonts.css` };
      }

      const fontFileEntries = includeFonts
        ? FONT_FILES.map(f => ({
            destPath: `public/${f}`,
            url: `${getSiteBaseUrl()}/${f}`,
          }))
        : undefined;

      const setupScript = generateSetupScript(
        projectName,
        boilerplateFiles,
        barrelFiles,
        generatedFiles,
        sourceFiles,
        infrastructure,
        fontFileEntries,
      );

      const availableIcons = allResolved.has('Icon') ? [...COMMON_ICONS].sort() : undefined;
      const result = {
        projectName,
        mode: 'urls' as const,
        baseUrl,
        totalFiles: Object.keys(boilerplateFiles).length + Object.keys(barrelFiles).length + sourceFiles.length + Object.keys(generatedFiles).length + 2, // +2 for tokens + utils
        componentCount,
        components: componentNames,
        ...(availableIcons && { availableIcons }),
        ...(notFound.length > 0 && { notFound }),
        quickStart: `cd ${projectName} && npm install && npm run dev`,
        instructions: `Option A (recommended): Save setupScript to setup.sh and run "bash setup.sh". Option B: Write boilerplate/barrels/generatedFiles directly, fetch sourceFiles URLs to destPaths, fetch infrastructure URLs, ${includeFonts ? 'fetch fontFiles to public/fonts/, ' : ''}then run quickStart. Import from '@/design-system'.`,
        setupScript,
        boilerplate: boilerplateFiles,
        barrels: barrelFiles,
        ...(Object.keys(generatedFiles).length > 0 && { generatedFiles }),
        sourceFiles,
        infrastructure,
        ...(fontFileEntries && { fontFiles: fontFileEntries }),
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(result) }],
      };
    })
  );
}
