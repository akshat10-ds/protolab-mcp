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

export class SourceReader {
  private sources: Record<string, SourceFile[]>;
  private tokensFile: SourceFile;
  private utilityFile: SourceFile;

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

  /**
   * Get tokens filtered by category (color, spacing, typography, etc.)
   */
  getTokensByCategory(category: string): string {
    const tokens = this.getTokens().content;
    const lines = tokens.split('\n');
    const filtered: string[] = [];
    let insideRoot = false;

    const categoryPatterns: Record<string, RegExp[]> = {
      color: [/--ink-(bg|font|border|brand|button|badge|status|alert|nav|chip|input|select|tab|link|card|skeleton|progress|slider|divider|tooltip|callout|banner|stepper|avatar|switch|checkbox|radio|file|filter|popover|drawer|modal)/, /color/i],
      spacing: [/--ink-spacing/, /--ink-gap/],
      typography: [/--ink-font-size/, /--ink-font-weight/, /--ink-line-height/, /--ink-font-family/],
      radius: [/--ink-radius/],
      shadow: [/--ink-shadow/, /--ink-elevation/],
      size: [/--ink-size/, /--ink-height/, /--ink-width/],
    };

    const patterns = categoryPatterns[category.toLowerCase()];
    if (!patterns) {
      return `/* Unknown category: "${category}". Available: ${Object.keys(categoryPatterns).join(', ')} */`;
    }

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

    return filtered.join('\n');
  }

  /**
   * Get the cn() utility
   */
  getUtility(): SourceFile {
    return this.utilityFile;
  }
}
