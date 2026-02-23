import { bench, describe } from 'vitest';
import { sourceReader } from '../fixtures/data-layer';

describe('SourceReader.getComponentFiles', () => {
  bench('small component - "Button" (layer 3)', () => {
    sourceReader.getComponentFiles('Button', 3);
  });

  bench('large component - "DataTable" (layer 5)', () => {
    sourceReader.getComponentFiles('DataTable', 5);
  });

  bench('miss - "NonExistent" (layer 3)', () => {
    sourceReader.getComponentFiles('NonExistent', 3);
  });
});

describe('SourceReader.getTokensByCategory', () => {
  bench('category: color (broad, many regex matches)', () => {
    sourceReader.getTokensByCategory('color');
  });

  bench('category: spacing (narrow)', () => {
    sourceReader.getTokensByCategory('spacing');
  });

  bench('category: typography', () => {
    sourceReader.getTokensByCategory('typography');
  });

  bench('category: radius (very narrow)', () => {
    sourceReader.getTokensByCategory('radius');
  });

  bench('category: shadow', () => {
    sourceReader.getTokensByCategory('shadow');
  });

  bench('category: size', () => {
    sourceReader.getTokensByCategory('size');
  });

  bench('unknown category (early return)', () => {
    sourceReader.getTokensByCategory('unknown');
  });
});

describe('SourceReader.getTokens', () => {
  bench('getTokens (full CSS)', () => {
    sourceReader.getTokens();
  });
});

describe('SourceReader.getUtility', () => {
  bench('getUtility', () => {
    sourceReader.getUtility();
  });
});
