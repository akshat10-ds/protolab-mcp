# Autonomous Prototype Agent — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Evolve ProtoLab MCP into an autonomous prototype generation system where UX/product describe a UI and get a working prototype, using Claude Code as the agent and Cloudflare Sandbox as the execution environment.

**Architecture:** Enhanced MCP server (better prompts, validation tool, richer error recovery) + benchmark harness to measure quality + Cloudflare Sandbox project for isolated execution. The MCP server stays on Vercel; the sandbox orchestrator is a separate Cloudflare Workers project.

**Tech Stack:** TypeScript, Next.js (existing), @modelcontextprotocol/sdk, zod, Cloudflare Workers + Sandbox SDK

---

### Task 1: Create benchmark test harness

**Files:**
- Create: `scripts/benchmark.ts`
- Modify: `package.json:5-9` (add script)

This script calls ProtoLab MCP tools programmatically via the SDK and records how well each tool handles real prototype tasks. This is Phase 1 — validating before building.

**Step 1: Add benchmark script entry to package.json**

In `package.json`, add to `scripts`:

```json
"benchmark": "tsx scripts/benchmark.ts"
```

**Step 2: Write the benchmark script**

Create `scripts/benchmark.ts`:

```typescript
/**
 * Benchmark harness — tests ProtoLab MCP tools against real prototype tasks.
 *
 * Measures: component discovery accuracy, scaffold correctness, response sizes.
 * Usage: npm run benchmark
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const ENDPOINT = process.env.MCP_URL ?? 'https://protolab-mcp.vercel.app/api/mcp';

interface BenchmarkCase {
  name: string;
  description: string;
  expectedComponents: string[];
  complexity: 'simple' | 'medium' | 'complex';
}

const CASES: BenchmarkCase[] = [
  {
    name: 'login-form',
    description: 'Build a login form with email and password inputs and a submit button',
    expectedComponents: ['Input', 'Button'],
    complexity: 'simple',
  },
  {
    name: 'settings-page',
    description: 'Build a settings page with sidebar navigation, a profile form with text inputs, and a save button',
    expectedComponents: ['LocalNav', 'Input', 'Button', 'Stack'],
    complexity: 'medium',
  },
  {
    name: 'agreement-dashboard',
    description: 'Build an agreement management dashboard with a data table showing agreements, filter bar, page header with actions, and a detail drawer',
    expectedComponents: ['DataTable', 'FilterBar', 'PageHeader', 'Drawer', 'DocuSignShell'],
    complexity: 'complex',
  },
  {
    name: 'file-upload-modal',
    description: 'Build a modal dialog for uploading files with drag-and-drop, file list, and upload progress',
    expectedComponents: ['Modal', 'FileUpload', 'Button'],
    complexity: 'medium',
  },
  {
    name: 'navigation-shell',
    description: 'Build a full page layout with global top navigation, sidebar navigation, breadcrumbs, and a main content area',
    expectedComponents: ['DocuSignShell', 'GlobalNav', 'LocalNav', 'Breadcrumb'],
    complexity: 'complex',
  },
];

interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

async function runBenchmark() {
  const transport = new StreamableHTTPClientTransport(new URL(ENDPOINT));
  const client = new Client({ name: 'benchmark', version: '1.0.0' });
  await client.connect(transport);

  console.log(`\nProtoLab MCP Benchmark — ${ENDPOINT}\n${'='.repeat(60)}\n`);

  const results: Array<{
    case: string;
    complexity: string;
    searchHits: number;
    searchMisses: string[];
    scaffoldOk: boolean;
    responseSizeKB: number;
  }> = [];

  for (const tc of CASES) {
    console.log(`\n--- ${tc.name} (${tc.complexity}) ---`);
    console.log(`Description: ${tc.description}\n`);

    // 1. Test search_components
    const searchResult = await client.callTool({
      name: 'search_components',
      arguments: { query: tc.description, limit: 15 },
    }) as ToolResult;

    const searchData = JSON.parse(searchResult.content[0].text);
    const foundNames: string[] = searchData.components?.map((c: { name: string }) => c.name) ?? [];
    const hits = tc.expectedComponents.filter(e => foundNames.includes(e));
    const misses = tc.expectedComponents.filter(e => !foundNames.includes(e));

    console.log(`Search: found ${hits.length}/${tc.expectedComponents.length} expected components`);
    if (misses.length > 0) console.log(`  Missing: ${misses.join(', ')}`);
    console.log(`  Top 5 results: ${foundNames.slice(0, 5).join(', ')}`);

    // 2. Test map_ui_elements
    const elements = tc.description.split(',').map(s => s.trim()).filter(Boolean);
    const mapResult = await client.callTool({
      name: 'map_ui_elements',
      arguments: { elements: elements.length > 1 ? elements : [tc.description] },
    }) as ToolResult;

    const mapData = JSON.parse(mapResult.content[0].text);
    const mapped = mapData.mappings?.filter((m: { match: unknown }) => m.match).length ?? 0;
    console.log(`Map: ${mapped}/${mapData.mappings?.length ?? 0} elements mapped`);

    // 3. Test scaffold_project (urls mode — lightweight)
    const scaffoldResult = await client.callTool({
      name: 'scaffold_project',
      arguments: {
        projectName: `bench-${tc.name}`,
        components: tc.expectedComponents,
        mode: 'urls',
      },
    }) as ToolResult;

    const scaffoldText = scaffoldResult.content[0].text;
    const scaffoldData = JSON.parse(scaffoldText);
    const scaffoldOk = !scaffoldData.error;
    const sizeKB = Math.round(scaffoldText.length / 1024);

    console.log(`Scaffold: ${scaffoldOk ? 'OK' : 'FAILED'} (${sizeKB} KB response)`);
    if (scaffoldData.notFound?.length > 0) {
      console.log(`  Not found: ${scaffoldData.notFound.join(', ')}`);
    }
    if (scaffoldOk) {
      console.log(`  Components resolved: ${scaffoldData.componentCount}`);
      console.log(`  Total files: ${scaffoldData.totalFiles}`);
    }

    results.push({
      case: tc.name,
      complexity: tc.complexity,
      searchHits: hits.length,
      searchMisses: misses,
      scaffoldOk,
      responseSizeKB: sizeKB,
    });
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('SUMMARY\n');

  const totalExpected = CASES.reduce((s, c) => s + c.expectedComponents.length, 0);
  const totalHits = results.reduce((s, r) => s + r.searchHits, 0);
  const allMisses = results.flatMap(r => r.searchMisses);

  console.log(`Component discovery: ${totalHits}/${totalExpected} (${Math.round(totalHits / totalExpected * 100)}%)`);
  console.log(`Scaffold success: ${results.filter(r => r.scaffoldOk).length}/${results.length}`);
  if (allMisses.length > 0) {
    console.log(`\nConsistently missed components: ${[...new Set(allMisses)].join(', ')}`);
  }

  await client.close();
}

runBenchmark().catch(console.error);
```

