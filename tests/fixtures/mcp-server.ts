/**
 * MCP test server factory using InMemoryTransport.
 * Creates a connected client-server pair that mirrors the exact setup
 * in app/api/[transport]/route.ts.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import bundleData from '@/data/bundle.json';
import gotchasData from '@/data/gotchas.json';
import pageTemplatesData from '@/data/page-templates.json';
import { Registry, type ComponentPropDetails } from '@/src/data/registry';
import { SourceReader } from '@/src/data/source-reader';
import { DependencyResolver } from '@/src/data/dependency-resolver';
import { Tracker } from '@/src/analytics/tracker';

import { registerListComponents } from '@/src/tools/list-components';
import { registerGetComponent } from '@/src/tools/get-component';
import { registerGetSource } from '@/src/tools/get-source';
import { registerSearch } from '@/src/tools/search';
import { registerGetTokens } from '@/src/tools/get-tokens';
import { registerUsageStats } from '@/src/tools/usage-stats';
import { registerMapElements } from '@/src/tools/map-elements';
import { registerScaffoldProject } from '@/src/tools/scaffold-project';
import { registerValidateUsage } from '@/src/tools/validate-usage';

import { registerBuildPrototypePrompt } from '@/src/prompts/build-prototype';
import { registerFigmaToCodePrompt } from '@/src/prompts/figma-to-code';
import { registerFindComponentPrompt } from '@/src/prompts/find-component';

export async function createTestClient(): Promise<{
  client: Client;
  cleanup: () => Promise<void>;
}> {
  // Data layer (same as route.ts)
  const registry = new Registry(
    bundleData.registry,
    (bundleData as Record<string, unknown>).propDetails as
      | Record<string, ComponentPropDetails>
      | undefined,
    gotchasData as Record<string, string[]>,
  );
  const sourceReader = new SourceReader({
    sources: bundleData.sources,
    tokens: bundleData.tokens,
    utility: bundleData.utility,
  });
  const resolver = new DependencyResolver(registry);
  const tracker = new Tracker();

  // MCP Server
  const mcpServer = new McpServer(
    { name: 'ink-design-system', version: '1.0.0' },
    {
      instructions: 'Ink Design System — 63 components across 6 layers.',
      capabilities: { tools: {}, resources: {}, prompts: {} },
    },
  );

  // Register all 9 tools
  registerListComponents(mcpServer, registry, tracker);
  registerGetComponent(mcpServer, registry, resolver, tracker);
  registerGetSource(mcpServer, registry, sourceReader, resolver, tracker);
  registerSearch(mcpServer, registry, tracker);
  registerGetTokens(mcpServer, sourceReader, tracker);
  registerUsageStats(mcpServer, tracker);
  registerMapElements(mcpServer, registry, tracker);
  registerScaffoldProject(mcpServer, registry, sourceReader, resolver, tracker);
  registerValidateUsage(mcpServer, registry, tracker);

  // Register all 3 prompts
  registerBuildPrototypePrompt(mcpServer, registry);
  registerFigmaToCodePrompt(mcpServer, registry);
  registerFindComponentPrompt(mcpServer, registry);

  // Register 3 resources (same as route.ts)
  mcpServer.resource('component-catalog', 'ink://catalog', async (uri) => {
    const components = registry.listComponents();
    const catalog = {
      ...registry.getStats(),
      components: components.map((c) => ({
        name: c.name,
        layer: c.layer,
        type: c.type,
        description: c.description,
        import: `import { ${c.name} } from '${c.imports}';`,
      })),
    };
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(catalog, null, 2),
        },
      ],
    };
  });

  mcpServer.resource('design-tokens', 'ink://tokens', async (uri) => {
    const tokens = sourceReader.getTokens();
    return {
      contents: [
        {
          uri: uri.href,
          mimeType: 'text/css',
          text: tokens.content,
        },
      ],
    };
  });

  mcpServer.resource('page-templates', 'ink://page-templates', async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(pageTemplatesData),
      },
    ],
  }));

  // Wire up InMemoryTransport
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client(
    { name: 'bench-client', version: '1.0.0' },
    { capabilities: {} },
  );

  await mcpServer.connect(serverTransport);
  await client.connect(clientTransport);

  return {
    client,
    cleanup: async () => {
      await client.close();
      await mcpServer.close();
    },
  };
}
