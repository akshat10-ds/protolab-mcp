import { describe, test, expect } from 'vitest';

describe('Cold start - time to first tool call', () => {
  test('full cold start breakdown', async () => {
    const start = performance.now();

    // Phase 1: Imports
    const { McpServer } = await import(
      '@modelcontextprotocol/sdk/server/mcp.js'
    );
    const { Client } = await import(
      '@modelcontextprotocol/sdk/client/index.js'
    );
    const { InMemoryTransport } = await import(
      '@modelcontextprotocol/sdk/inMemory.js'
    );
    const bundleData = (await import('@/data/bundle.json')).default;
    const { Registry } = await import('@/src/data/registry');
    const { SourceReader } = await import('@/src/data/source-reader');
    const { DependencyResolver } = await import(
      '@/src/data/dependency-resolver'
    );
    const { Tracker } = await import('@/src/analytics/tracker');
    const afterImports = performance.now();

    // Phase 2: Data layer construction
    const registry = new Registry(
      bundleData.registry,
      (bundleData as Record<string, unknown>).propDetails as Record<
        string,
        import('@/src/data/registry').ComponentPropDetails
      >,
    );
    const sourceReader = new SourceReader({
      sources: bundleData.sources,
      tokens: bundleData.tokens,
      utility: bundleData.utility,
    });
    const resolver = new DependencyResolver(registry);
    const tracker = new Tracker();
    const afterConstruction = performance.now();

    // Phase 3: MCP server setup + connection
    const mcpServer = new McpServer(
      { name: 'ink-design-system', version: '1.0.0' },
      { capabilities: { tools: {}, resources: {}, prompts: {} } },
    );

    const { registerSearch } = await import('@/src/tools/search');
    registerSearch(mcpServer, registry, tracker);

    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    const client = new Client(
      { name: 'bench-client', version: '1.0.0' },
      { capabilities: {} },
    );

    await mcpServer.connect(serverTransport);
    await client.connect(clientTransport);
    const afterConnection = performance.now();

    // Phase 4: First tool call
    await client.callTool({
      name: 'search_components',
      arguments: { query: 'button' },
    });
    const afterFirstCall = performance.now();

    const breakdown = {
      totalMs: +(afterFirstCall - start).toFixed(2),
      importsMs: +(afterImports - start).toFixed(2),
      constructionMs: +(afterConstruction - afterImports).toFixed(2),
      connectionMs: +(afterConnection - afterConstruction).toFixed(2),
      firstCallMs: +(afterFirstCall - afterConnection).toFixed(2),
    };

    console.log('\nCold start breakdown:');
    console.table(breakdown);

    // Cold start should be well under 1 second
    expect(breakdown.totalMs).toBeLessThan(1000);

    await client.close();
    await mcpServer.close();
  });
});
