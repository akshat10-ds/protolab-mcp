# Terminal Core Homepage Design

## Summary

Redesign the ProtoLab landing page as a split-layout: a full-viewport interactive terminal hero on top, with structured content sections below. The terminal auto-types a startup sequence on load and offers clickable commands that scroll to content sections.

## Terminal Hero (~70vh)

### Chrome
- macOS-style title bar: three traffic-light dots (decorative), title `protolab — zsh — 80x24`
- Background: `#0D0D0F`, slightly darker than page body

### Auto-type Sequence
Typewriter effect (~40ms/char, 300ms pause between lines):

```
$ protolab

  ██████╗ ██████╗  ██████╗ ████████╗ ██████╗ ██╗      █████╗ ██████╗
  ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗██║     ██╔══██╗██╔══██╗
  ██████╔╝██████╔╝██║   ██║   ██║   ██║   ██║██║     ███████║██████╔╝
  ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██║   ██║██║     ██╔══██║██╔══██╗
  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝███████╗██║  ██║██████╔╝
  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝

  Ink Design System → MCP Server
  63 components · 8 tools · 3 prompts

$ protolab status --verbose
  ✓ server     online at protolab-mcp.vercel.app/api/mcp
  ✓ components 63 loaded (tokens → layouts)
  ✓ transport  Streamable HTTP

$ _
```

Blinking cursor at end. After sequence completes, clickable command buttons fade in:
`[setup]  [examples]  [docs]`

Each scrolls to matching section below.

## Below the Fold

Dark background, monospace-inflected typography. Each section prefixed with a `$ command` header.

### Setup — `$ protolab setup`
- Tab bar styled as terminal tabs: `claude-code | cursor | windsurf | claude-desktop`
- Config shown in code block with syntax highlighting (keys=accent, strings=green, braces=dim)
- File path as dim comment: `# ~/.cursor/mcp.json`
- Copy button
- One-liner: `Paste, restart, done.`

### Examples — `$ protolab examples`
- Grid of example prompts as command-style output:
  ```
  agreements-list    "Build an agreements list page with search and filters"
  settings-page      "Settings page with sidebar nav and form sections"
  dashboard          "Dashboard with 4 KPI cards and activity table"
  detail-view        "Agreement detail page with status and actions"
  ```
- Each row clickable (copies prompt)
- Hover shows description as dim `# comment`

### About — `$ protolab about`
- Three key-value items:
  ```
  components    Real Ink components, not generic HTML
  layouts       Knows Docusign page composition patterns
  iteration     "Move the filters" → rebuilt in seconds
  ```

### Footer
```
protolab v1.0.0 · ink design system · ↑ top
```

## Technical Notes

- Single `page.tsx` with inline styles (matching current pattern)
- CSS custom properties for theming (keep light/dark support)
- Typewriter effect via `useEffect` + `requestAnimationFrame` or `setTimeout` chain
- No external dependencies — pure React + CSS
- Smooth scroll to sections on command click
- Theme toggle retained (moves to terminal title bar area)
