# Gap Analysis: ProtoLab MCP → Production-Fidelity Prototypes

**Date:** 2026-02-21
**Status:** Draft

## Context

The MCP server exposes 63 Ink Design System components via 8 tools, 3 prompts, and 2 resources. The goal is autonomous prototype generation matching the fidelity of components in `protoLab/src` — full interactivity, correct prop usage, proper token application, and valid component composition.

After reviewing both codebases end-to-end, there are **5 critical gaps** between what the MCP server provides and what an agent needs to produce production-fidelity prototypes, plus **3 optimization opportunities**.

---

## Gap 1: Shallow Prop Metadata (CRITICAL)

**Current state:** Registry stores prop names only — `props: ["kind", "size", "disabled", "onClick"]`

**What's needed:** Type, required/optional, default value, allowed values, description

**Why it matters:** An agent using `get_component("DataTable")` gets 20+ prop names but has no idea which are required, what types they expect, or what values are valid. It must fall back to reading raw source code — which works for `Button` but fails for `DataTable` whose column config is a complex generic type with 15 properties.

**Example of the gap:**
```
Current:  props: ["columns", "data", "getRowKey", "selectedRows", "onSelectedRowsChange"]
Needed:   columns: { type: "DataTableColumn<T>[]", required: true,
            description: "Column definitions with key, header, cell renderer" }
          data: { type: "T[]", required: true }
          getRowKey: { type: "(row: T) => string", required: true }
          selectedRows: { type: "Set<string>", required: false,
            description: "Controlled selection state" }
```

**Fix:** Enrich `component-registry.json` with structured prop metadata. This can be done by:
- Parsing TypeScript interfaces from `*.types.ts` and `*.tsx` files at bundle time
- Using a lightweight TS AST parser (e.g., `ts-morph`) to extract interface members
- Or manually curating for the 15-20 most complex components

**Files:**
- `component-registry.json` in protoLab (source of truth)
- `scripts/bundle-data.ts` (if auto-extracting)
- `src/data/registry.ts` — update `ComponentMeta` interface
- `src/tools/get-component.ts` — return richer prop data

---

## Gap 2: No Composition Rules (CRITICAL)

**Current state:** Dependencies are listed (`dependencies: ["GlobalNav", "LocalNav"]`) but there's zero information about *how* components compose together.

**Why it matters:** The agent doesn't know:
- `DocuSignShell.globalNav` expects a **props object** (not a JSX element)
- `DataTable.columns` requires a specific column config shape with `key`, `header`, and `cell` renderer
- `AgreementTableView.pageHeader` takes PageHeader props, not children
- Modal children go in the body slot, but `footer` is a separate prop
- Stack/Grid/Inline are the layout primitives that should wrap everything

**Example failure mode:** Agent writes `<DocuSignShell><GlobalNav /></DocuSignShell>` instead of `<DocuSignShell globalNav={{ logo: ..., items: [...] }}>`.

**Fix:** Add a `composition` field to each registry entry:
```json
{
  "composition": {
    "childrenType": "ReactNode",
    "slotProps": {
      "globalNav": { "type": "GlobalNavProps", "component": "GlobalNav", "required": true },
      "localNav": { "type": "LocalNavProps", "component": "LocalNav", "required": false }
    },
    "typicalParents": ["none — this is a top-level layout"],
    "typicalChildren": ["PageHeader", "Stack", "DataTable"]
  }
}
```

**Files:**
- `component-registry.json` — add composition metadata
- `src/data/registry.ts` — update `ComponentMeta`
- `src/tools/get-component.ts` — include composition data in response

---

## Gap 3: No Full-Page Examples (HIGH)

**Current state:** Examples are one-liners: `["<Button kind=\"brand\">Click</Button>"]`

**Why it matters:** For simple primitives, one-liners work. For patterns and layouts, the agent needs to see a complete composition showing how 5-10 components wire together with state, callbacks, and realistic data. Without this, the agent generates structurally plausible but functionally broken code.

**What exists in protoLab but isn't bundled:** Story files (`*.stories.tsx`) show rich interactive examples with realistic data, state management, and composition patterns. These are explicitly excluded by the bundle script.

**Fix:** Two approaches (not mutually exclusive):

**A. Curated full-page examples** (recommended first step):
Add 3-5 canonical prototype examples to the bundle as a new `examples` section. These are hand-crafted reference implementations showing:
1. Simple form page (Input, Select, Button, Card, Stack)
2. Settings page (DocuSignShell, LocalNav, form components)
3. Dashboard (DocuSignShell, GlobalNav, DataTable, FilterBar, PageHeader)
4. Detail view with modal (Card, Tabs, Modal, Button)
5. AI chat interface (DocuSignShell, AIChat, sidebar)

Each example: ~50-100 lines of App.tsx showing complete state management, prop wiring, and token usage.

**B. Extract story patterns** (longer term):
Selectively include `.stories.tsx` content — not the full Storybook boilerplate, but extract the `args` and render functions that show valid component usage patterns.

**Files:**
- New: `data/examples/` directory with reference prototypes
- `scripts/bundle-data.ts` — include examples in bundle
- `src/tools/` — new tool or extend `get_component` to serve examples
- Alternatively: include in `build_prototype` prompt directly

---

## Gap 4: Token-to-Property Mapping Guidance (MEDIUM)

**Current state:** `get_design_tokens({ category: "color" })` returns ~200 CSS variables. The agent sees `--ink-cta-bg-color-brand-default`, `--ink-bg-subtle`, `--ink-font-default` etc. but has no guidance on which to use when.

