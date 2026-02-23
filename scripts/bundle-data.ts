/**
 * Bundle script — two modes:
 *
 * 1. Full bundle (local dev): reads protoLab source → writes data/bundle.json + public/source/
 * 2. Static-only (Vercel CI): reads existing data/bundle.json → writes public/source/
 *
 * Mode is auto-detected: if PROTOLAB_ROOT exists, full bundle; otherwise static-only.
 *
 * Usage: npm run bundle
 * Env:   PROTOLAB_ROOT (default: ../protoLab)
 */

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, resolve, dirname } from 'node:path';
import { extractAllProps, type ComponentPropDetails } from './extract-props';
import { parseIconPaths } from '../src/data/icon-utils';

interface SourceFile {
  path: string;
  content: string;
}

interface BundleData {
  registry: Record<string, unknown>;
  sources: Record<string, SourceFile[]>;
  tokens: SourceFile;
  utility: SourceFile;
  propDetails: Record<string, ComponentPropDetails>;
}

// ── Detect mode ──────────────────────────────────────────────────────
const PROTOLAB_ROOT = resolve(process.env.PROTOLAB_ROOT ?? join(__dirname, '../../protoLab'));
const bundlePath = join(__dirname, '../data/bundle.json');
const hasProtoLabSource = existsSync(join(PROTOLAB_ROOT, 'component-registry.json'));

let bundle: BundleData;

if (hasProtoLabSource) {
  // ── Full bundle: read from protoLab source ─────────────────────────
  console.log(`Full bundle mode — reading from: ${PROTOLAB_ROOT}`);
  bundle = buildBundleFromSource();

  const outDir = join(__dirname, '../data');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

  const json = JSON.stringify(bundle);
  writeFileSync(bundlePath, json, 'utf-8');

  const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
  console.log(`Bundle written to: ${bundlePath} (${sizeMB} MB)`);
} else {
  // ── Static-only: read from existing bundle.json ────────────────────
  console.log(`Static-only mode — protoLab source not found at ${PROTOLAB_ROOT}`);

  if (!existsSync(bundlePath)) {
    console.error(`ERROR: data/bundle.json not found. Run locally with protoLab source first.`);
    process.exit(1);
  }

  console.log(`Reading existing bundle from: ${bundlePath}`);
  bundle = JSON.parse(readFileSync(bundlePath, 'utf-8'));
}

// ── Write static source files to public/source/ ──────────────────────
writeStaticFiles(bundle);

// ======================================================================
// Implementation
// ======================================================================

