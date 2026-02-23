import { bench, describe } from 'vitest';
import { registry } from '../fixtures/data-layer';

describe('Registry.getComponent', () => {
  bench('exact match - "Button"', () => {
    registry.getComponent('Button');
  });

  bench('case-insensitive fallback - "button"', () => {
    registry.getComponent('button');
  });

  bench('miss - "NonExistent"', () => {
    registry.getComponent('NonExistent');
  });

  bench('worst case miss - "zzz" (full scan, no match)', () => {
    registry.getComponent('zzz');
  });
});

describe('Registry.searchComponents', () => {
  bench('single term - "button"', () => {
    registry.searchComponents('button');
  });

  bench('multi-term - "data table sorting"', () => {
    registry.searchComponents('data table sorting');
  });

  bench('broad - "input"', () => {
    registry.searchComponents('input');
  });

  bench('narrow - "agreement table view"', () => {
    registry.searchComponents('agreement table view');
  });

  bench('no match - "xyzzy"', () => {
    registry.searchComponents('xyzzy');
  });
});

describe('Registry.listComponents', () => {
  bench('all components (no filter)', () => {
    registry.listComponents();
  });

  bench('filtered by layer 3 (primitives)', () => {
    registry.listComponents(3);
  });

  bench('filtered by layer 6 (layouts)', () => {
    registry.listComponents(6);
  });
});

describe('Registry.getAllNames', () => {
  bench('getAllNames', () => {
    registry.getAllNames();
  });
});

describe('Registry.getStats', () => {
  bench('getStats', () => {
    registry.getStats();
  });
});
