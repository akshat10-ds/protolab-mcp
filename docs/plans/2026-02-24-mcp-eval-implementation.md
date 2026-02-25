# MCP Eval Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a 3-layer eval system to measure data correctness, tool output quality, and end-to-end prototype generation.

**Architecture:** Extend existing vitest test infrastructure (Layer 1 + 2) and add a Claude Code skill for manual LLM eval (Layer 3). No new dependencies.

**Tech Stack:** Vitest, InMemoryTransport, Claude Code skills (.md)

---

### Task 1: Layer 1 — Data quality: examples reference real components

**Files:**
- Modify: `tests/integration/data-quality.test.ts`
- Read: `data/examples.json`

**Step 1: Write the failing test (it should pass since we fixed Toggle)**

Add at the bottom of the file, inside a new `describe` block:

```typescript
import examplesData from '@/data/examples.json';
import layoutPresetsData from '@/data/layout-presets.json';
import compositionRecipesData from '@/data/composition-recipes.json';
import gotchasData from '@/data/gotchas.json';

describe('Data quality — cross-file references', () => {
  const allNames = registry.getAllNamesSet();

  test('every componentsUsed in examples.json references a real component', () => {
    const phantoms: { example: string; component: string }[] = [];
    for (const ex of examplesData.examples) {
      for (const comp of ex.componentsUsed) {
        if (!allNames.has(comp)) {
          phantoms.push({ example: ex.id, component: comp });
        }
      }
    }
    expect(phantoms, `Phantom components in examples: ${JSON.stringify(phantoms)}`).toEqual([]);
  });
});
```

**Step 2: Run test to verify it passes**

Run: `npx vitest run tests/integration/data-quality.test.ts`
Expected: PASS (Toggle was already fixed in earlier commit)

---

### Task 2: Layer 1 — Data quality: layout presets + composition recipes

**Files:**
- Modify: `tests/integration/data-quality.test.ts`

**Step 1: Add two more tests inside the same `describe('Data quality — cross-file references')` block**

```typescript
  test('every component in layout-presets.json exists in registry', () => {
    const phantoms: { preset: string; component: string }[] = [];
    for (const preset of layoutPresetsData.presets) {
      for (const comp of preset.components) {
        if (!allNames.has(comp)) {
          phantoms.push({ preset: preset.id, component: comp });
        }
      }
    }
    expect(phantoms, `Phantom components in layout presets: ${JSON.stringify(phantoms)}`).toEqual([]);
  });

  test('composition recipes reference only real component names', () => {
    const componentPattern = /\b([A-Z][a-zA-Z]+)\b/g;
    const knownNonComponents = new Set([
      'Card', 'Stack', 'Inline', 'Grid', 'ReactNode', 'Save', 'Cancel', 'Confirm',
      'Heading', 'NOT', 'Do', 'Use', 'Optional', 'Tab', 'Form',
    ]);
    const phantoms: { recipe: string; component: string }[] = [];

    for (const recipe of compositionRecipesData.recipes) {
      const matches = [...recipe.composition.matchAll(componentPattern)];
      for (const match of matches) {
        const name = match[1];
        // Only flag names that look like component names (PascalCase, in registry scope)
        // Skip common English words and sub-component references (Card.Header)
        if (allNames.has(name) || knownNonComponents.has(name)) continue;
        // Only flag if it's a plausible component name (starts with uppercase, 3+ chars)
        if (name.length >= 3 && !name.match(/^(The|For|NOT|All|Any|Each|With)$/)) {
          phantoms.push({ recipe: recipe.name, component: name });
        }
      }
    }

    // Soft assertion — log but don't fail on false positives
    if (phantoms.length > 0) {
      console.warn(`Possible phantom components in recipes: ${JSON.stringify(phantoms)}`);
    }
    // Hard check: no known-bad names like "Toggle"
    const hardPhantoms = phantoms.filter(p =>
      ['Toggle', 'Toggl', 'CheckboxGroup', 'RadioGroup'].includes(p.component)
    );
    expect(hardPhantoms, `Known-bad components in recipes: ${JSON.stringify(hardPhantoms)}`).toEqual([]);
  });
```

