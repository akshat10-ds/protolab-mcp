import type { Registry, ComponentMeta } from './registry';

export interface ResolvedComponent {
  name: string;
  layer: number;
  type: string;
}

export class DependencyResolver {
  private resolveCache = new Map<string, ResolvedComponent[]>();

  constructor(private registry: Registry) {}

  /**
   * Resolve all transitive dependencies for a component.
   * Returns a flat, deduplicated list in bottom-up order
   * (deepest dependencies first, target component last).
   */
  resolve(componentName: string): ResolvedComponent[] {
    const cached = this.resolveCache.get(componentName);
    if (cached) return cached;

    const visited = new Set<string>();
    const result: ResolvedComponent[] = [];

    this.walk(componentName, visited, result);

    this.resolveCache.set(componentName, result);
    return result;
  }

  private walk(
    name: string,
    visited: Set<string>,
    result: ResolvedComponent[]
  ): void {
    if (visited.has(name)) return;
    visited.add(name);

    const meta = this.registry.getComponent(name);
    if (!meta) return;

    // Walk dependencies first (bottom-up ordering)
    for (const dep of meta.dependencies) {
      this.walk(dep, visited, result);
    }

    result.push({
      name: meta.name,
      layer: meta.layer,
      type: meta.type,
    });
  }

  /**
   * Get only the dependencies (excludes the component itself)
   */
  getDependencies(componentName: string): ResolvedComponent[] {
    const all = this.resolve(componentName);
    return all.filter(c => c.name !== componentName);
  }
}