**Step 3: Run the benchmark**

Run: `npm run benchmark`
Expected: Output showing search hit rates, scaffold success, and gaps across all test cases.

**Step 4: Commit**

```bash
git add scripts/benchmark.ts package.json
git commit -m "feat: add MCP benchmark harness for prototype validation"
```

---

### Task 2: Improve get_component error recovery

**Files:**
- Modify: `src/tools/get-component.ts:20-46`

When a component isn't found, the current response is a bare list of suggestion names. Make it richer: include descriptions and explain why each suggestion might match, so the agent can self-correct.

**Step 1: Update the not-found response**

In `src/tools/get-component.ts`, replace the not-found block (lines 20-46) with:

```typescript
      const meta = registry.getComponent(name);
      if (!meta) {
        const suggestions = registry.searchComponents(name).slice(0, 5);

        tracker.emit({
          event: 'component_lookup',
          ts: new Date().toISOString(),
          component: name,
          found: false,
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  error: `Component "${name}" not found`,
                  hint: suggestions.length > 0
                    ? `Did you mean one of these? Call get_component with the correct name.`
                    : `No similar components found. Use search_components to find what you need.`,
                  suggestions: suggestions.map(s => ({
                    name: s.name,
                    layer: s.layer,
                    layerName: registry.getLayerName(s.layer),
                    type: s.type,
                    description: s.description,
                    import: `import { ${s.name} } from '${s.imports}';`,
                  })),
                  availableComponents: registry.getAllNames().length,
                },
                null,
                2
              ),
            },
          ],
        };
      }
```

**Step 2: Verify locally**

