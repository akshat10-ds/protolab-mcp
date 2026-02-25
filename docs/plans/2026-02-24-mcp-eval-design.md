# MCP Eval Design

Date: 2026-02-24

## Goal

Measure whether the ProtoLab MCP produces correct, efficient prototypes. Three layers: data quality (CI), tool output quality (CI), and LLM end-to-end (manual via Claude Code).

## Existing Infrastructure

Already have: vitest test suite (119 tests), InMemoryTransport fixture, `data-quality.test.ts`, `prompt-fidelity.test.ts`, `response-sizes.test.ts`, Redis-backed production dashboard. Missing: output *content* quality assertions and end-to-end prototype evaluation.

## Layer 1: Data Quality Assertions

**File:** `tests/integration/data-quality.test.ts` (extend existing)

New test cases:
- Every `componentsUsed` in `data/examples.json` references a real registry component
- Every component in `data/layout-presets.json` `components` arrays exists in registry
- Every composition recipe in `data/composition-recipes.json` references only real component names
- Gotchas coverage: every L3-L5 component has at least 1 gotcha entry
- Examples coverage: at least 5 examples exist, spanning low/medium/high complexity
- No duplicate gotcha entries

Pure data assertions. No tool calls, no LLM. Run in < 10ms.

## Layer 2: Tool Output Quality

**File:** `tests/integration/tool-output-quality.test.ts` (new)

Uses existing `createTestClient()` InMemoryTransport fixture.

### get_component quality
- `get_component("Switch")` full mode returns gotchas array with >= 1 entry
- `get_component("Input")` full mode returns gotchas and non-empty description
- `get_component("Checkbox")` full mode has description mentioning "indeterminate" (enriched)
- `get_component("Toggle")` returns error + suggests "Switch"

### search_components quality
- `search_components("toggle")` top result is "Switch"
- `search_components("checkbox")` returns Checkbox with enriched description
- `search_components("form input")` returns Input, Select, or ComboBox in top 3

### scaffold_project quality
- Scaffold with ["Button", "Card", "Stack"] includes valid imports for all 3 + transitive deps
- Scaffold with ["DataTable"] does NOT wrap DataTable in Card

### validate_component_usage quality
- Code with `<Toggle checked={x} />` returns issue flagging Toggle as unknown
- Code with `<Card padding="16px">` returns issue (Card has no padding prop)
- Valid code with `<Button kind="brand">` returns no issues

## Layer 3: LLM End-to-End Eval

**File:** `.claude/skills/eval.md` (Claude Code skill, invoked via `/eval`)

A manual eval that uses Claude Code as the LLM. Generates one real prototype and scores it.

### Eval case

Product brief: "Build an agreement inbox with sidebar navigation, search/filter bar, data table with status badges and row actions, and a page header with a 'New Agreement' button."

This exercises the full stack: DocuSignShell, LocalNav, FilterBar, DataTable, Badge, PageHeader, Button.

### Efficiency metrics (measured automatically)
- Number of MCP tool calls made
- Total tool call duration (wall clock)
- Estimated tokens consumed (from response sizes)

### Accuracy metrics (checked programmatically)
- **Component validity**: every component used exists in registry (no phantoms)
- **Prop correctness**: no invalid prop names (via `validate_component_usage` tool)
- **Pattern compliance**: follows gotchas (DataTable not in Card, GlobalNav has 5+ items, Switch not Toggle)
- **Completeness**: all requested UI elements present in output code

### Output format

```
## Eval: Agreement Inbox
Efficiency:  4 tool calls, 1.2s total, ~3200 tokens
Accuracy:    8/8 components valid, 0 prop errors, 3/3 patterns followed
Completeness: 5/5 elements present (sidebar, search, table, badges, header)
Overall:     PASS
```

### Constraints
- Non-deterministic (LLM output varies between runs)
- Run on-demand, not in CI
- No persistent score storage — just a printout

## Implementation Order

1. Layer 1: Extend `data-quality.test.ts` (~6 new test cases)
2. Layer 2: New `tool-output-quality.test.ts` (~12 test cases)
3. Layer 3: New `.claude/skills/eval.md` skill
4. Verify: `npm test` passes, `/eval` produces scorecard
