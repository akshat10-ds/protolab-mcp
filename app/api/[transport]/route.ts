import { createMcpHandler } from 'mcp-handler';

import bundleData from '@/data/bundle.json';
import gotchasData from '@/data/gotchas.json';
import pageTemplatesData from '@/data/page-templates.json';

import { Registry } from '@/src/data/registry';
import { SourceReader } from '@/src/data/source-reader';
import { DependencyResolver } from '@/src/data/dependency-resolver';
import { Tracker } from '@/src/analytics/tracker';
import { trackHttpRequest } from '@/src/analytics/http-tracking';

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
import { registerPlanPrototypePrompt } from '@/src/prompts/plan-prototype';

// Initialize data layer from bundle (module-level, shared across requests)
const registry = new Registry(
  bundleData.registry,
  (bundleData as Record<string, unknown>).propDetails as Record<string, import('@/src/data/registry').ComponentPropDetails> | undefined,
  gotchasData as Record<string, string[]>,
);
const sourceReader = new SourceReader({
  sources: bundleData.sources,
  tokens: bundleData.tokens,
  utility: bundleData.utility,
});
const resolver = new DependencyResolver(registry);

const handler = createMcpHandler(
  (server) => {
    // Create a per-request tracker (no-op in serverless)
    const tracker = new Tracker();

    // Register tools (9 total)
    registerListComponents(server, registry, tracker);
    registerGetComponent(server, registry, resolver, tracker);
    registerGetSource(server, registry, sourceReader, resolver, tracker);
    registerSearch(server, registry, tracker);
    registerGetTokens(server, sourceReader, tracker);
    registerUsageStats(server, tracker);
    registerMapElements(server, registry, tracker);
    registerScaffoldProject(server, registry, sourceReader, resolver, tracker);
    registerValidateUsage(server, registry, tracker);

    // Register prompts (4 total)
    registerBuildPrototypePrompt(server, registry);
    registerFigmaToCodePrompt(server, registry);
    registerFindComponentPrompt(server, registry);
    registerPlanPrototypePrompt(server, registry);

    // Register resources (3 total)
    server.resource('component-catalog', 'ink://catalog', async (uri) => {
      const components = registry.listComponents();
      const catalog = {
        ...registry.getStats(),
        components: components.map(c => ({
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
            text: JSON.stringify(catalog),
          },
        ],
      };
    });

    server.resource('design-tokens', 'ink://tokens', async (uri) => {
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

    server.resource('page-templates', 'ink://page-templates', async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: 'application/json',
          text: JSON.stringify(pageTemplatesData),
        },
      ],
    }));
  },
  {
    serverInfo: {
      name: 'ink-design-system',
      version: '1.0.0',
    },
    instructions: [
      'Ink Design System — 63 components across 6 layers (layouts → patterns → composites → primitives → utilities → tokens).',
      '',
      'START HERE:',
      '• plan_prototype({description}) — THE recommended entry point. Collaborative workflow: analyzes input (Figma URL, screenshot, or description), maps to Ink components, generates ASCII layout plan for user approval, then scaffolds a complete runnable project. Works with Figma MCP tools when available.',
      '',
      'OTHER PROMPTS:',
      '• build_prototype({description}) — self-contained guide with component APIs, design tokens, code template, and a reference example. Everything you need to write correct code.',
      '• find_component({need}) — finds matching components with full API details (import, props, gotchas, examples). No follow-up tool calls needed.',
      '• figma_to_code — translates Figma designs into Ink components with token mappings and component index.',
      '',
      'Prompts embed component API cards inline, so you rarely need get_component or search_components afterward.',
      '',
      'ACTION TOOLS (use after a prompt):',
      '• scaffold_project — generates a runnable Vite + React + TypeScript project with selected components',
      '• get_component_source — copies component source files (TSX, CSS, types) into your project',
      '• validate_component_usage — checks your JSX for wrong props, missing imports, hardcoded values',
      '',
      'LOOKUP TOOLS (only if the prompt didn\'t cover it):',
      '• get_component — full details for a single component',
      '• search_components — keyword search across all components',
      '• list_components — browse by layer',
      '• get_design_tokens — CSS custom properties (spacing, colors, typography)',
      '• map_ui_elements — maps UI descriptions to Ink components',
      '• get_usage_stats — server analytics',
      '',
      'IMPORTANT: GlobalNav and LocalNav have rich default configs. Always use the full config with logo, 5 nav items, search, notifications, settings, and user. Never simplify navigation.',
    ].join('\n'),
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  },
  {
    basePath: '/api',
    maxDuration: 60,
  }
);

export const GET = trackHttpRequest(handler);
export const POST = trackHttpRequest(handler);
