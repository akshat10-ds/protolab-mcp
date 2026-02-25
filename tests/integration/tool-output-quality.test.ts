/**
 * Layer 2 eval: Tool output quality assertions.
 *
 * Tests that MCP tools return *correct content*, not just that they don't crash.
 * Uses InMemoryTransport — no LLM, runs in CI.
 */
import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient } from '../fixtures/mcp-server';

let client: Client;
let cleanup: () => Promise<void>;

beforeAll(async () => {
  const ctx = await createTestClient();
  client = ctx.client;
  cleanup = ctx.cleanup;
});

afterAll(async () => {
  await cleanup();
});

function parseResult(result: Awaited<ReturnType<typeof client.callTool>>): Record<string, unknown> {
  const text = (result.content as { type: string; text: string }[])[0].text;
  return JSON.parse(text);
}

// ── get_component quality ───────────────────────────────────────────────

describe('Tool output quality — get_component', () => {
  test('Switch returns gotchas', async () => {
    const data = parseResult(
      await client.callTool({ name: 'get_component', arguments: { name: 'Switch' } }),
    );
    expect(data.gotchas).toBeDefined();
    expect(Array.isArray(data.gotchas)).toBe(true);
    expect((data.gotchas as string[]).length).toBeGreaterThanOrEqual(1);
  });

  test('Input returns gotchas and non-empty description', async () => {
    const data = parseResult(
      await client.callTool({ name: 'get_component', arguments: { name: 'Input' } }),
    );
    expect(data.gotchas).toBeDefined();
    expect((data.gotchas as string[]).length).toBeGreaterThanOrEqual(1);
    expect(typeof data.description).toBe('string');
    expect((data.description as string).length).toBeGreaterThan(0);
  });

  test('Checkbox has enriched description mentioning indeterminate', async () => {
    const data = parseResult(
      await client.callTool({ name: 'get_component', arguments: { name: 'Checkbox' } }),
    );
    expect(typeof data.description).toBe('string');
    expect((data.description as string).toLowerCase()).toContain('indeterminate');
  });

  test('Toggle returns error and suggests Switch', async () => {
    const data = parseResult(
      await client.callTool({ name: 'get_component', arguments: { name: 'Toggle' } }),
    );
    expect(data.error).toBeDefined();
    expect(data.suggestions).toBeDefined();
    expect(data.suggestions as string[]).toContain('Switch');
  });
});

// ── search_components quality ───────────────────────────────────────────

describe('Tool output quality — search_components', () => {
  test('"toggle" returns Switch in results', async () => {
    const data = parseResult(
      await client.callTool({ name: 'search_components', arguments: { query: 'toggle' } }),
    );
    const names = (data.components as { name: string }[]).map(r => r.name);
    expect(names, `Search "toggle" results: ${names.join(', ')}`).toContain('Switch');
  });

  test('"form input" returns Input, Select, or ComboBox in top 3', async () => {
    const data = parseResult(
      await client.callTool({ name: 'search_components', arguments: { query: 'form input' } }),
    );
    const top3 = (data.components as { name: string }[]).slice(0, 3).map(r => r.name);
    const hasFormComponent = top3.some(n => ['Input', 'Select', 'ComboBox'].includes(n));
    expect(hasFormComponent, `Top 3 for "form input": ${top3.join(', ')}`).toBe(true);
  });
});

// ── DataTable gotcha accuracy ────────────────────────────────────────────

describe('Tool output quality — DataTable gotcha', () => {
  test('DataTable gotcha mentions cell(row), not cell(value, row)', async () => {
    const data = parseResult(
      await client.callTool({ name: 'get_component', arguments: { name: 'DataTable' } }),
    );
    const gotchas = data.gotchas as string[];
    expect(gotchas).toBeDefined();
    const cellGotcha = gotchas.find(g => g.toLowerCase().includes('cell'));
    expect(cellGotcha, 'DataTable should have a cell-related gotcha').toBeDefined();
    expect(cellGotcha).toContain('cell(row)');
    expect(cellGotcha).not.toContain('cell(value, row)');
  });
});

// ── Icon discoverability ────────────────────────────────────────────────

describe('Tool output quality — Icon discoverability', () => {
  test('get_component("Icon") returns non-empty iconList', async () => {
    const data = parseResult(
      await client.callTool({ name: 'get_component', arguments: { name: 'Icon' } }),
    );
    expect(data.iconList).toBeDefined();
    expect(Array.isArray(data.iconList)).toBe(true);
    expect((data.iconList as string[]).length).toBeGreaterThan(0);
  });

  test('build_prototype prompt includes icon names when Icon is matched', async () => {
    const result = await client.getPrompt({
      name: 'build_prototype',
      arguments: { description: 'A page with Icon component showing check and close icons' },
    });
    // MCP SDK returns messages with content as { type: 'text', text: string }
    const text = result.messages.map(m => {
      const content = m.content as unknown;
      if (typeof content === 'string') return content;
      if (typeof content === 'object' && content !== null && 'text' in content) return (content as { text: string }).text;
      if (Array.isArray(content)) return content.map(c => typeof c === 'object' && c !== null && 'text' in c ? (c as { text: string }).text : '').join('');
      return '';
    }).join('\n');
    expect(text).toContain('Available icons:');
  });
});

// ── validate_component_usage quality ────────────────────────────────────

describe('Tool output quality — validate_component_usage', () => {
  test('flags Toggle as unknown component', async () => {
    const data = parseResult(
      await client.callTool({
        name: 'validate_component_usage',
        arguments: { code: '<Toggle checked={true} onChange={() => {}} />' },
      }),
    );
    expect(data.valid).toBe(false);
    const issues = data.issues as { message: string }[];
    const hasToggleIssue = issues.some(i =>
      i.message.toLowerCase().includes('toggle'),
    );
    expect(hasToggleIssue, `Expected Toggle issue, got: ${JSON.stringify(issues)}`).toBe(true);
  });

  test('valid code with Button passes', async () => {
    const data = parseResult(
      await client.callTool({
        name: 'validate_component_usage',
        arguments: { code: '<Button kind="brand">Click me</Button>' },
      }),
    );
    expect(data.valid).toBe(true);
  });
});
