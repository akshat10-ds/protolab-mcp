/**
 * E2E HTTP benchmarks — tests the full HTTP stack (JSON-RPC over Streamable HTTP).
 * Requires `npm run dev` running in a separate terminal.
 * Skips gracefully if server is not reachable.
 */
import { describe, test, beforeAll } from 'vitest';
import { runBenchmark } from '../fixtures/timing';

const BASE_URL =
  process.env.MCP_BASE_URL ?? 'http://localhost:3000/api/mcp';

let serverAvailable = false;

beforeAll(async () => {
  try {
    const resp = await fetch(BASE_URL, {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    // Any response means the server is running
    serverAvailable = true;
  } catch {
    console.warn(
      `\nServer not running at ${BASE_URL} — skipping E2E benchmarks.`,
    );
    console.warn('Start with: npm run dev\n');
  }
});

/** Send a JSON-RPC request to the MCP server */
async function mcpRequest(
  method: string,
  params: Record<string, unknown> = {},
  id: number = 1,
) {
  const response = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
    },
    body: JSON.stringify({ jsonrpc: '2.0', method, params, id }),
  });
  return response;
}

describe('HTTP E2E benchmarks', () => {
  test('tools/call - search_components', async (ctx) => {
    if (!serverAvailable) return ctx.skip();
    const stats = await runBenchmark(async () => {
      const resp = await mcpRequest('tools/call', {
        name: 'search_components',
        arguments: { query: 'button' },
      });
      await resp.text();
    }, 20);
    console.table(stats);
  });

  test('tools/call - get_component', async (ctx) => {
    if (!serverAvailable) return ctx.skip();
    const stats = await runBenchmark(async () => {
      const resp = await mcpRequest('tools/call', {
        name: 'get_component',
        arguments: { name: 'Button' },
      });
      await resp.text();
    }, 20);
    console.table(stats);
  });

  test('concurrent - 5 parallel tool calls', async (ctx) => {
    if (!serverAvailable) return ctx.skip();
    const stats = await runBenchmark(async () => {
      const queries = ['button', 'input', 'table', 'modal', 'navigation'];
      const promises = queries.map((q, i) =>
        mcpRequest(
          'tools/call',
          { name: 'search_components', arguments: { query: q } },
          i + 1,
        ).then((r) => r.text()),
      );
      await Promise.all(promises);
    }, 10);
    console.log('5 parallel calls:');
    console.table(stats);
  });

  test('concurrent - 10 parallel tool calls', async (ctx) => {
    if (!serverAvailable) return ctx.skip();
    const stats = await runBenchmark(async () => {
      const queries = [
        'button',
        'input',
        'table',
        'modal',
        'navigation',
        'form',
        'layout',
        'card',
        'dropdown',
        'tabs',
      ];
      const promises = queries.map((q, i) =>
        mcpRequest(
          'tools/call',
          { name: 'search_components', arguments: { query: q } },
          i + 1,
        ).then((r) => r.text()),
      );
      await Promise.all(promises);
    }, 10);
    console.log('10 parallel calls:');
    console.table(stats);
  });

  test('concurrent - 20 parallel tool calls', async (ctx) => {
    if (!serverAvailable) return ctx.skip();
    const stats = await runBenchmark(async () => {
      const promises = Array.from({ length: 20 }, (_, i) =>
        mcpRequest(
          'tools/call',
          { name: 'list_components', arguments: {} },
          i + 1,
        ).then((r) => r.text()),
      );
      await Promise.all(promises);
    }, 5);
    console.log('20 parallel calls:');
    console.table(stats);
  });
});
