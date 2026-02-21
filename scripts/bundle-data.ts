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

  // Tokens
  const tokensPath = join(PROTOLAB_ROOT, 'src/design-system/1-tokens/tokens.css');
  const tokens: SourceFile = {
    path: 'design-system/1-tokens/tokens.css',
    content: readFileSync(tokensPath, 'utf-8'),
  };
  console.log(`Tokens: ${tokens.content.length} bytes`);

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

  return { registry, sources, tokens, utility, propDetails };
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
}
