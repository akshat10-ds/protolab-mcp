import { describe, test, expect } from 'vitest';
import bundleData from '@/data/bundle.json';
import { Registry, type ComponentPropDetails } from '@/src/data/registry';

const registry = new Registry(
  bundleData.registry,
  (bundleData as Record<string, unknown>).propDetails as Record<string, ComponentPropDetails> | undefined,
);

function topN(query: string, n: number): string[] {
  return registry.searchComponents(query).slice(0, n).map(c => c.name);
}

describe('Search quality — golden assertions', () => {
  test('"button" → Button is #1', () => {
    const results = topN('button', 5);
    expect(results[0]).toBe('Button');
  });

  test('"data table" → DataTable is #1', () => {
    const results = topN('data table', 5);
    expect(results[0]).toBe('DataTable');
  });

  test('"navigation" → GlobalNav or LocalNav in top 3', () => {
    const results = topN('navigation', 3);
    const hasNav = results.some(r => r === 'GlobalNav' || r === 'LocalNav');
    expect(hasNav, `Top 3 for "navigation": ${results.join(', ')}`).toBe(true);
  });

  test('"modal dialog" → Modal is #1', () => {
    const results = topN('modal dialog', 5);
    expect(results[0]).toBe('Modal');
  });

  test('"form input" → Input in top 3', () => {
    const results = topN('form input', 3);
    expect(results, `Top 3 for "form input": ${results.join(', ')}`).toContain('Input');
  });

  test('"dropdown" → Dropdown or ComboBox in top 3', () => {
    const results = topN('dropdown', 3);
    const hasDropdown = results.some(r => r === 'Dropdown' || r === 'ComboBox');
    expect(hasDropdown, `Top 3 for "dropdown": ${results.join(', ')}`).toBe(true);
  });

  test('"table" → DataTable in top 3, Tabs NOT in top 5', () => {
    const top3 = topN('table', 3);
    const top5 = topN('table', 5);
    expect(top3, `Top 3 for "table": ${top3.join(', ')}`).toContain('DataTable');
    expect(top5, `Top 5 for "table" should not include Tabs: ${top5.join(', ')}`).not.toContain('Tabs');
  });

  test('"dialog popup overlay" → Modal #1, Drawer in top 5', () => {
    const top5 = topN('dialog popup overlay', 5);
    expect(top5[0], `#1 for "dialog popup overlay": ${top5[0]}`).toBe('Modal');
    expect(top5, `Top 5 for "dialog popup overlay": ${top5.join(', ')}`).toContain('Drawer');
  });

  test('"action menu in table row" → Dropdown in top 3', () => {
    const top3 = topN('action menu in table row', 3);
    expect(top3, `Top 3 for "action menu in table row": ${top3.join(', ')}`).toContain('Dropdown');
  });

  test('"column visibility toggle" → DataTable in top 5', () => {
    const top5 = topN('column visibility toggle', 5);
    expect(top5, `Top 5 for "column visibility toggle": ${top5.join(', ')}`).toContain('DataTable');
  });

  test('"form input validation error" → ComboBox in top 5', () => {
    const top5 = topN('form input validation error', 5);
    expect(top5, `Top 5 for "form input validation error": ${top5.join(', ')}`).toContain('ComboBox');
  });
});
