/**
 * Bundle script — reads all design system data from protoLab and produces
 * data/bundle.json for the remote MCP server.
 *
 * Usage: npm run bundle
 * Env:   PROTOLAB_ROOT (default: ../protoLab)
 */

import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';

const PROTOLAB_ROOT = resolve(process.env.PROTOLAB_ROOT ?? join(__dirname, '../../protoLab'));

console.log(`Bundling from: ${PROTOLAB_ROOT}`);

// ── 1. Registry ─────────────────────────────────────────────────────
const registryPath = join(PROTOLAB_ROOT, 'component-registry.json');
const registry = JSON.parse(readFileSync(registryPath, 'utf-8'));
console.log(`Registry: ${registry.totalComponents} components`);

// ── 2. Source files ──────────────────────────────────────────────────

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

interface SourceFile {
  path: string;
  content: string;
}

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

// Build sources map keyed as "ComponentName:layer"
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

// ── 3. Tokens ────────────────────────────────────────────────────────
const tokensPath = join(PROTOLAB_ROOT, 'src/design-system/1-tokens/tokens.css');
const tokens: SourceFile = {
  path: 'design-system/1-tokens/tokens.css',
  content: readFileSync(tokensPath, 'utf-8'),
};
console.log(`Tokens: ${tokens.content.length} bytes`);

// ── 4. Utility ───────────────────────────────────────────────────────
const utilPath = join(PROTOLAB_ROOT, 'src/lib/utils.ts');
const utility: SourceFile = {
  path: 'lib/utils.ts',
  content: readFileSync(utilPath, 'utf-8'),
};
console.log(`Utility: ${utility.content.length} bytes`);

// ── 5. Write bundle ──────────────────────────────────────────────────
const bundle = {
  registry,
  sources,
  tokens,
  utility,
};

const outDir = join(__dirname, '../data');
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const outPath = join(outDir, 'bundle.json');
const json = JSON.stringify(bundle);
writeFileSync(outPath, json, 'utf-8');

const sizeMB = (Buffer.byteLength(json) / (1024 * 1024)).toFixed(2);
console.log(`\nBundle written to: ${outPath}`);
console.log(`Size: ${sizeMB} MB`);

// ── 6. Write static source files to public/source/ ──────────────────
// Next.js serves public/ as static files. These get CDN-cached on Vercel.
// Tool responses return URLs to these files instead of inlining content.

const sourceDir = join(__dirname, '../public/source');

// Clean previous output
if (existsSync(sourceDir)) {
  rmSync(sourceDir, { recursive: true });
}

let staticFileCount = 0;

// Write tokens.css at root
const tokensOutPath = join(sourceDir, 'tokens.css');
mkdirSync(join(sourceDir), { recursive: true });
writeFileSync(tokensOutPath, tokens.content, 'utf-8');
staticFileCount++;

// Write utils.ts at root
const utilOutPath = join(sourceDir, 'utils.ts');
writeFileSync(utilOutPath, utility.content, 'utf-8');
staticFileCount++;

// Write component source files: design-system/{layer}/{Component}/file → {layer}/{Component}/file
for (const files of Object.values(sources)) {
  for (const file of files) {
    // Strip "design-system/" prefix for shorter static paths
    const staticPath = file.path.replace(/^design-system\//, '');
    const fullOutPath = join(sourceDir, staticPath);
    const dir = join(fullOutPath, '..');
    mkdirSync(dir, { recursive: true });
    writeFileSync(fullOutPath, file.content, 'utf-8');
    staticFileCount++;
  }
}

console.log(`\nStatic source files: ${staticFileCount} files written to public/source/`);
