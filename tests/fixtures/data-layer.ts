/**
 * Shared data layer fixture for benchmarks and integration tests.
 * Constructs Registry, SourceReader, and DependencyResolver once from the bundle.
 * Mirrors the initialization in app/api/[transport]/route.ts (lines 24-31).
 */
import bundleData from '@/data/bundle.json';
import { Registry, type ComponentPropDetails } from '@/src/data/registry';
import { SourceReader } from '@/src/data/source-reader';
import { DependencyResolver } from '@/src/data/dependency-resolver';

export const registry = new Registry(
  bundleData.registry,
  (bundleData as Record<string, unknown>).propDetails as
    | Record<string, ComponentPropDetails>
    | undefined,
);

export const sourceReader = new SourceReader({
  sources: bundleData.sources,
  tokens: bundleData.tokens,
  utility: bundleData.utility,
});

export const resolver = new DependencyResolver(registry);

/** All component names for iteration benchmarks */
export const allComponentNames = registry.getAllNames();

/** Raw bundle data for cold-start benchmarks */
export { bundleData };
