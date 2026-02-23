import { bench, describe } from 'vitest';
import { resolver, allComponentNames } from '../fixtures/data-layer';

describe('DependencyResolver.resolve', () => {
  bench('leaf component - "Button"', () => {
    resolver.resolve('Button');
  });

  bench('mid-depth component - "Modal"', () => {
    resolver.resolve('Modal');
  });

  bench('deep tree - "DocuSignShell"', () => {
    resolver.resolve('DocuSignShell');
  });

  bench('deep tree - "DataTable"', () => {
    resolver.resolve('DataTable');
  });

  bench('miss - "NonExistent"', () => {
    resolver.resolve('NonExistent');
  });
});

describe('DependencyResolver.getDependencies', () => {
  bench('getDependencies - "DocuSignShell"', () => {
    resolver.getDependencies('DocuSignShell');
  });

  bench('getDependencies - "Button" (leaf)', () => {
    resolver.getDependencies('Button');
  });
});

describe('DependencyResolver - resolve all', () => {
  bench('resolve all components sequentially', () => {
    for (const name of allComponentNames) {
      resolver.resolve(name);
    }
  });
});