**Why it matters:** The agent either:
- Picks random-seeming tokens and gets wrong colors
- Falls back to hardcoded values (breaks the design system)
- Uses the correct ones by luck

**What would help:** A semantic mapping guide:
```
For card backgrounds:     use --ink-bg-default or --ink-bg-subtle
For page backgrounds:     use --ink-bg-canvas
For text:                 use --ink-font-default (primary), --ink-font-subtle (secondary)
For borders:              use --ink-border-default or --ink-border-subtle
For interactive elements: use --ink-cta-bg-color-{kind}-{state} (managed by components)
For spacing:              use --ink-spacing-{100-1000} (100=4px, 200=8px, 300=12px, ...)
```

**Fix:** Add a `tokenGuide` section to the bundle or to the `get_design_tokens` response. Doesn't need to cover every token — just the 30-40 most commonly used ones with semantic descriptions.

**Files:**
- `src/tools/get-tokens.ts` — add a `guide` mode or include guide with category results
- Or: bake into `build_prototype` prompt

---

## Gap 5: No Feedback Loop / Self-Check (MEDIUM)

**Current state:** The agent writes code and hopes it works. The existing plan (Task 3) adds a `validate_component_usage` tool, but it only checks names — not whether props are used correctly or composition is valid.

**What would close the gap:** A validation tool that can check:
1. Are all component names valid? (existing plan covers this)
2. Are required props provided?
3. Are prop values within allowed ranges?
4. Is the component hierarchy valid? (e.g., Layout wrapping Patterns)
5. Are design tokens used instead of hardcoded values?

This is the "Stripe blueprint CI loop" equivalent — giving the agent a way to catch mistakes before the human sees them.

**Fix:** Extend the planned `validate_component_usage` with prop-level validation once Gap 1 (rich prop metadata) is addressed. Without richer metadata, there's nothing to validate against.

---

## Optimization 1: Search Quality

**Current state:** Keyword scoring with fixed weights (name=10, type=3, description=5, useCases=7, props=2). Simple string inclusion matching.

**Problem:** Search for "searchable dropdown" might not find `ComboBox`. Search for "data grid" might not find `DataTable`. Semantic gaps between user language and component naming.

**Fix options:**
- Add `aliases` and `keywords` fields to registry entries (low-effort, high-impact)
- E.g., ComboBox: `aliases: ["searchable dropdown", "autocomplete", "typeahead"]`
- E.g., DataTable: `aliases: ["data grid", "spreadsheet", "table view"]`

**Files:**
- `component-registry.json` — add aliases
- `src/data/registry.ts` — include aliases in search scoring

---

## Optimization 2: Response Size / Token Efficiency

**Current state:** `scaffold_project` in inline mode returns ~200KB+ of source code, consuming a significant chunk of the agent's context window. URLs mode is lighter but requires the agent to fetch files.

**Problem:** If the agent requests source for DataTable + all dependencies, it gets 15+ components worth of TSX, CSS, and types. This can be 300KB+ inline, which leaves little room for the agent to reason.

**Fix options:**
- **Tiered source delivery:** Return only the component's public API surface (props interface + import) by default, with full source available on request
- **Smart inline:** For scaffold, return only the "leaf" component files the agent actually writes against — barrel exports + boilerplate inline, but source files as URLs
- **Usage-focused summaries:** Instead of full source, return a component usage summary (~20 lines) showing imports, key props, and a working example

---

## Optimization 3: Prompt Prescriptiveness

**Current state:** The `build_prototype` prompt gives 7 steps but leaves implementation (Step 6) entirely to the agent's discretion.

**Problem:** Step 6 "Write your prototype in src/App.tsx" is where most failures happen. The agent needs more structure:
- A template showing the import pattern
- Guidance on state management (what needs useState, what's controlled)
- Layout structure (how to nest Stack > Card > form elements)

**Fix:** Make Step 6 more prescriptive with a code template:
```tsx
// Template structure for Step 6:
import { ComponentA, ComponentB } from '@/design-system';
import styles from './App.module.css';

export default function App() {
  // State declarations here (based on get_component results)
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());

  return (
    <DocuSignShell globalNav={{/* props from get_component */}}>
      <Stack gap="large">
        {/* Compose components following layer hierarchy */}
      </Stack>
    </DocuSignShell>
  );
}
```

---

## Recommended Priority Order

| # | Gap/Optimization | Impact | Effort | Recommendation |
|---|-----------------|--------|--------|----------------|
| 1 | Rich prop metadata | Critical — agent can't use components correctly without it | Medium | Manually curate top 20 components, automate later |
| 2 | Full-page examples | High — shows agent what "done" looks like | Low | Write 3-5 reference prototypes |
| 3 | Composition rules | Critical — structural correctness | Medium | Add to registry for all composites, patterns, layouts |
| 4 | Search aliases | High — discovery accuracy | Low | Add aliases to registry |
| 5 | Token guidance | Medium — styling correctness | Low | Add semantic guide to prompt or tool |
| 6 | Validation tool | Medium — self-correction | Medium | Already in existing plan, extend with prop validation |
| 7 | Prompt prescriptiveness | Medium — code quality | Low | Template in build_prototype prompt |
| 8 | Response size optimization | Medium — context efficiency | Medium | Tiered source delivery |

---

## Verification

After implementing these changes, validate with the benchmark harness (existing plan Task 1):
1. Run 5-10 prototype tasks of increasing complexity
2. Measure: component discovery rate, prop correctness, composition validity, build success
3. Compare before/after to quantify improvement
4. Target: >90% of generated prototypes build and render correctly on first attempt
