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
  typeLower: string;
  descriptionLower: string;
  useCasesLower: string[];
  aliasesLower: string[];
  propsLower: string[];
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
        typeLower: meta.type.toLowerCase(),
        descriptionLower: meta.description.toLowerCase(),
        useCasesLower: meta.useCases.map(uc => uc.toLowerCase()),
        aliasesLower: (meta.aliases ?? []).map(a => a.toLowerCase()),
        propsLower: meta.props.map(p => p.toLowerCase()),
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

    // Fast path: exact name match skips the full scoring loop
    const exactMatch = this.components.get(query) ?? this.lowercaseMap.get(q);
    if (exactMatch) {
      return [{ meta: exactMatch, score: 100 }];
    }

    const terms = q.split(/\s+/);
    const scored: { meta: ComponentMeta; score: number }[] = [];

    for (const entry of this.searchIndex.values()) {
      let score = 0;

      for (const term of terms) {
        // Name match (highest weight)
        if (entry.nameLower.includes(term)) {
          score += 10;
          if (entry.nameLower === term) score += 5; // exact name match bonus
        }

        // Type match
        if (entry.typeLower.includes(term)) {
          score += 3;
        }

        // Description match
        if (entry.descriptionLower.includes(term)) {
          score += 5;
        }

        // Use case match
        for (const uc of entry.useCasesLower) {
          if (uc.includes(term)) {
            score += 7;
          }
        }

        // Alias match (high weight — these are curated alternative names)
        for (const alias of entry.aliasesLower) {
          if (alias.includes(term)) {
            score += 8;
            if (alias === q) score += 5; // exact alias match bonus
          }
        }

        // Prop match
        for (const prop of entry.propsLower) {
          if (prop.includes(term)) {
            score += 2;
          }
        }
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
}
