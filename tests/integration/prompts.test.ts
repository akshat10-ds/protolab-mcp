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

describe('Prompt benchmarks (InMemoryTransport)', () => {
  test('build_prototype prompt', async () => {
    const { durationMs, responseSizeChars } = await measureTime(() =>
      client.getPrompt({
        name: 'build_prototype',
        arguments: { description: 'settings page with user profile form' },
      }),
    );
    console.log(
      `build_prototype: ${durationMs.toFixed(2)}ms, ${responseSizeChars} chars`,
    );

    const stats = await runBenchmark(
      () =>
        client.getPrompt({
          name: 'build_prototype',
          arguments: { description: 'settings page with user profile form' },
        }),
      30,
    );
    console.table(stats);
  });

  test('figma_to_code prompt', async () => {
    const { durationMs, responseSizeChars } = await measureTime(() =>
      client.getPrompt({ name: 'figma_to_code', arguments: {} }),
    );
    console.log(
      `figma_to_code: ${durationMs.toFixed(2)}ms, ${responseSizeChars} chars`,
    );

    const stats = await runBenchmark(
      () => client.getPrompt({ name: 'figma_to_code', arguments: {} }),
      50,
    );
    console.table(stats);
  });

  test('find_component prompt', async () => {
    const { durationMs, responseSizeChars } = await measureTime(() =>
      client.getPrompt({
        name: 'find_component',
        arguments: { need: 'searchable dropdown' },
      }),
    );
    console.log(
      `find_component: ${durationMs.toFixed(2)}ms, ${responseSizeChars} chars`,
    );

    const stats = await runBenchmark(
      () =>
        client.getPrompt({
          name: 'find_component',
          arguments: { need: 'searchable dropdown' },
        }),
      50,
    );
    console.table(stats);
  });
});