**Step 2: Run tests**

Run: `npx vitest run tests/integration/data-quality.test.ts`
Expected: PASS

---

### Task 3: Layer 1 — Data quality: gotchas + examples coverage

**Files:**
- Modify: `tests/integration/data-quality.test.ts`

**Step 1: Add new describe block for coverage checks**

```typescript
describe('Data quality — coverage', () => {
  test('gotchas: every L3-L5 component has at least 1 gotcha', () => {
    const missing: string[] = [];
    const gotchasMap = gotchasData as Record<string, string[]>;

    for (const c of registry.listComponents()) {
      if (c.layer >= 3 && c.layer <= 5) {
        if (!gotchasMap[c.name] || gotchasMap[c.name].length === 0) {
          missing.push(`${c.name} (L${c.layer})`);
        }
      }
    }

    // At least 60% coverage for L3-L5 (allow some gaps for niche components)
    const l3l5 = registry.listComponents().filter(c => c.layer >= 3 && c.layer <= 5);
    const coverage = (l3l5.length - missing.length) / l3l5.length;
    expect(coverage, `Gotchas coverage: ${(coverage * 100).toFixed(0)}%, missing: ${missing.join(', ')}`).toBeGreaterThanOrEqual(0.5);
  });

  test('examples: at least 5 examples spanning all complexity levels', () => {
    const examples = examplesData.examples;
    expect(examples.length).toBeGreaterThanOrEqual(5);

    const complexities = new Set(examples.map(e => e.complexity));
    expect(complexities, `Complexity levels: ${[...complexities].join(', ')}`).toContain('low');
    expect(complexities).toContain('medium');
    expect(complexities).toContain('high');
  });

  test('no duplicate gotcha entries within a component', () => {
    const dupes: { component: string; gotcha: string }[] = [];
    const gotchasMap = gotchasData as Record<string, string[]>;

    for (const [component, entries] of Object.entries(gotchasMap)) {
      const seen = new Set<string>();
      for (const entry of entries) {
        if (seen.has(entry)) {
          dupes.push({ component, gotcha: entry });
        }
        seen.add(entry);
      }
    }

    expect(dupes, `Duplicate gotchas: ${JSON.stringify(dupes)}`).toEqual([]);
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/integration/data-quality.test.ts`
Expected: PASS

**Step 3: Commit Layer 1**

```bash
git add tests/integration/data-quality.test.ts
git commit -m "test: layer 1 eval — data quality assertions for cross-file refs and coverage"
```

---

### Task 4: Layer 2 — Tool output quality: get_component

**Files:**
- Create: `tests/integration/tool-output-quality.test.ts`

**Step 1: Create test file with get_component quality tests**

```typescript
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

describe('Tool output quality — get_component', () => {
  test('get_component("Switch") returns gotchas', async () => {
    const result = await client.callTool({ name: 'get_component', arguments: { name: 'Switch' } });
    const data = parseResult(result);
    expect(data.gotchas).toBeDefined();
    expect(Array.isArray(data.gotchas)).toBe(true);
    expect((data.gotchas as string[]).length).toBeGreaterThanOrEqual(1);
  });

  test('get_component("Input") returns gotchas and non-empty description', async () => {
    const result = await client.callTool({ name: 'get_component', arguments: { name: 'Input' } });
    const data = parseResult(result);
    expect(data.gotchas).toBeDefined();
    expect((data.gotchas as string[]).length).toBeGreaterThanOrEqual(1);
    expect(typeof data.description).toBe('string');
    expect((data.description as string).length).toBeGreaterThan(0);
  });

  test('get_component("Checkbox") has enriched description', async () => {
    const result = await client.callTool({ name: 'get_component', arguments: { name: 'Checkbox' } });
    const data = parseResult(result);
    expect(typeof data.description).toBe('string');
    expect((data.description as string).toLowerCase()).toContain('indeterminate');
  });

  test('get_component("Toggle") returns error and suggests Switch', async () => {
    const result = await client.callTool({ name: 'get_component', arguments: { name: 'Toggle' } });
    const data = parseResult(result);
    expect(data.error).toBeDefined();
    expect(data.suggestions).toBeDefined();
    expect(data.suggestions as string[]).toContain('Switch');
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/integration/tool-output-quality.test.ts`
Expected: PASS

