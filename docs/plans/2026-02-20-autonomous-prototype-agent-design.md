# Autonomous Prototype Agent — Design

**Date:** 2026-02-20
**Status:** Approved

## Goal

Evolve ProtoLab MCP from a passive knowledge layer into an autonomous prototype generation system. UX designers and product managers describe a UI need in plain language, and the system produces a working, interactive prototype using Ink Design System components — no engineering required.

## Approach: Enhanced MCP + Cloudflare Sandbox

Use Claude Code as the agent harness, ProtoLab MCP as the knowledge layer, and Cloudflare Sandbox SDK as the isolated execution environment. This avoids building a custom agent from scratch while leveraging existing infrastructure.

```
[Trigger: web form / Slack / API]
        |
[Cloudflare Sandbox]
   |-- Claude Code (agent)
   |-- ProtoLab MCP (knowledge layer, remote)
   |-- Generated project files
   |-- Live preview URL -> shared with requester
```

### Mapping to Stripe's minion architecture

| Stripe minions         | Our system                                   |
|------------------------|----------------------------------------------|
| Devboxes (EC2)         | Cloudflare Sandbox                           |
| Goose (custom agent)   | Claude Code                                  |
| Toolshed (500 MCP)     | ProtoLab MCP (8 tools)                       |
| Blueprints (FSM)       | `build_prototype` prompt (structured guide)  |
| CI iteration loop      | Sandbox validation                           |
| PR output              | Live preview URL                             |

## Phases

### Phase 1: Validate & Benchmark

Before building anything new, test ProtoLab MCP with Claude Code against real prototype tasks to identify gaps.

**Test matrix (5-10 tasks, increasing complexity):**
- Simple: "Build a login form with email and password"
- Medium: "Build a settings page with sidebar navigation and a profile form"
- Complex: "Build an agreement management dashboard with a data table, filters, and a detail drawer"

**Measurements:**
- Component discovery accuracy (did Claude find the right components?)
- Tool usage patterns (did it use `scaffold_project` or go freehand?)
- Code correctness (right props, valid composition, tokens used)
- Runnability (does the output actually build and render?)
- Token consumption per task

**Output:** A gap list documenting specific failures and their root causes.

### Phase 2: Harden the MCP Server

Based on Phase 1 findings, likely enhancements:

1. **Smarter `build_prototype` prompt** — make it more prescriptive and blueprint-like, constraining the agent's decisions to the right sequence of tool calls.

2. **Validation tool** — new `validate_component_usage` tool that checks whether generated code uses components correctly (right props, valid compositions, proper imports). Gives the agent self-check capability.

3. **Token optimization** — tune `urls` vs `inline` mode based on what Claude Code actually needs. If Claude Code can fetch URLs, `urls` mode saves massive context. If not, inline is required.

4. **Better error recovery** — when `get_component` returns "not found," suggestions should be more actionable (e.g., "Did you mean X? Here's how X differs from what you searched for").

5. **End-to-end prompt** — a single prompt that takes a description and walks through the full workflow: discover -> map -> scaffold -> implement -> validate.

### Phase 3: Cloudflare Sandbox Integration

Once the MCP server reliably produces good prototypes through Claude Code:

1. **Sandbox setup** — Cloudflare Sandbox SDK project using the Claude Code template. Configure to connect to ProtoLab MCP at `https://protolab-mcp.vercel.app/api/mcp`.

2. **Execution flow:**
   - Sandbox receives a task description
   - Claude Code runs with `build_prototype` prompt
   - Uses ProtoLab MCP tools to discover, scaffold, implement
   - Runs `npm install && npm run dev` in the sandbox
   - Sandbox exposes a public preview URL

3. **Trigger interface** — simple entry point for non-engineers:
   - Option A: Web form (hosted on ProtoLab's landing page)
   - Option B: Slack bot integration
   - Option C: API endpoint that other tools can call

4. **Output delivery** — the requester receives:
   - A live preview URL they can interact with
   - A summary of which Ink components were used
   - The generated project files (downloadable or in a git branch)

## Non-goals (for now)

- Production-ready code output (prototypes only)
- Figma-to-code pipeline (future enhancement)
- Custom agent harness (using Claude Code instead)
- CI/test iteration loops (sandbox validation is sufficient for prototypes)

## Risks

- **Claude Code in sandbox may not support remote MCP** — need to verify Cloudflare Sandbox + remote MCP connectivity early.
- **Token costs** — each prototype generation is a full Claude Code session. Need to measure cost per prototype.
- **Quality ceiling** — Claude Code may not reliably produce correct Ink component usage without significant prompt engineering. Phase 1 will reveal this.
