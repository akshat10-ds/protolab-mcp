---
name: eval
description: Run end-to-end prototype eval against the ProtoLab MCP. Generates a real prototype using MCP tools and scores it on efficiency, accuracy, and completeness.
user_invocable: true
---

# MCP End-to-End Eval

You are running an eval of the ProtoLab MCP server. Follow these steps exactly.

## Setup

Note the start time. You will track every MCP tool call you make (tool name, duration if visible).

## Step 1: Generate the Prototype

Use the ProtoLab MCP tools to build this prototype:

> **Brief:** Build an agreement inbox with sidebar navigation, search/filter bar, data table with status badges and row actions, and a page header with a "New Agreement" button.

Use whatever MCP tools you need (search_components, get_component, scaffold_project, build_prototype prompt, etc.). Build it like a real user would — don't skip steps to game the eval.

Save the final code to a temporary file or just hold it in context.

## Step 2: Validate the Output

### 2a: Component Validity
Extract every Ink component name used in the generated code. Call `search_components` or `get_component` to verify each one exists in the registry. Record:
- Total components used
- How many are valid (exist in registry)
- Any phantom components (don't exist)

### 2b: Prop Correctness
Call `validate_component_usage` with the generated code. Record:
- Number of issues found
- Whether `valid` is true or false

### 2c: Pattern Compliance
Check these gotchas manually in the generated code:
1. DataTable is NOT wrapped in a Card
2. GlobalNav has 5+ nav items (not fewer)
3. No use of "Toggle" — should be "Switch" if needed
Record pass/fail for each.

### 2d: Completeness
Check if the output includes all 5 requested elements:
1. Sidebar navigation (LocalNav or equivalent)
2. Search/filter bar (FilterBar or equivalent)
3. Data table (DataTable)
4. Status badges (Badge)
5. Page header with action button (PageHeader + Button)
Record which are present.

## Step 3: Report Scorecard

Print this exact format, filling in the values:

```
## Eval: Agreement Inbox

### Efficiency
- Tool calls: [N] calls
- Tools used: [list each tool name]

### Accuracy
- Component validity: [X]/[Y] components exist in registry
- Prop correctness: [N] issues from validate_component_usage
- Pattern compliance: [X]/3 patterns followed
  - [ ] DataTable not in Card
  - [ ] GlobalNav has 5+ items
  - [ ] No Toggle (uses Switch if needed)

### Completeness
- Elements present: [X]/5
  - [ ] Sidebar navigation
  - [ ] Search/filter bar
  - [ ] Data table
  - [ ] Status badges
  - [ ] Page header with action

### Overall: [PASS if accuracy 100% + completeness 5/5, otherwise FAIL with notes]
```

## Important

- Do NOT skip tool calls to improve the efficiency score — use tools naturally
- Do NOT hardcode results — actually check each criterion
- This eval is non-deterministic and that's fine — it's a health check, not a CI gate
