export interface PropDetail {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: string;
  values?: string[];
}

export interface PropTypeAlias {
  name: string;
  type: 'union' | 'other';
  values?: string[];
  raw?: string;
}

export interface ComponentPropDetails {
  types: PropTypeAlias[];
  props: PropDetail[];
  extends?: string;
}

export interface SlotPropDef {
  type: string;
  description: string;
}

export interface CompositionRule {
  childrenType: string;
  childrenDescription: string;
  slotProps: Record<string, SlotPropDef>;
  typicalParents: string[];
  typicalChildren: string[];
}

export interface ComponentMeta {
  name: string;
  layer: number;
  type: string;
  description: string;
  props: string[];
  imports: string;
  useCases: string[];
  dependencies: string[];
  examples: string[];
  variants?: string[];
  types?: string[];
  sizes?: string[];
  statuses?: string[];
  iconList?: string[];
  aliases?: string[];
  propDetails?: ComponentPropDetails;
  composition?: CompositionRule;
  gotchas?: string[];
  sourceComponent?: string;
}

interface RegistryData {
  version: string;
  totalComponents: number;
  lastUpdated: string;
  components: Record<string, ComponentMeta>;
}

const LAYER_NAMES: Record<number, string> = {
  1: 'tokens',
  2: 'utilities',
  3: 'primitives',
  4: 'composites',
  5: 'patterns',
  6: 'layouts',
};

interface SearchIndexEntry {
  meta: ComponentMeta;
  nameLower: string;
  nameTokensLower: string[];  // camelCase split: "DataTable" → ["data", "table"]
  typeLower: string;
  descriptionLower: string;
  useCasesLower: string[];
  aliasesLower: string[];
  propsLower: string[];
  propDescriptionsLower: string[];
}

/** Split a PascalCase/camelCase name into lowercase tokens: "DataTable" → ["data", "table"] */
function splitCamelCase(name: string): string[] {
  return name.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().split(/\s+/);
}

/** Common English stop words filtered from multi-term queries to reduce noise */
export const STOP_WORDS = new Set([
  'a', 'an', 'the', 'with', 'for', 'and', 'or', 'in', 'on', 'to', 'of', 'is',
]);

/** Check if `term` appears at a word boundary in `text` (prevents "table" matching "selecTABLE") */
function wordBoundaryMatch(text: string, term: string): boolean {
  const idx = text.indexOf(term);
  if (idx === -1) return false;
  const before = idx === 0 || !/[a-z0-9]/i.test(text[idx - 1]);
  const after = idx + term.length >= text.length || !/[a-z0-9]/i.test(text[idx + term.length]);
  return before && after;
}