Run: `npm run dev`
Then test with curl or the MCP inspector — call `get_component` with a misspelled name like `"Buttn"` and confirm the response includes descriptions, layers, and the actionable hint.

**Step 3: Commit**

```bash
git add src/tools/get-component.ts
git commit -m "feat: richer error recovery for get_component not-found"
```

---

### Task 3: Add validate_component_usage tool

**Files:**
- Create: `src/tools/validate-usage.ts`
- Modify: `app/api/[transport]/route.ts:17,44` (import + register)

A self-check tool the agent can call after writing code. Takes a list of component names and an optional code snippet, and validates that the components exist, reports their correct props, and flags potential issues.

**Step 1: Create the validation tool**

Create `src/tools/validate-usage.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';
import type { DependencyResolver } from '../data/dependency-resolver';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';

export function registerValidateUsage(
  server: McpServer,
  registry: Registry,
  resolver: DependencyResolver,
  tracker: Tracker
) {
  server.tool(
    'validate_component_usage',
    'Validate that component names are correct Ink Design System components. Returns each component\'s status (valid/invalid), required props, and missing transitive dependencies. Call this after planning which components to use, before writing code.',
    {
      components: z
        .array(z.string())
        .describe('Component names to validate, e.g. ["Button", "DataTable", "Modal"]'),
    },
    withTracking(tracker, 'validate_component_usage', server, async ({ components }) => {
      interface ValidationResult {
        name: string;
        valid: boolean;
        layer?: number;
        layerName?: string;
        type?: string;
        import?: string;
        props?: string[];
        dependencies?: string[];
        suggestion?: {
          name: string;
          description: string;
        };
      }

      const results: ValidationResult[] = [];
      const allDeps = new Set<string>();
      const requestedNames = new Set(components.map(c => c.toLowerCase()));

      for (const name of components) {
        const meta = registry.getComponent(name);

        if (!meta) {
          const suggestions = registry.searchComponents(name).slice(0, 1);
          results.push({
            name,
            valid: false,
            ...(suggestions.length > 0 && {
              suggestion: {
                name: suggestions[0].name,
                description: suggestions[0].description,
              },
            }),
          });
          continue;
        }

        const deps = resolver.getDependencies(meta.name);
        for (const dep of deps) {
          allDeps.add(dep.name);
        }

        results.push({
          name: meta.name,
          valid: true,
          layer: meta.layer,
          layerName: registry.getLayerName(meta.layer),
          type: meta.type,
          import: `import { ${meta.name} } from '${meta.imports}';`,
          props: meta.props,
          dependencies: deps.map(d => d.name),
        });
      }

      // Find dependencies that aren't in the requested list
      const missingDeps = [...allDeps].filter(
        dep => !requestedNames.has(dep.toLowerCase())
      );

      const valid = results.filter(r => r.valid);
      const invalid = results.filter(r => !r.valid);

      const response = {
        summary: {
          total: components.length,
          valid: valid.length,
          invalid: invalid.length,
          missingDependencies: missingDeps.length,
        },
        results,
        ...(missingDeps.length > 0 && {
          missingDependencies: {
            hint: 'These transitive dependencies are required but not in your component list. They will be included automatically by scaffold_project.',
            components: missingDeps,
          },
        }),
        ...(invalid.length > 0 && {
          nextStep: 'Fix invalid component names, then call validate_component_usage again.',
        }),
        ...(invalid.length === 0 && {
          nextStep: 'All components valid. Proceed with scaffold_project or get_component_source.',
        }),
      };

      tracker.emit({
        event: 'search_query',
        ts: new Date().toISOString(),
        query: `validate: ${components.join(', ')}`,
        resultCount: valid.length,
        topMatches: valid.map(v => v.name),
      });

      return {
        content: [{ type: 'text' as const, text: JSON.stringify(response, null, 2) }],
      };
    })
  );
}
```

**Step 2: Register in route.ts**

In `app/api/[transport]/route.ts`, add the import after line 17:

```typescript
import { registerValidateUsage } from '@/src/tools/validate-usage';
```

Add the registration after line 44 (after `registerScaffoldProject`):

```typescript
    registerValidateUsage(server, registry, resolver, tracker);
```

Update the comment on line 37 from `// Register tools (8 total)` to `// Register tools (9 total)`.

