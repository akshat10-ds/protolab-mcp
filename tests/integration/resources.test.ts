import { describe, test, beforeAll, afterAll } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { createTestClient } from '../fixtures/mcp-server';
import { runBenchmark, measureTime } from '../fixtures/timing';

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

describe('Resource benchmarks (InMemoryTransport)', () => {
  test('component-catalog resource', async () => {
    const { durationMs, responseSizeChars } = await measureTime(() =>
      client.readResource({ uri: 'ink://catalog' }),
    );
    console.log(
      `component-catalog: ${durationMs.toFixed(2)}ms, ${responseSizeChars} chars`,
    );

    const stats = await runBenchmark(
      () => client.readResource({ uri: 'ink://catalog' }),
      50,
    );
    console.table(stats);
  });

  test('design-tokens resource', async () => {
    const { durationMs, responseSizeChars } = await measureTime(() =>
      client.readResource({ uri: 'ink://tokens' }),
    );
    console.log(
      `design-tokens: ${durationMs.toFixed(2)}ms, ${responseSizeChars} chars`,
    );

    const stats = await runBenchmark(
      () => client.readResource({ uri: 'ink://tokens' }),
      50,
    );
    console.table(stats);
  });
});
