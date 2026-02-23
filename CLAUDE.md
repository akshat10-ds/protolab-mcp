# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

ProtoLab MCP — a remote MCP (Model Context Protocol) server for the **Ink Design System**. It exposes 63 design system components (buttons, inputs, modals, data tables, layouts, etc.) via 8 tools, 3 prompts, and 2 resources over MCP Streamable HTTP transport. Deployed to Vercel at `https://protolab-mcp.vercel.app/api/mcp`.

## Commands

```bash
npm run dev          # Start Next.js dev server (localhost:3000)
npm run build        # Bundle data + Next.js build (runs bundle-data.ts first)
npm run bundle       # Just regenerate data/bundle.json + public/source/
npm start            # Start production server
```

## Architecture

### Data Flow

The server reads from a sibling `protoLab` repo (a full design system codebase) and bundles everything into a single `data/bundle.json` at build time. This bundle is committed to the repo and contains:

- **registry** — component metadata (name, layer, props, examples, dependencies, imports)
- **sources** — full source code of every component (TSX, CSS modules, types)
- **tokens** — design tokens CSS custom properties
- **utility** — the `cn()` class merge utility

The bundle script (`scripts/bundle-data.ts`) has two modes:
- **Full bundle** (local dev): reads from `PROTOLAB_ROOT` env var (default: `../protoLab`) and writes `data/bundle.json` + `public/source/`
- **Static-only** (Vercel CI): reads existing `data/bundle.json` and writes `public/source/` files

### MCP Server (app/api/[transport]/route.ts)

Single API route that handles all MCP traffic. Uses `mcp-handler` (a Next.js adapter for `@modelcontextprotocol/sdk`). Module-level singletons are shared across requests:

- `Registry` — in-memory component lookup, search (scored multi-field matching), layer filtering
- `SourceReader` — serves component source files and tokens from the bundle
- `DependencyResolver` — walks transitive dependency trees in bottom-up order
- `Tracker` — no-op analytics in serverless (emits to nothing)

### Source Code Layout

- `src/data/` — data layer classes (Registry, SourceReader, DependencyResolver, base-url)
- `src/tools/` — MCP tool registrations (one file per tool, each exports a `register*` function)
- `src/prompts/` — MCP prompt registrations (build-prototype, figma-to-code, find-component)
- `src/analytics/` — event types, tracker, and `withTracking` HOF wrapper
- `app/` — Next.js app (landing page + API route)
- `data/bundle.json` — pre-built component data (committed, ~large file)
- `public/source/` — static source files served as CDN URLs (gitignored, built from bundle)

### Design System Layers

Components are organized in a 6-layer hierarchy (higher layers compose lower ones):
1. Tokens (CSS variables)
2. Utilities (Stack, Grid, Inline)
3. Primitives (Button, Input, Card)
4. Composites (Modal, Tabs, ComboBox)
5. Patterns (DataTable, GlobalNav, PageHeader)
6. Layouts (DocuSignShell, AgreementTableView)

### Tool Response Modes

Most tools support `mode: "urls"` (default) vs `mode: "inline"`. URLs mode returns lightweight file references (~1-2KB) pointing to `public/source/` static files. Inline mode returns full file contents (~100KB+). This is a core optimization for token usage.

### Adding a New Tool

1. Create `src/tools/my-tool.ts` exporting `registerMyTool(server, registry, ...deps, tracker)`
2. Use `withTracking(tracker, 'my_tool', server, handler)` to wrap the handler
3. Register it in `app/api/[transport]/route.ts`
4. Define input schema with `zod`

### Path Aliases

TypeScript path alias `@/*` maps to the project root (e.g., `@/src/data/registry`, `@/data/bundle.json`).