**Step 3: Update landing page tool count**

In `app/page.tsx`, add to the `tools` array (after `scaffold_project`):

```typescript
  { name: 'validate_component_usage', desc: 'Validate component names and check dependencies' },
```

Update the subtitle from `"8 tools"` to `"9 tools"` on line 29.

**Step 4: Verify locally**

Run: `npm run dev`
Test: Call `validate_component_usage` with `["Button", "Buttn", "DataTable"]` and confirm it returns Button as valid, Buttn as invalid with suggestion, and DataTable as valid with dependencies listed.

**Step 5: Commit**

```bash
git add src/tools/validate-usage.ts app/api/\[transport\]/route.ts app/page.tsx
git commit -m "feat: add validate_component_usage tool for agent self-checking"
```

---

### Task 4: Rewrite build_prototype prompt as an autonomous blueprint

**Files:**
- Modify: `src/prompts/build-prototype.ts`

The current prompt is a guide for human-supervised Claude. Rewrite it as a strict "blueprint" — a deterministic sequence of tool calls that an unattended agent follows without deviation. This is the Stripe "blueprint" concept adapted to an MCP prompt.

**Step 1: Rewrite the prompt**

Replace the entire content of `src/prompts/build-prototype.ts`:

```typescript
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Registry } from '../data/registry';

export function registerBuildPrototypePrompt(server: McpServer, registry: Registry) {
  server.prompt(
    'build_prototype',
    'Autonomous blueprint for building a UI prototype with the Ink Design System. Returns a strict, step-by-step tool call sequence that must be followed in order. Designed for unattended agent execution.',
    { description: z.string().describe("What to build, e.g. 'a settings page with user profile form'") },
    ({ description }) => {
      const searchResults = registry.searchComponents(description);
      const topMatches = searchResults.slice(0, 10).map(c => ({
        name: c.name,
        layer: c.layer,
        layerName: registry.getLayerName(c.layer),
        type: c.type,
        description: c.description,
        import: `import { ${c.name} } from '${c.imports}';`,
      }));

      const blueprint = `You are an autonomous agent building a prototype with the Ink Design System. You MUST follow this blueprint exactly — every step is a tool call or a deterministic action. Do not skip steps. Do not improvise components.

## Blueprint: "${description}"

### STEP 1: DISCOVER (tool calls — mandatory)

Run these searches to find matching components. Run ALL of them:

