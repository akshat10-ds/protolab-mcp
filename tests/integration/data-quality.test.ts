import { describe, test, expect } from 'vitest';
import bundleData from '@/data/bundle.json';
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
