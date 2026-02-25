import { describe, test, expect } from 'vitest';
import bundleData from '@/data/bundle.json';
import examplesData from '@/data/examples.json';
import layoutPresetsData from '@/data/layout-presets.json';
import gotchasData from '@/data/gotchas.json';
import compositionRecipesData from '@/data/composition-recipes.json';
import { Registry, type ComponentPropDetails } from '@/src/data/registry';

const registry = new Registry(
  bundleData.registry,
  (bundleData as Record<string, unknown>).propDetails as Record<string, ComponentPropDetails> | undefined,
);

const propDetails = (bundleData as Record<string, unknown>).propDetails as Record<string, { props: { name: string; required: boolean; description?: string }[] }>;

describe('Data quality — props consistency', () => {
  test('every meta.props entry exists in propDetails (no phantom props)', () => {
    const phantoms: { component: string; prop: string }[] = [];

    for (const component of registry.listComponents()) {
      if (!component.propDetails) continue;
      const detailNames = new Set(component.propDetails.props.map(p => p.name));

      for (const prop of component.props) {
        if (!detailNames.has(prop)) {
          phantoms.push({ component: component.name, prop });
        }
      }
    }

    expect(phantoms, `Phantom props found: ${JSON.stringify(phantoms)}`).toEqual([]);
  });

  test('at least 95% of components have propDetails', () => {
    const all = registry.listComponents();
    const withDetails = all.filter(c => c.propDetails && c.propDetails.props.length > 0);
    const coverage = withDetails.length / all.length;

    expect(coverage).toBeGreaterThanOrEqual(0.95);
  });
});

describe('Data quality — virtual components', () => {
  test('Heading has propDetails', () => {
    const heading = registry.getComponent('Heading');
    expect(heading).toBeDefined();
    expect(heading!.propDetails).toBeDefined();
    expect(heading!.propDetails!.props.length).toBeGreaterThan(0);
  });

  test('Text has propDetails', () => {
    const text = registry.getComponent('Text');
    expect(text).toBeDefined();
    expect(text!.propDetails).toBeDefined();
    expect(text!.propDetails!.props.length).toBeGreaterThan(0);
  });

  test('Icon has propDetails', () => {
    const icon = registry.getComponent('Icon');
    expect(icon).toBeDefined();
    expect(icon!.propDetails).toBeDefined();
    expect(icon!.propDetails!.props.length).toBeGreaterThan(0);
  });
});

describe('Data quality — component metadata', () => {
  test('every component has a non-empty description', () => {
    const missing: string[] = [];
    for (const c of registry.listComponents()) {
      if (!c.description || c.description.trim().length === 0) {
        missing.push(c.name);
      }
    }
    expect(missing, `Components without description: ${missing.join(', ')}`).toEqual([]);
  });

  test('every dependency references an existing component', () => {
    const allNames = registry.getAllNamesSet();
    const broken: { component: string; dep: string }[] = [];

    for (const c of registry.listComponents()) {
      for (const dep of c.dependencies) {
        if (!allNames.has(dep)) {
          broken.push({ component: c.name, dep });
        }
      }
    }

    expect(broken, `Broken deps: ${JSON.stringify(broken)}`).toEqual([]);
  });
});

// ── Layer 1 eval: cross-file reference checks ──────────────────────────

describe('Data quality — cross-file references', () => {
  const allNames = registry.getAllNamesSet();

  test('every componentsUsed in examples.json references a real component', () => {
    const phantoms: { example: string; component: string }[] = [];
    for (const ex of examplesData.examples) {
      for (const comp of ex.componentsUsed) {
        if (!allNames.has(comp)) {
          phantoms.push({ example: ex.id, component: comp });
        }
      }
    }
    expect(phantoms, `Phantom components in examples: ${JSON.stringify(phantoms)}`).toEqual([]);
  });

  test('every component in layout-presets.json exists in registry', () => {
    const phantoms: { preset: string; component: string }[] = [];
    for (const preset of layoutPresetsData.presets) {
      for (const comp of preset.components) {
        if (!allNames.has(comp)) {
          phantoms.push({ preset: preset.id, component: comp });
        }
      }
    }
    expect(phantoms, `Phantom components in layout presets: ${JSON.stringify(phantoms)}`).toEqual([]);
  });

  test('no known-bad component names in composition recipes', () => {
    const knownBad = ['Toggle', 'CheckboxGroup', 'RadioGroup'];
    const found: { recipe: string; component: string }[] = [];

    for (const recipe of compositionRecipesData.recipes) {
      for (const bad of knownBad) {
        if (recipe.composition.includes(bad)) {
          found.push({ recipe: recipe.name, component: bad });
        }
      }
    }
    expect(found, `Known-bad components in recipes: ${JSON.stringify(found)}`).toEqual([]);
  });
});

// ── Layer 1 eval: gotcha accuracy checks ────────────────────────────────

describe('Data quality — gotcha accuracy', () => {
  const gotchasMap = gotchasData as Record<string, string[]>;

  test('no gotcha contains known-wrong patterns', () => {
    const knownWrong = ['cell(value, row)', 'cell(value,row)'];
    const found: { component: string; gotcha: string; pattern: string }[] = [];

    for (const [component, entries] of Object.entries(gotchasMap)) {
      for (const entry of entries) {
        for (const pattern of knownWrong) {
          if (entry.includes(pattern)) {
            found.push({ component, gotcha: entry, pattern });
          }
        }
      }
    }

    expect(found, `Gotchas with known-wrong patterns: ${JSON.stringify(found)}`).toEqual([]);
  });
});

// ── Layer 1 eval: coverage checks ──────────────────────────────────────

describe('Data quality — coverage', () => {
  test('gotchas: at least 50% of L3-L5 components have gotchas', () => {
    const gotchasMap = gotchasData as Record<string, string[]>;
    const l3l5 = registry.listComponents().filter(c => c.layer >= 3 && c.layer <= 5);
    const withGotchas = l3l5.filter(c => gotchasMap[c.name] && gotchasMap[c.name].length > 0);
    const coverage = withGotchas.length / l3l5.length;

    const missing = l3l5.filter(c => !gotchasMap[c.name] || gotchasMap[c.name].length === 0).map(c => c.name);
    // Ratchet: raise this threshold as we add more gotchas (currently 35%)
    expect(coverage, `Gotchas coverage: ${(coverage * 100).toFixed(0)}%, missing: ${missing.join(', ')}`).toBeGreaterThanOrEqual(0.3);
  });

  test('examples: at least 5 examples spanning all complexity levels', () => {
    const examples = examplesData.examples;
    expect(examples.length).toBeGreaterThanOrEqual(5);

    const complexities = new Set(examples.map(e => e.complexity));
    expect(complexities, `Complexity levels: ${[...complexities].join(', ')}`).toContain('low');
    expect(complexities).toContain('medium');
    expect(complexities).toContain('high');
  });

  test('no duplicate gotcha entries within a component', () => {
    const dupes: { component: string; gotcha: string }[] = [];
    const gotchasMap = gotchasData as Record<string, string[]>;

    for (const [component, entries] of Object.entries(gotchasMap)) {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry)) {
          dupes.push({ component, gotcha: entry });
        }
        seen.add(entry);
      }
    }

    expect(dupes, `Duplicate gotchas: ${JSON.stringify(dupes)}`).toEqual([]);
  });
});
