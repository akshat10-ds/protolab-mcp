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

export class Registry {
  private components: Map<string, ComponentMeta> = new Map();
  private version: string = '';
  private totalComponents: number = 0;

  constructor(data: RegistryData) {
    this.version = data.version;
    this.totalComponents = data.totalComponents;
    for (const [name, meta] of Object.entries(data.components)) {
      this.components.set(name, meta);
    }
  }

  getComponent(name: string): ComponentMeta | undefined {
    // Try exact match first
    const exact = this.components.get(name);
    if (exact) return exact;

    // Try case-insensitive
    for (const [key, meta] of this.components) {
      if (key.toLowerCase() === name.toLowerCase()) {
        return meta;
      }
    }
    return undefined;
  }

  listComponents(layer?: number): ComponentMeta[] {
    const all = Array.from(this.components.values());
    if (layer !== undefined) {
      return all.filter(c => c.layer === layer);
    }
    return all;
  }

  searchComponents(query: string): ComponentMeta[] {
    const q = query.toLowerCase();
    const terms = q.split(/\s+/);

    const scored: { meta: ComponentMeta; score: number }[] = [];

    for (const meta of this.components.values()) {
      let score = 0;

      for (const term of terms) {
        // Name match (highest weight)
        if (meta.name.toLowerCase().includes(term)) {
          score += 10;
          if (meta.name.toLowerCase() === term) score += 5; // exact name match bonus
        }

        // Type match
        if (meta.type.toLowerCase().includes(term)) {
          score += 3;
        }

        // Description match
        if (meta.description.toLowerCase().includes(term)) {
          score += 5;
        }

        // Use case match
        for (const uc of meta.useCases) {
          if (uc.toLowerCase().includes(term)) {
            score += 7;
          }
        }

        // Prop match
        for (const prop of meta.props) {
          if (prop.toLowerCase().includes(term)) {
            score += 2;
          }
        }
      }

      if (score > 0) {
        scored.push({ meta, score });
      }
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .map(s => s.meta);
  }

  getAllNames(): string[] {
    return Array.from(this.components.keys());
  }

  getLayerName(layer: number): string {
    return LAYER_NAMES[layer] ?? 'unknown';
  }

  getStats() {
    return {
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
}