1. \`search_components({ query: "${description}", limit: 15 })\`
2. \`search_components({ query: "layout shell page", limit: 10 })\`
3. \`list_components({ layer: 6 })\` — check if a layout (DocuSignShell) applies
4. \`list_components({ layer: 5 })\` — check if any patterns (DataTable, GlobalNav, etc.) apply

From the results, make a list of component names you plan to use.

### STEP 2: VALIDATE (tool call — mandatory)

Call \`validate_component_usage\` with your planned component list:

\`validate_component_usage({ components: ["ComponentA", "ComponentB", ...] })\`

- If any are invalid, fix the names using the suggestions provided
- Re-run validation until all components are valid
- Note the missing dependencies — they'll be included automatically

### STEP 3: GET DETAILS (tool calls — one per component)

For EACH component in your validated list, call:

\`get_component({ name: "ComponentName" })\`

Read the props, examples, and use cases carefully. You will use these to write correct code.

### STEP 4: SCAFFOLD (tool call — mandatory)

Call \`scaffold_project\` with all your validated components:

\`scaffold_project({ projectName: "prototype", components: ["A", "B", "C"], mode: "inline" })\`

Write ALL returned files to disk. Then run:

\`cd prototype && npm install\`

### STEP 5: GET TOKENS (tool calls — as needed)

Call \`get_design_tokens\` for styling categories you need:

- \`get_design_tokens({ category: "spacing" })\` — for gaps, padding, margins
- \`get_design_tokens({ category: "color" })\` — for backgrounds, borders, text colors
- \`get_design_tokens({ category: "typography" })\` — for font sizes, weights

### STEP 6: IMPLEMENT (deterministic — write code)

Write your prototype in \`src/App.tsx\`. Follow these rules strictly:

1. Import components ONLY from \`@/design-system\` — never create custom components
2. Use ONLY the props listed in the get_component results — never guess prop names
3. Use ONLY \`var(--ink-*)\` CSS custom properties for styling — never hardcode colors, spacing, or sizes
4. Follow the layer hierarchy: Layout (L6) wraps Patterns (L5) wraps Composites (L4) wraps Primitives (L3)
5. Use Stack/Inline/Grid (L2 utilities) for layout composition
6. Use CSS Modules for any custom styles — create \`src/App.module.css\`

### STEP 7: VERIFY (deterministic — run the project)

Run: \`cd prototype && npm run dev\`

If there are TypeScript or build errors, fix them using the prop information from Step 3.

## RULES — NEVER BREAK THESE

- NEVER invent component names. Only use names returned by the tools.
- NEVER guess prop names. Only use props from get_component results.
- NEVER hardcode colors or spacing. Always use \`var(--ink-*)\` tokens.
- NEVER skip the validate step. It catches mistakes early.
- ALWAYS use \`mode: "inline"\` for scaffold_project when running autonomously.
- ALWAYS import from \`@/design-system\`, never from relative paths to component files.`;

      const initialResults = topMatches.length > 0
        ? `\n\n## Pre-computed Matches for "${description}"\n\n${JSON.stringify(topMatches, null, 2)}\n\nThese are initial matches. You MUST still run the searches in Step 1 for completeness.`
        : `\n\n## Pre-computed Matches\n\nNo direct matches for "${description}". The searches in Step 1 will use broader terms.`;

      return {
        messages: [
          {
            role: 'user' as const,
            content: {
              type: 'text' as const,
              text: blueprint + initialResults,
            },
          },
        ],
      };
    }
  );
}
```

**Step 2: Verify locally**

Run: `npm run dev`
Test with MCP inspector: call `build_prototype` with description `"a dashboard with data table and filters"` and confirm the returned prompt includes all 7 steps, the RULES section, and pre-computed matches.

**Step 3: Commit**

```bash
git add src/prompts/build-prototype.ts
git commit -m "feat: rewrite build_prototype as autonomous blueprint prompt"
```

---

### Task 5: Update landing page and metadata

**Files:**
- Modify: `app/page.tsx:29` (tool count)
- Modify: `app/layout.tsx:5` (description)

**Step 1: Update the subtitle tool count**

In `app/page.tsx`, line 29, change:

```
63 components. 8 tools. 3 prompts. One URL.
```

to:

```
63 components. 9 tools. 3 prompts. One URL.
```

(This was partially done in Task 3 but confirm it's correct.)

**Step 2: Update metadata description**

In `app/layout.tsx`, line 6, change:

```
'Remote MCP server for the Ink Design System — 63 components, 8 tools, 3 prompts. One URL, no installs.',
```

to:

```
'Remote MCP server for the Ink Design System — 63 components, 9 tools, 3 prompts. One URL, no installs.',
```

**Step 3: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "chore: update tool count to 9 in landing page metadata"
```

---

### Task 6: Run benchmark and document gaps

**Step 1: Run the benchmark**

Run: `npm run benchmark`

**Step 2: Save the output**

Redirect output to a file for reference:

```bash
npm run benchmark 2>&1 | tee docs/plans/benchmark-results.md
```

**Step 3: Analyze and document**

Review the benchmark output. Document:
- Which test cases had low search hit rates (< 80%)
- Which components are consistently missed
- Whether scaffold_project succeeded for all cases
- Response sizes (are they reasonable for agent context windows?)

Add findings as a section to the design doc or create a separate `docs/plans/2026-02-20-benchmark-findings.md`.

**Step 4: Commit**

```bash
git add docs/plans/benchmark-results.md
git commit -m "docs: add initial benchmark results from MCP validation"
```

---

### Task 7: Cloudflare Sandbox project scaffold

This is a separate project that orchestrates Claude Code in an isolated environment connected to ProtoLab MCP.

**Step 1: Create the sandbox project directory**

```bash
mkdir -p sandbox
```

**Step 2: Create the Worker entry point**

Create `sandbox/src/index.ts`:

