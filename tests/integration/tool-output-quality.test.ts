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
