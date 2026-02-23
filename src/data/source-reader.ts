export interface SourceFile {
  path: string;
  content: string;
}

export interface BundleData {
  sources: Record<string, SourceFile[]>;
  tokens: SourceFile;
  utility: SourceFile;
}

/** File extensions to include as component source */
const INCLUDE_EXTS = new Set(['.tsx', '.ts', '.css']);

/** Files/patterns to exclude */
const EXCLUDE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.stories\./,
  /README\.md/,
  /\.d\.ts$/,
];

/** Token category regex patterns — immutable, defined once */
const CATEGORY_PATTERNS: Record<string, RegExp[]> = {
  color: [/--ink-(bg|font|border|brand|button|badge|status|alert|nav|chip|input|select|tab|link|card|skeleton|progress|slider|divider|tooltip|callout|banner|stepper|avatar|switch|checkbox|radio|file|filter|popover|drawer|modal)/, /color/i],
  spacing: [/--ink-spacing/, /--ink-gap/],
  typography: [/--ink-font-size/, /--ink-font-weight/, /--ink-line-height/, /--ink-font-family/],
  radius: [/--ink-radius/],
  shadow: [/--ink-shadow/, /--ink-elevation/],
  size: [/--ink-size/, /--ink-height/, /--ink-width/],
};

export class SourceReader {
  private sources: Record<string, SourceFile[]>;
  private tokensFile: SourceFile;
  private utilityFile: SourceFile;
  private categoryCache = new Map<string, string>();
  private tokenLines: string[] | null = null;

  constructor(bundle: BundleData) {
    this.sources = bundle.sources;
    this.tokensFile = bundle.tokens;
    this.utilityFile = bundle.utility;
  }

  /**
   * Get all source files for a component
   */
  getComponentFiles(name: string, layer: number): SourceFile[] {
    const key = `${name}:${layer}`;
    return this.sources[key] ?? [];
  }

  /**
   * Get design tokens CSS
   */
  getTokens(): SourceFile {
    return this.tokensFile;
  }

  private getTokenLines(): string[] {
    if (!this.tokenLines) {
      this.tokenLines = this.getTokens().content.split('\n');
    }
    return this.tokenLines;
  }

  /**
   * Get tokens filtered by category (color, spacing, typography, etc.)
   */
  getTokensByCategory(category: string): string {
    const key = category.toLowerCase();

    const cached = this.categoryCache.get(key);
    if (cached !== undefined) return cached;

    const patterns = CATEGORY_PATTERNS[key];
    if (!patterns) {
      return `/* Unknown category: "${category}". Available: ${Object.keys(CATEGORY_PATTERNS).join(', ')} */`;
    }

    const lines = this.getTokenLines();
    const filtered: string[] = [];
    let insideRoot = false;

    for (const line of lines) {
      if (line.includes(':root')) {
        insideRoot = true;
        filtered.push(':root {');
        continue;
      }
      if (insideRoot && line.trim() === '}') {
        insideRoot = false;
        filtered.push('}');
        continue;
      }
      if (insideRoot && patterns.some(p => p.test(line))) {
        filtered.push(line);
      }
    }

    const result = filtered.join('\n');
    this.categoryCache.set(key, result);
    return result;
  }

  /**
   * Get the cn() utility
   */
  getUtility(): SourceFile {
    return this.utilityFile;
  }
}