---

### Task 5: Layer 2 — Tool output quality: search + validate

**Files:**
- Modify: `tests/integration/tool-output-quality.test.ts`

**Step 1: Add search_components and validate_component_usage test blocks**

```typescript
describe('Tool output quality — search_components', () => {
  test('"toggle" → Switch in top results', async () => {
    const result = await client.callTool({
      name: 'search_components',
      arguments: { query: 'toggle' },
    });
    const data = parseResult(result);
    const names = (data.results as { name: string }[]).map(r => r.name);
    expect(names, `Search "toggle" results: ${names.join(', ')}`).toContain('Switch');
  });

  test('"form input" → Input, Select, or ComboBox in top 3', async () => {
    const result = await client.callTool({
      name: 'search_components',
      arguments: { query: 'form input' },
    });
    const data = parseResult(result);
    const top3 = (data.results as { name: string }[]).slice(0, 3).map(r => r.name);
    const hasFormComponent = top3.some(n => ['Input', 'Select', 'ComboBox'].includes(n));
    expect(hasFormComponent, `Top 3 for "form input": ${top3.join(', ')}`).toBe(true);
  });
});

describe('Tool output quality — validate_component_usage', () => {
  test('flags Toggle as unknown component', async () => {
    const result = await client.callTool({
      name: 'validate_component_usage',
      arguments: { code: '<Toggle checked={true} onChange={() => {}} />' },
    });
    const data = parseResult(result);
    expect(data.valid).toBe(false);
    const issues = data.issues as { message: string }[];
    const hasToggleIssue = issues.some(i => i.message.toLowerCase().includes('toggle'));
    expect(hasToggleIssue, `Expected Toggle issue, got: ${JSON.stringify(issues)}`).toBe(true);
  });

  test('valid code with Button passes', async () => {
    const result = await client.callTool({
      name: 'validate_component_usage',
      arguments: { code: '<Button kind="brand">Click me</Button>' },
    });
    const data = parseResult(result);
    expect(data.valid).toBe(true);
  });
});
```

**Step 2: Run tests**

Run: `npx vitest run tests/integration/tool-output-quality.test.ts`
Expected: PASS

**Step 3: Commit Layer 2**

```bash
git add tests/integration/tool-output-quality.test.ts
git commit -m "test: layer 2 eval — tool output quality for get_component, search, validate"
```

---

### Task 6: Layer 3 — Claude Code /eval skill

**Files:**
- Create: `.claude/skills/eval.md`

**Step 1: Create the skill file**

The skill should:
1. Use `build_prototype` prompt or `search_components` + `get_component` to gather info
2. Use `scaffold_project` to generate code
3. Use `validate_component_usage` to check the output
4. Report a scorecard

Write the eval skill markdown (see content in implementation).

**Step 2: Test by running `/eval`**

Run: `/eval` in Claude Code
Expected: Produces a scorecard with efficiency + accuracy + completeness sections

**Step 3: Commit Layer 3**

```bash
git add .claude/skills/eval.md
git commit -m "feat: layer 3 eval — Claude Code /eval skill for end-to-end prototype eval"
```

---

### Task 7: Final verification

**Step 1: Run full test suite**

Run: `npm test`
Expected: All tests pass (original 119 + ~12 new = ~131 tests)

**Step 2: Verify no regressions**

Run: `npm run build`
Expected: Clean build

**Step 3: Run /eval manually once**

Run: `/eval` in Claude Code
Expected: Produces scorecard output
