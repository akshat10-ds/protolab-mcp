import { bench, describe } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const bundlePath = resolve(__dirname, '../../data/bundle.json');
const bundleRaw = readFileSync(bundlePath, 'utf-8');

describe('Cold start - JSON.parse', () => {
  bench('JSON.parse(bundle.json) - ~976KB', () => {
    JSON.parse(bundleRaw);
  });
});

describe('Cold start - class construction', () => {
  // Parse once outside bench to isolate construction cost
  const parsed = JSON.parse(bundleRaw);

  bench('new Registry(data)', async () => {
    const { Registry } = await import('@/src/data/registry');
    new Registry(parsed.registry, parsed.propDetails);
  });

  bench('new SourceReader(data)', async () => {
    const { SourceReader } = await import('@/src/data/source-reader');
    new SourceReader({
      sources: parsed.sources,
      tokens: parsed.tokens,
      utility: parsed.utility,
    });
  });

  bench('new DependencyResolver(registry)', async () => {
    const { Registry } = await import('@/src/data/registry');
    const { DependencyResolver } = await import(
      '@/src/data/dependency-resolver'
    );
    const reg = new Registry(parsed.registry, parsed.propDetails);
    new DependencyResolver(reg);
  });
});

describe('Cold start - full data layer', () => {
  bench('JSON.parse + Registry + SourceReader + DependencyResolver', async () => {
    const data = JSON.parse(bundleRaw);
    const { Registry } = await import('@/src/data/registry');
    const { SourceReader } = await import('@/src/data/source-reader');
    const { DependencyResolver } = await import(
      '@/src/data/dependency-resolver'
    );
    const reg = new Registry(data.registry, data.propDetails);
    new SourceReader({
      sources: data.sources,
      tokens: data.tokens,
      utility: data.utility,
    });
    new DependencyResolver(reg);
  });
});