/** Levenshtein edit distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export class Registry {
  private components: Map<string, ComponentMeta> = new Map();
  private lowercaseMap: Map<string, ComponentMeta> = new Map();
  private searchIndex: Map<string, SearchIndexEntry> = new Map();
  private version: string = '';
  private totalComponents: number = 0;

  // Cached derived data (immutable after construction)
  private allNamesSet: Set<string> | null = null;
  private listAllCache: ComponentMeta[] | null = null;
  private listByLayerCache: Map<number, ComponentMeta[]> = new Map();
  private statsCache: { version: string; totalComponents: number; byLayer: Record<string, number> } | null = null;

  constructor(data: RegistryData, propDetails?: Record<string, ComponentPropDetails>, gotchas?: Record<string, string[]>) {
    this.version = data.version;
    this.totalComponents = data.totalComponents;
    for (const [name, meta] of Object.entries(data.components)) {
      // Merge prop details from extraction if available
      if (propDetails?.[name]) {
        meta.propDetails = propDetails[name];
      }
      // Merge gotchas from curated data
      if (gotchas?.[name]) {
        meta.gotchas = gotchas[name];
      }
      this.components.set(name, meta);
      this.lowercaseMap.set(name.toLowerCase(), meta);
      this.searchIndex.set(name, {
        meta,
        nameLower: name.toLowerCase(),
        nameTokensLower: splitCamelCase(name),
        typeLower: meta.type.toLowerCase(),
        descriptionLower: meta.description.toLowerCase(),
        useCasesLower: meta.useCases.map(uc => uc.toLowerCase()),
        aliasesLower: (meta.aliases ?? []).map(a => a.toLowerCase()),
        propsLower: meta.props.map(p => p.toLowerCase()),
        propDescriptionsLower: (meta.propDetails?.props ?? [])
          .map(p => p.description?.toLowerCase() ?? '')
          .filter(d => d.length > 0),
      });
    }
  }

  getComponent(name: string): ComponentMeta | undefined {
    return this.components.get(name) ?? this.lowercaseMap.get(name.toLowerCase());
  }

  listComponents(layer?: number): ComponentMeta[] {
    if (layer !== undefined) {
      let cached = this.listByLayerCache.get(layer);
      if (!cached) {
        cached = Array.from(this.components.values()).filter(c => c.layer === layer);
        this.listByLayerCache.set(layer, cached);
      }
      return cached;
    }
    if (!this.listAllCache) {
      this.listAllCache = Array.from(this.components.values());
    }
    return this.listAllCache;
  }

  searchComponentsWithScores(query: string): Array<{ meta: ComponentMeta; score: number }> {
    const q = query.toLowerCase();
    let terms = q.split(/\s+/).filter(t => !STOP_WORDS.has(t));
    if (terms.length === 0) terms = q.split(/\s+/); // fallback if everything was a stop word
    const scored: { meta: ComponentMeta; score: number }[] = [];

    for (const entry of this.searchIndex.values()) {
      let score = 0;
      let termsHit = 0;

      // Exact name match bonus (case-insensitive)
      if (entry.nameLower === q) {
        score += 50;
      }

      for (const term of terms) {
        let termHit = false;

        // Name match — word-boundary OR camelCase token match (highest weight)
        if (wordBoundaryMatch(entry.nameLower, term)) {
          score += 10;
          termHit = true;
          if (entry.nameLower === term) score += 5; // exact name match bonus
        } else if (entry.nameTokensLower.some(t => t === term)) {
          score += 10; // exact token match (e.g., "table" in "DataTable")
          termHit = true;
        } else if (entry.nameTokensLower.some(t => t.includes(term))) {
          score += 6; // partial token match
          termHit = true;
        }

        // Type match — word-boundary
        if (wordBoundaryMatch(entry.typeLower, term)) {
          score += 3;
          termHit = true;
        }

        // Description match — substring (natural language benefits from loose matching)
        if (entry.descriptionLower.includes(term)) {
          score += 5;
          termHit = true;
        }

        // Use case match — substring (only count first match per term)
        for (const uc of entry.useCasesLower) {
          if (uc.includes(term)) {
            score += 7;
            termHit = true;
            break;
          }
        }

        // Alias match — word-boundary (only count first match per term)
        for (const alias of entry.aliasesLower) {
          if (wordBoundaryMatch(alias, term)) {
            score += 8;
            termHit = true;
            if (alias === q) score += 5; // exact alias match bonus
            break;
          }
        }

        // Prop match — word-boundary
        for (const prop of entry.propsLower) {
          if (wordBoundaryMatch(prop, term)) {
            score += 2;
            termHit = true;
          }
        }

        // Prop description match — substring (natural language)
        for (const desc of entry.propDescriptionsLower) {
          if (desc.includes(term)) {
            score += 3;
            termHit = true;
            break; // one match per term is enough
          }
        }

        if (termHit) termsHit++;
      }

      // Boost when the full component name appears as a word in the query
      // e.g. "save button" should strongly prefer Button over ComboButton
      if (wordBoundaryMatch(q, entry.nameLower)) {
        score += 15;
      }

      // Multi-term relevance boost: bonus when ALL search terms match
      if (terms.length > 1 && termsHit === terms.length) {
        score += terms.length * 3;
      }

      // Multi-term alias phrase boost: when consecutive query terms form an alias
      if (terms.length > 1) {
        const termsStr = terms.join(' ');
        for (const alias of entry.aliasesLower) {
          if (termsStr.includes(alias) || alias.includes(termsStr)) {
            score += 12; // strong phrase bonus
            break;
          }
          // Check if all alias terms appear in query (partial phrase)
          const aliasTerms = alias.split(/\s+/);
          if (aliasTerms.length > 1 && aliasTerms.every(at => terms.includes(at))) {
            score += 10; // partial phrase bonus
            break;
          }
        }
      }

      // Penalize unmatched terms in multi-term queries
      if (terms.length > 1) {
        const missedTerms = terms.length - termsHit;
        score -= missedTerms * 4;
      }

      // Layer penalty: utility components (layer 2) are less likely search targets
      if (score > 0 && entry.meta.layer === 2) {
        score -= 3;
      }

      if (score > 0) {
        scored.push({ meta: entry.meta, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score);
  }

  searchComponents(query: string): ComponentMeta[] {
    return this.searchComponentsWithScores(query).map(s => s.meta);
  }

  getAllNames(): string[] {
    return Array.from(this.components.keys());
  }

  /** Returns a cached Set of all component names (avoids rebuilding per call) */
  getAllNamesSet(): Set<string> {
    if (!this.allNamesSet) {
      this.allNamesSet = new Set(this.components.keys());
    }
    return this.allNamesSet;
  }

  getLayerName(layer: number): string {
    return LAYER_NAMES[layer] ?? 'unknown';
  }

  getStats() {
    if (!this.statsCache) {
      this.statsCache = {
        version: this.version,
        totalComponents: this.totalComponents,
        byLayer: Object.fromEntries(
          [2, 3, 4, 5, 6].map(l => [
            `${l}-${this.getLayerName(l)}`,
            this.listComponents(l).length,
          ])
        ),
      };
    }
    return this.statsCache;
  }

  /** Fuzzy match component names using Levenshtein distance */
  fuzzyMatch(name: string, maxDistance = 3): ComponentMeta[] {
    const lower = name.toLowerCase();
    const results: { meta: ComponentMeta; distance: number }[] = [];
    for (const [compName, meta] of this.components) {
      const dist = levenshtein(lower, compName.toLowerCase());
      if (dist <= maxDistance) {
        results.push({ meta, distance: dist });
      }
    }
    return results.sort((a, b) => a.distance - b.distance).map(r => r.meta);
  }
}