function buildBundleFromSource(): BundleData {
  const LAYER_DIR_MAP: Record<number, string> = {
    2: '2-utilities',
    3: '3-primitives',
    4: '4-composites',
    5: '5-patterns',
    6: '6-layouts',
  };

  const INCLUDE_EXTS = new Set(['.tsx', '.ts', '.css']);
  const EXCLUDE_PATTERNS = [
    /\.test\./,
    /\.spec\./,
    /\.stories\./,
    /Demo\./,
    /README\.md/,
    /\.d\.ts$/,
  ];

  function readDirectory(dirPath: string, relativeTo: string): SourceFile[] {
    const files: SourceFile[] = [];
    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) return files;

    const entries = readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);

      if (entry.isDirectory()) {
        files.push(...readDirectory(fullPath, `${relativeTo}/${entry.name}`));
        continue;
      }

      if (!entry.isFile()) continue;
      const ext = extname(entry.name);
      if (!INCLUDE_EXTS.has(ext)) continue;
      if (EXCLUDE_PATTERNS.some(p => p.test(entry.name))) continue;

      files.push({
        path: `${relativeTo}/${entry.name}`,
        content: readFileSync(fullPath, 'utf-8'),
      });
    }
    return files;
  }

  // Registry
  const registryPath = join(PROTOLAB_ROOT, 'component-registry.json');
  const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
  console.log(`Registry: ${registry.totalComponents} components`);

  // Enrich metadata with curated aliases and useCases not present in upstream
  enrichComponentMetadata(registry);
  console.log(`Metadata enrichment: applied curated aliases/useCases`);

  // Source files
  const sources: Record<string, SourceFile[]> = {};
  let totalFiles = 0;

  for (const [name, meta] of Object.entries(registry.components) as [string, { layer: number }][]) {
    const layerDir = LAYER_DIR_MAP[meta.layer];
    if (!layerDir) continue;

    const componentDir = join(PROTOLAB_ROOT, 'src/design-system', layerDir, name);
    const files = readDirectory(componentDir, `design-system/${layerDir}/${name}`);

    if (files.length > 0) {
      sources[`${name}:${meta.layer}`] = files;
      totalFiles += files.length;
    }
  }

  console.log(`Sources: ${totalFiles} files from ${Object.keys(sources).length} components`);

  // Detect virtual components (e.g., Heading, Text → Typography)
  detectVirtualComponents(registry, sources, LAYER_DIR_MAP);

  // Scan source imports to augment dependency lists
  scanImportDependencies(registry, sources, LAYER_DIR_MAP);

  // Tokens
  const tokensPath = join(PROTOLAB_ROOT, 'src/design-system/1-tokens/tokens.css');
  const tokens: SourceFile = {
    path: 'design-system/1-tokens/tokens.css',
    content: readFileSync(tokensPath, 'utf-8'),
  };
  console.log(`Tokens: ${tokens.content.length} bytes`);

  // Validate spacing token monotonicity
  const spacingPattern = /--ink-spacing-(\d+):\s*(\d+)px/g;
  const spacingTokens: { scale: number; px: number }[] = [];
  for (const match of tokens.content.matchAll(spacingPattern)) {
    spacingTokens.push({ scale: parseInt(match[1]), px: parseInt(match[2]) });
  }
  spacingTokens.sort((a, b) => a.scale - b.scale);
  for (let i = 1; i < spacingTokens.length; i++) {
    if (spacingTokens[i].px < spacingTokens[i - 1].px) {
      console.warn(`  Warning: Non-monotonic spacing tokens: --ink-spacing-${spacingTokens[i - 1].scale} (${spacingTokens[i - 1].px}px) > --ink-spacing-${spacingTokens[i].scale} (${spacingTokens[i].px}px)`);
    }
  }

  // Utility
  const utilPath = join(PROTOLAB_ROOT, 'src/lib/utils.ts');
  const utility: SourceFile = {
    path: 'lib/utils.ts',
    content: readFileSync(utilPath, 'utf-8'),
  };
  console.log(`Utility: ${utility.content.length} bytes`);

  // Prop details — extract structured prop metadata from TypeScript source
  const propDetails = extractAllProps(sources);
  const extracted = Object.keys(propDetails).length;
  const totalProps = Object.values(propDetails).reduce((s, d) => s + d.props.length, 0);
  console.log(`Prop details: ${totalProps} props from ${extracted} components`);

  // Reconcile meta.props from propDetails — derive from source truth
  let reconciledCount = 0;
  for (const [name, details] of Object.entries(propDetails)) {
    const meta = registry.components[name] as { props: string[] } | undefined;
    if (!meta) continue;
    const required = details.props.filter(p => p.required).map(p => p.name);
    const optional = details.props.filter(p => !p.required).map(p => p.name);
    const derived = [...required, ...optional];
    const before = JSON.stringify(meta.props);
    const after = JSON.stringify(derived);
    if (before !== after) {
      meta.props = derived;
      reconciledCount++;
    }
  }
  console.log(`Props reconciliation: updated ${reconciledCount} components`);

  // Validate examples against propDetails
  let exampleWarnings = 0;
  for (const [name, meta] of Object.entries(registry.components) as [string, { propDetails?: { props: { name: string }[] }; examples?: string[] }][]) {
    const details = propDetails[name];
    if (!details?.props || !meta.examples?.length) continue;
    const validProps = new Set(details.props.map((p: { name: string }) => p.name));
    const exampleText = meta.examples.join('\n');
    // Match prop-like patterns: word={ or word=" or word=' or word=<
    const usedProps = [...exampleText.matchAll(/\b([a-z]\w*)(?==[\{\"\'<])/g)].map(m => m[1]);
    for (const prop of usedProps) {
      if (!validProps.has(prop) && !['className', 'style', 'key', 'ref', 'children'].includes(prop)) {
        console.warn(`  Warning: ${name} example uses unknown prop "${prop}" (valid: ${[...validProps].join(', ')})`);
        exampleWarnings++;
      }
    }
  }
  if (exampleWarnings > 0) {
    console.log(`Example validation: ${exampleWarnings} warnings`);
  } else {
    console.log(`Example validation: all examples use valid props`);
  }

  return { registry, sources, tokens, utility, propDetails };
}

/**
 * Enrich component metadata with curated aliases and useCases
 * that the upstream source doesn't include but improve search relevance.
 */
function enrichComponentMetadata(registry: { components: Record<string, { aliases?: string[]; useCases?: string[] }> }) {
  const ENRICHMENTS: Record<string, { aliases?: string[]; useCases?: string[] }> = {
    Drawer: {
      aliases: ['overlay panel', 'bottom sheet', 'dialog panel'],
      useCases: ['form-overlay', 'detail-overlay', 'mobile-dialog'],
    },
    ComboBox: {
      aliases: ['form select', 'validated dropdown', 'searchable input'],
      useCases: ['form-field', 'validated-selection', 'search-filter'],
    },
    DataTable: {
      useCases: ['column-visibility', 'row-selection', 'inline-editing'],
    },
  };

  for (const [name, additions] of Object.entries(ENRICHMENTS)) {
    const meta = registry.components[name];
    if (!meta) continue;
    if (additions.aliases) {
      meta.aliases = [...(meta.aliases || []), ...additions.aliases];
    }
    if (additions.useCases) {
      meta.useCases = [...(meta.useCases || []), ...additions.useCases];
    }
  }
}

/**
 * Detect virtual components — registry entries with no source directory.
 * For each, find a sibling component in the same layer whose index.ts re-exports it,
 * then copy the sibling's source files and set `sourceComponent` on the registry entry.
 */
function detectVirtualComponents(
  registry: { components: Record<string, { layer: number; sourceComponent?: string }> },
  sources: Record<string, SourceFile[]>,
  layerDirMap: Record<number, string>
): void {
  const componentEntries = Object.entries(registry.components);

  for (const [name, meta] of componentEntries) {
    const key = `${name}:${meta.layer}`;
    if (sources[key] && sources[key].length > 0) continue; // has own sources

    const layerDir = layerDirMap[meta.layer];
    if (!layerDir) continue;

    // Scan sibling directories in the same layer for an index.ts that exports this name
    const layerPath = join(PROTOLAB_ROOT, 'src/design-system', layerDir);
    if (!existsSync(layerPath)) continue;

    const siblings = readdirSync(layerPath, { withFileTypes: true })
      .filter(e => e.isDirectory() && e.name !== name);

    for (const sibling of siblings) {
      const indexPath = join(layerPath, sibling.name, 'index.ts');
      if (!existsSync(indexPath)) continue;

      const indexContent = readFileSync(indexPath, 'utf-8');
      // Check if this index.ts exports the virtual component name
      // Matches: export { Heading } or export { Heading, Text } from './Typography'
      const exportRegex = new RegExp(`\\bexport\\s+\\{[^}]*\\b${name}\\b[^}]*\\}`);
      if (exportRegex.test(indexContent)) {
        const hostKey = `${sibling.name}:${meta.layer}`;
        const hostFiles = sources[hostKey];
        if (hostFiles && hostFiles.length > 0) {
          // Copy host's source files to virtual component key
          sources[key] = hostFiles.map(f => ({
            path: f.path.replace(
              `design-system/${layerDir}/${sibling.name}`,
              `design-system/${layerDir}/${sibling.name}` // keep original paths — they point to the host
            ),
            content: f.content,
          }));
          meta.sourceComponent = sibling.name;
          console.log(`Virtual component: ${name} → source from ${sibling.name}`);
        }
        break;
      }
    }
  }
}

/**
 * Scan source imports to discover actual dependencies, then merge them
 * into the registry's dependency arrays (union of declared + detected).
 * Also replaces virtual component deps with their sourceComponent host.
 */
function scanImportDependencies(
  registry: { components: Record<string, { layer: number; dependencies: string[]; sourceComponent?: string }> },
  sources: Record<string, SourceFile[]>,
  layerDirMap: Record<number, string>
): void {
  const allComponentNames = new Set(Object.keys(registry.components));
  // Build a map of layerDir name → layer number for resolving layer barrel imports
  const layerDirToLayer: Record<string, number> = {};
  for (const [layer, dir] of Object.entries(layerDirMap)) {
    layerDirToLayer[dir] = Number(layer);
  }
  // Build set of virtual component names → host names for replacement
  const virtualToHost = new Map<string, string>();
  for (const [name, meta] of Object.entries(registry.components)) {
    if (meta.sourceComponent) {
      virtualToHost.set(name, meta.sourceComponent);
    }
  }

  let augmentedCount = 0;
  const augmentedDetails: string[] = [];

  for (const [name, meta] of Object.entries(registry.components)) {
    const key = `${name}:${meta.layer}`;
    const files = sources[key];
    if (!files || files.length === 0) continue;

    const detectedDeps = new Set<string>();

    for (const file of files) {
      const lines = file.content.split('\n');
      for (const line of lines) {
        // Skip type-only imports (no runtime dependency)
        if (/^\s*import\s+type\b/.test(line)) continue;

        // Pattern 1: Direct component import — from '../../{layerDir}/{ComponentName}'
        const directMatch = line.match(/from\s+['"]\.\.\/(?:\.\.\/)?(\d-[^/]+)\/([A-Z][^'"/]+)['"]/);
        if (directMatch) {
          const importedName = directMatch[2];
          if (allComponentNames.has(importedName) && importedName !== name) {
            detectedDeps.add(importedName);
          }
          continue;
        }

        // Pattern 2: Same-layer sibling import — from '../{ComponentName}'
        const siblingMatch = line.match(/from\s+['"]\.\.\/([A-Z][^'"/]+)['"]/);
        if (siblingMatch) {
          const importedName = siblingMatch[1];
          if (allComponentNames.has(importedName) && importedName !== name) {
            detectedDeps.add(importedName);
          }
          continue;
        }

        // Pattern 3: Layer barrel import — import { X, Y } from '../../3-primitives'
        const barrelMatch = line.match(/^import\s+\{([^}]+)\}\s+from\s+['"]\.\.\/(?:\.\.\/)?(\d-[^'"]+)['"]/);
        if (barrelMatch) {
          const names = barrelMatch[1].split(',')
            .map(s => s.trim())
            .filter(s => s && !s.startsWith('type '));
          for (const importedName of names) {
            if (allComponentNames.has(importedName) && importedName !== name) {
              detectedDeps.add(importedName);
            }
          }
        }
      }
    }

    // Merge detected deps into declared deps
    const declaredSet = new Set(meta.dependencies);
    const newDeps: string[] = [];
    for (const dep of detectedDeps) {
      if (!declaredSet.has(dep)) {
        newDeps.push(dep);
      }
    }

    if (newDeps.length > 0) {
      meta.dependencies = [...new Set([...meta.dependencies, ...newDeps])];
      augmentedCount++;
      augmentedDetails.push(`  ${name}: +${newDeps.join(', ')}`);
    }

    // Replace virtual component deps with their host
    meta.dependencies = meta.dependencies.map(dep => virtualToHost.get(dep) ?? dep);
    // Deduplicate after replacement (host might already be in deps)
    meta.dependencies = [...new Set(meta.dependencies)];
  }

  if (augmentedCount > 0) {
    console.log(`Dependency scan: augmented ${augmentedCount} components`);
    for (const detail of augmentedDetails) {
      console.log(detail);
    }
  } else {
    console.log(`Dependency scan: all components up to date`);
  }
}

function writeStaticFiles(data: BundleData): void {
  const sourceDir = join(__dirname, '../public/source');

  // Clean previous output
  if (existsSync(sourceDir)) {
    rmSync(sourceDir, { recursive: true });
  }

  mkdirSync(sourceDir, { recursive: true });
  let staticFileCount = 0;

  // Write tokens.css at root
  writeFileSync(join(sourceDir, 'tokens.css'), data.tokens.content, 'utf-8');
  staticFileCount++;

  // Write utils.ts at root
  writeFileSync(join(sourceDir, 'utils.ts'), data.utility.content, 'utf-8');
  staticFileCount++;

  // Write component source files: design-system/{layer}/{Component}/file → {layer}/{Component}/file
  for (const files of Object.values(data.sources)) {
    for (const file of files) {
      const staticPath = file.path.replace(/^design-system\//, '');
      const fullOutPath = join(sourceDir, staticPath);
      mkdirSync(dirname(fullOutPath), { recursive: true });
      writeFileSync(fullOutPath, file.content, 'utf-8');
      staticFileCount++;
    }
  }

  console.log(`\nStatic source files: ${staticFileCount} files written to public/source/`);

  // ── Split iconPaths.ts into individual icon files ─────────────────
  splitIconFiles(data, sourceDir);
}

/**
 * Parse iconPaths.ts and write individual icon JSON files + manifest.
 * Enables per-icon fetching: /source/3-primitives/Icon/icons/{name}.json
 */
function splitIconFiles(data: BundleData, sourceDir: string): void {
  const iconFiles = data.sources['Icon:3'];
  if (!iconFiles) return;

  const iconPathsFile = iconFiles.find(f => f.path.endsWith('iconPaths.ts'));
  if (!iconPathsFile) return;

  const icons = parseIconPaths(iconPathsFile.content);
  const iconNames = Object.keys(icons).sort();
  if (iconNames.length === 0) return;

  const iconsDir = join(sourceDir, '3-primitives/Icon/icons');
  mkdirSync(iconsDir, { recursive: true });

  // Write individual icon files
  for (const name of iconNames) {
    writeFileSync(
      join(iconsDir, `${name}.json`),
      JSON.stringify(icons[name]),
      'utf-8'
    );
  }

  // Write manifest (sorted list of available icon names)
  writeFileSync(
    join(iconsDir, 'manifest.json'),
    JSON.stringify(iconNames),
    'utf-8'
  );

  console.log(`Icons: split ${iconNames.length} icons into individual files`);
}
