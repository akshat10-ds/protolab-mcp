import { describe, test, beforeAll, afterAll } from 'vitest';
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

function sizeOf(result: unknown): { chars: number; estimatedTokens: number } {
  const json = JSON.stringify(result);
  return {
    chars: json.length,
    estimatedTokens: Math.ceil(json.length / 4),
  };
}

describe('Response size analysis', () => {
  const sizeReport: Array<{
    tool: string;
    mode: string;
    chars: number;
    estimatedTokens: number;
  }> = [];

  // ── Tools ──
  test('list_components - all', async () => {
    const result = await client.callTool({
      name: 'list_components',
      arguments: {},
    });
    sizeReport.push({ tool: 'list_components', mode: 'all', ...sizeOf(result) });
  });

  test('list_components - layer 3', async () => {
    const result = await client.callTool({
      name: 'list_components',
      arguments: { layer: 3 },
    });
    sizeReport.push({ tool: 'list_components', mode: 'layer:3', ...sizeOf(result) });
  });

  test('get_component - full (DataTable)', async () => {
    const result = await client.callTool({
      name: 'get_component',
      arguments: { name: 'DataTable' },
    });
    sizeReport.push({ tool: 'get_component', mode: 'full', ...sizeOf(result) });
  });

  test('get_component - summary (DataTable)', async () => {
    const result = await client.callTool({
      name: 'get_component',
      arguments: { name: 'DataTable', detail: 'summary' },
    });
    sizeReport.push({ tool: 'get_component', mode: 'summary', ...sizeOf(result) });
  });

  test('search_components', async () => {
    const result = await client.callTool({
      name: 'search_components',
      arguments: { query: 'button' },
    });
    sizeReport.push({ tool: 'search_components', mode: 'default', ...sizeOf(result) });
  });

  test('get_component_source - urls', async () => {
    const result = await client.callTool({
      name: 'get_component_source',
      arguments: { name: 'Button', mode: 'urls' },
    });
    sizeReport.push({ tool: 'get_component_source', mode: 'urls', ...sizeOf(result) });
  });

  test('get_component_source - inline', async () => {
    const result = await client.callTool({
      name: 'get_component_source',
      arguments: { name: 'Button', mode: 'inline' },
    });
    sizeReport.push({ tool: 'get_component_source', mode: 'inline', ...sizeOf(result) });
  });

  test('get_design_tokens - urls', async () => {
    const result = await client.callTool({
      name: 'get_design_tokens',
      arguments: {},
    });
    sizeReport.push({ tool: 'get_design_tokens', mode: 'urls', ...sizeOf(result) });
  });

  test('get_design_tokens - inline', async () => {
    const result = await client.callTool({
      name: 'get_design_tokens',
      arguments: { mode: 'inline' },
    });
    sizeReport.push({ tool: 'get_design_tokens', mode: 'inline', ...sizeOf(result) });
  });

  test('get_design_tokens - color category', async () => {
    const result = await client.callTool({
      name: 'get_design_tokens',
      arguments: { category: 'color' },
    });
    sizeReport.push({ tool: 'get_design_tokens', mode: 'color', ...sizeOf(result) });
  });

  test('get_design_tokens - guide', async () => {
    const result = await client.callTool({
      name: 'get_design_tokens',
      arguments: { category: 'guide' },
    });
    sizeReport.push({ tool: 'get_design_tokens', mode: 'guide', ...sizeOf(result) });
  });

  test('scaffold_project - urls, 3 components', async () => {
    const result = await client.callTool({
      name: 'scaffold_project',
      arguments: {
        projectName: 'test',
        components: ['Button', 'Input', 'Card'],
      },
    });
    sizeReport.push({ tool: 'scaffold_project', mode: 'urls', ...sizeOf(result) });
  });

  test('scaffold_project - inline, 3 components', async () => {
    const result = await client.callTool({
      name: 'scaffold_project',
      arguments: {
        projectName: 'test',
        components: ['Button', 'Input', 'Card'],
        mode: 'inline',
      },
    });
    sizeReport.push({ tool: 'scaffold_project', mode: 'inline', ...sizeOf(result) });
  });

  test('scaffold_project - inline, 6 components (worst case)', async () => {
    const result = await client.callTool({
      name: 'scaffold_project',
      arguments: {
        projectName: 'test',
        components: [
          'DocuSignShell',
          'DataTable',
          'Modal',
          'Tabs',
          'ComboBox',
          'GlobalNav',
        ],
        mode: 'inline',
      },
    });
    sizeReport.push({ tool: 'scaffold_project', mode: 'inline-large', ...sizeOf(result) });
  });

  test('map_ui_elements', async () => {
    const result = await client.callTool({
      name: 'map_ui_elements',
      arguments: {
        elements: ['sidebar navigation', 'search input', 'data table'],
      },
    });
    sizeReport.push({ tool: 'map_ui_elements', mode: 'default', ...sizeOf(result) });
  });

  test('validate_component_usage', async () => {
    const result = await client.callTool({
      name: 'validate_component_usage',
      arguments: {
        code: '<Button kind="brand">Test</Button><Input label="Name" />',
      },
    });
    sizeReport.push({ tool: 'validate_component_usage', mode: 'default', ...sizeOf(result) });
  });

  // ── Resources ──
  test('resource: component-catalog', async () => {
    const result = await client.readResource({ uri: 'ink://catalog' });
    sizeReport.push({ tool: 'resource:catalog', mode: 'default', ...sizeOf(result) });
  });

  test('resource: design-tokens', async () => {
    const result = await client.readResource({ uri: 'ink://tokens' });
    sizeReport.push({ tool: 'resource:tokens', mode: 'default', ...sizeOf(result) });
  });

  // ── Print report ──
  test('print size report', () => {
    console.log('\n=== RESPONSE SIZE REPORT ===\n');
    console.table(sizeReport.sort((a, b) => b.chars - a.chars));

    const totalInline = sizeReport
      .filter((r) => r.mode.includes('inline'))
      .reduce((s, r) => s + r.chars, 0);
    const totalUrls = sizeReport
      .filter((r) => r.mode === 'urls')
      .reduce((s, r) => s + r.chars, 0);

    if (totalInline > 0 && totalUrls > 0) {
      console.log(
        `\nTotal inline modes: ${totalInline} chars (~${Math.ceil(totalInline / 4)} tokens)`,
      );
      console.log(
        `Total urls modes: ${totalUrls} chars (~${Math.ceil(totalUrls / 4)} tokens)`,
      );
      console.log(
        `Token savings from urls mode: ~${Math.ceil((totalInline - totalUrls) / 4)} tokens\n`,
      );
    }
  });
});
