import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient } from '../fixtures/mcp-server';
import { runBenchmark } from '../fixtures/timing';

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

describe('Tool benchmarks (InMemoryTransport)', () => {
  // ── list_components ──
  test('list_components - no filter', async () => {
    const stats = await runBenchmark(
      () => client.callTool({ name: 'list_components', arguments: {} }),
      50,
    );
    console.table(stats);
    expect(stats.p95).toBeLessThan(50);
  });

  test('list_components - layer filter', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'list_components',
          arguments: { layer: 3 },
        }),
      50,
    );
    console.table(stats);
    expect(stats.p95).toBeLessThan(50);
  });

  // ── get_component ──
  test('get_component - full detail', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_component',
          arguments: { name: 'Button' },
        }),
      50,
    );
    console.table(stats);
    expect(stats.p95).toBeLessThan(50);
  });

  test('get_component - summary detail', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_component',
          arguments: { name: 'Button', detail: 'summary' },
        }),
      50,
    );
    console.table(stats);
  });

  test('get_component - not found', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_component',
          arguments: { name: 'NonExistent' },
        }),
      50,
    );
    console.table(stats);
  });

  // ── search_components ──
  test('search_components - single term', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'search_components',
          arguments: { query: 'button' },
        }),
      50,
    );
    console.table(stats);
    expect(stats.p95).toBeLessThan(50);
  });

  test('search_components - multi term', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'search_components',
          arguments: { query: 'data table sorting filter' },
        }),
      50,
    );
    console.table(stats);
  });

  // ── get_component_source ──
  test('get_component_source - urls mode', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_component_source',
          arguments: { name: 'Button', mode: 'urls' },
        }),
      50,
    );
    console.table(stats);
  });

  test('get_component_source - inline mode', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_component_source',
          arguments: { name: 'Button', mode: 'inline' },
        }),
      20,
    );
    console.table(stats);
  });

  // ── get_design_tokens ──
  test('get_design_tokens - urls mode', async () => {
    const stats = await runBenchmark(
      () => client.callTool({ name: 'get_design_tokens', arguments: {} }),
      50,
    );
    console.table(stats);
  });

  test('get_design_tokens - category: color', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_design_tokens',
          arguments: { category: 'color' },
        }),
      50,
    );
    console.table(stats);
  });

  test('get_design_tokens - category: guide', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'get_design_tokens',
          arguments: { category: 'guide' },
        }),
      50,
    );
    console.table(stats);
  });

  // ── get_usage_stats ──
  test('get_usage_stats', async () => {
    const stats = await runBenchmark(
      () => client.callTool({ name: 'get_usage_stats', arguments: {} }),
      50,
    );
    console.table(stats);
  });

  // ── map_ui_elements ──
  test('map_ui_elements - 5 elements', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'map_ui_elements',
          arguments: {
            elements: [
              'sidebar navigation',
              'search input',
              'data table',
              'submit button',
              'modal dialog',
            ],
          },
        }),
      30,
    );
    console.table(stats);
  });

  test('map_ui_elements - 10 elements with tokens', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'map_ui_elements',
          arguments: {
            elements: [
              'sidebar navigation',
              'search input',
              'data table',
              'submit button',
              'modal dialog',
              'file upload',
              'dropdown select',
              'checkbox group',
              'page header',
              'card layout',
            ],
            includeTokenSuggestions: true,
          },
        }),
      30,
    );
    console.table(stats);
  });

  // ── scaffold_project ──
  test('scaffold_project - urls mode, 3 components', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'scaffold_project',
          arguments: {
            projectName: 'bench-test',
            components: ['Button', 'Input', 'Card'],
          },
        }),
      20,
    );
    console.table(stats);
  });

  test('scaffold_project - inline mode, 3 components', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'scaffold_project',
          arguments: {
            projectName: 'bench-test',
            components: ['Button', 'Input', 'Card'],
            mode: 'inline',
          },
        }),
      10,
    );
    console.table(stats);
  });

  test('scaffold_project - inline mode, many components (worst case)', async () => {
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'scaffold_project',
          arguments: {
            projectName: 'bench-test',
            components: [
              'DocuSignShell',
              'DataTable',
              'Modal',
              'Tabs',
              'ComboBox',
            ],
            mode: 'inline',
          },
        }),
      5,
    );
    console.table(stats);
  });

  // ── validate_component_usage ──
  test('validate_component_usage - small code', async () => {
    const code = `
import { Button, Input, Stack } from '@ink/design-system';
export default function App() {
  return <Stack><Button kind="brand">Save</Button><Input label="Name" /></Stack>;
}`;
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'validate_component_usage',
          arguments: { code },
        }),
      30,
    );
    console.table(stats);
  });

  test('validate_component_usage - large code with issues', async () => {
    const code = `
import { Button, NonExistent, Modal, DataTable } from '@ink/design-system';
export default function App() {
  return (
    <div style={{ padding: '16px', color: '#333333', background: '#ffffff' }}>
      <NonExistent />
      <Button kind="brand">Save</Button>
      <Modal title="Hello" footer={<Button>Close</Button>}>
        <DataTable columns={[]} data={[]} />
      </Modal>
    </div>
  );
}`;
    const stats = await runBenchmark(
      () =>
        client.callTool({
          name: 'validate_component_usage',
          arguments: { code },
        }),
      30,
    );
    console.table(stats);
  });
});