```typescript
/**
 * ProtoLab Sandbox Worker — orchestrates Claude Code in a Cloudflare Sandbox
 * connected to the ProtoLab MCP server.
 *
 * Flow:
 * 1. Receives a prototype description via HTTP POST
 * 2. Spins up a Cloudflare Sandbox with Claude Code
 * 3. Claude Code connects to ProtoLab MCP and follows the build_prototype blueprint
 * 4. Returns a preview URL to the requester
 */

import { getSandbox, type Sandbox } from '@cloudflare/sandbox';

interface Env {
  Sandbox: DurableObjectNamespace;
  ANTHROPIC_API_KEY: string;
}

interface PrototypeRequest {
  description: string;
  /** Optional: specific components to include */
  components?: string[];
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (request.method !== 'POST') {
      return Response.json(
        { error: 'POST a JSON body with { "description": "what to build" }' },
        { status: 405 }
      );
    }

    const body = (await request.json()) as PrototypeRequest;
    if (!body.description) {
      return Response.json({ error: 'Missing "description" field' }, { status: 400 });
    }

    const sandboxId = `proto-${Date.now()}`;
    const sandbox = await getSandbox(env.Sandbox, sandboxId);

    // Install Claude Code in the sandbox
    await sandbox.exec('npm install -g @anthropic-ai/claude-code');

    // Write MCP config so Claude Code connects to ProtoLab
    const mcpConfig = JSON.stringify({
      mcpServers: {
        protolab: {
          url: 'https://protolab-mcp.vercel.app/api/mcp',
        },
      },
    });
    await sandbox.writeFile('/root/.claude.json', mcpConfig);

    // Run Claude Code with the build_prototype prompt
    const prompt = `Use the build_prototype prompt with description: "${body.description}". Follow every step of the blueprint exactly. After writing all files, run npm install and npm run dev.`;

    const result = await sandbox.exec(
      `ANTHROPIC_API_KEY="${env.ANTHROPIC_API_KEY}" claude --prompt "${prompt.replace(/"/g, '\\"')}" --yes`,
      { timeout: 300_000 } // 5 min timeout
    );

    // Expose the dev server as a public URL
    const previewUrl = await sandbox.exposePort(3000);

    return Response.json({
      status: 'complete',
      previewUrl,
      sandboxId,
      output: result.stdout,
      errors: result.stderr || undefined,
    });
  },
};
```

**Step 3: Create wrangler config**

Create `sandbox/wrangler.jsonc`:

```jsonc
{
  "name": "protolab-sandbox",
  "main": "src/index.ts",
  "compatibility_date": "2025-01-01",
  "durable_objects": {
    "bindings": [
      {
        "name": "Sandbox",
        "class_name": "SandboxDO"
      }
    ]
  },
  // Sandbox SDK container config
  "containers": {
    "sandbox": {
      "image": "node:22-slim",
      "max_instances": 5
    }
  }
}
```

**Step 4: Create package.json**

Create `sandbox/package.json`:

```json
{
  "name": "protolab-sandbox",
  "private": true,
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy"
  },
  "dependencies": {
    "@cloudflare/sandbox": "latest"
  },
  "devDependencies": {
    "wrangler": "^4.0.0",
    "@cloudflare/workers-types": "^4.0.0",
    "typescript": "^5.3.3"
  }
}
```

**Step 5: Create tsconfig**

Create `sandbox/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src"]
}
```

**Step 6: Add .gitignore entries**

Create `sandbox/.gitignore`:

```
node_modules/
.wrangler/
```

**Step 7: Commit**

```bash
git add sandbox/
git commit -m "feat: scaffold Cloudflare Sandbox project for autonomous prototyping"
```

---

### Task 8: Deploy and end-to-end test

**Step 1: Deploy MCP server changes to Vercel**

```bash
npm run build
```

Then push to trigger Vercel deploy (or run `vercel deploy`).

**Step 2: Run benchmark against production**

```bash
MCP_URL=https://protolab-mcp.vercel.app/api/mcp npm run benchmark
```

Confirm all test cases pass with acceptable hit rates.

**Step 3: Test sandbox locally (requires Cloudflare account)**

```bash
cd sandbox && npm install && npm run dev
```

Then POST a test request:

```bash
curl -X POST http://localhost:8787 \
  -H 'Content-Type: application/json' \
  -d '{"description": "a login form with email and password"}'
```

**Step 4: Document results**

Update `docs/plans/2026-02-20-autonomous-prototype-agent-design.md` with findings from the end-to-end test. Note what worked, what failed, and next steps.

**Step 5: Commit**

```bash
git add docs/
git commit -m "docs: update design doc with end-to-end test findings"
```
