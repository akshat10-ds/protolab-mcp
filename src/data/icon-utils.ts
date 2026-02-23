/**
 * Shared icon utilities for parsing, scanning, and trimming icon data.
 * Used by both bundle-data.ts (build time) and scaffold-project.ts (runtime).
 */

export interface IconPathData {
  path: string;
  viewBox?: string;
}

/**
 * Parse iconPaths.ts content to extract individual icon definitions.
 * Handles the standard format: 'icon-name': { path: '...', viewBox?: '...' }
 */
export function parseIconPaths(content: string): Record<string, IconPathData> {
  const icons: Record<string, IconPathData> = {};

  const entryRegex = /'([^']+)':\s*\{([^}]+)\}/g;
  let match;

  while ((match = entryRegex.exec(content)) !== null) {
    const name = match[1];
    const body = match[2];

    const pathMatch = body.match(/path:\s*'([^']+)'/);
    if (!pathMatch) continue;

    const icon: IconPathData = { path: pathMatch[1] };

    const viewBoxMatch = body.match(/viewBox:\s*'([^']+)'/);
    if (viewBoxMatch) {
      icon.viewBox = viewBoxMatch[1];
    }

    icons[name] = icon;
  }

  return icons;
}

/**
 * Scan source file contents for Icon name references.
 * Matches: name="search", name={'check'}, name={"info"}
 */
export function scanUsedIcons(sourceContents: string[]): Set<string> {
  const usedIcons = new Set<string>();
  const patterns = [
    /\bname=["']([a-z][a-z0-9-]*)["']/g,
    /\bname=\{["']([a-z][a-z0-9-]*)["']\}/g,
  ];

  for (const content of sourceContents) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        usedIcons.add(match[1]);
      }
      pattern.lastIndex = 0;
    }
  }

  return usedIcons;
}

/** Common icons always included in scaffolded projects as a safety net */
export const COMMON_ICONS = new Set([
  'check', 'close', 'error', 'warning', 'info',
  'chevron-down', 'chevron-up', 'chevron-left', 'chevron-right',
  'search', 'menu', 'more-horizontal', 'add', 'edit', 'delete',
  'arrow-left', 'arrow-right', 'arrow-down', 'arrow-up',
]);

/**
 * Generate a trimmed iconPaths.ts containing only the specified icons.
 */
export function generateTrimmedIconPaths(
  usedIcons: Set<string>,
  allIcons: Record<string, IconPathData>,
  sourceBaseUrl: string
): string {
  const included = [...usedIcons].filter(name => allIcons[name]).sort();

  const lines: string[] = [
    '/**',
    ` * Icon paths — project-specific subset (${included.length} of ${Object.keys(allIcons).length} icons)`,
    ` * Full icon library: ${sourceBaseUrl}/3-primitives/Icon/iconPaths.ts`,
    ` * Individual icons: ${sourceBaseUrl}/3-primitives/Icon/icons/{name}.json`,
    ' */',
    '',
    'export interface IconPath {',
    '  path: string;',
    '  viewBox?: string;',
    '}',
    '',
    'export const iconPaths: Record<string, IconPath> = {',
  ];

  for (const name of included) {
    const icon = allIcons[name];
    if (icon.viewBox) {
      lines.push(`  '${name}': { path: '${icon.path}', viewBox: '${icon.viewBox}' },`);
    } else {
      lines.push(`  '${name}': { path: '${icon.path}' },`);
    }
  }

  lines.push('};');
  return lines.join('\n') + '\n';
}
