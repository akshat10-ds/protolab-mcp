import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { SourceReader } from '../data/source-reader';
import type { Tracker } from '../analytics/tracker';
import { withTracking } from '../analytics/wrapper';
import { getSourceBaseUrl } from '../data/base-url';

// ── Semantic token guide ────────────────────────────────────────────
// Curated guidance for the most commonly used tokens, organized by use case.
const TOKEN_GUIDE = {
  backgrounds: {
    description: 'Background colors for surfaces and containers',
    tokens: {
      '--ink-bg-color-canvas-page': 'Page background (outermost surface)',
      '--ink-bg-color-canvas-document': 'Document/content area background',
      '--ink-bg-color-default': 'Default surface background (cards, panels)',
      '--ink-bg-color-accent-subtle': 'Subtle accent background (selected items, hover states)',
      '--ink-bg-color-accent': 'Accent background (active states)',
      '--ink-bg-color-error-subtle': 'Error background (form validation)',
      '--ink-bg-color-success-subtle': 'Success background',
      '--ink-bg-color-warning-subtle': 'Warning background',
    },
  },
  text: {
    description: 'Text/font colors',
    tokens: {
      '--ink-font-color-default': 'Primary text (headings, body)',
      '--ink-font-color-primary': 'Primary text (same as default)',
      '--ink-font-color-secondary': 'Secondary text (descriptions, labels)',
      '--ink-font-color-tertiary': 'Tertiary text (placeholders, hints)',
      '--ink-font-color-disabled': 'Disabled text',
      '--ink-font-color-inverse': 'Text on dark backgrounds',
      '--ink-font-color-error': 'Error text (validation messages)',
      '--ink-font-color-accent': 'Accent text (links, interactive)',
    },
  },
  borders: {
    description: 'Border colors',
    tokens: {
      '--ink-border-color-default': 'Default border (inputs, cards)',
      '--ink-border-color-subtle': 'Subtle border (dividers, separators)',
      '--ink-border-color-emphasis': 'Emphasized border (focus states)',
      '--ink-border-color-accent': 'Accent border (active/selected)',
      '--ink-border-color-accent-emphasis': 'Strong accent border',
    },
  },
  spacing: {
    description: 'Spacing scale for padding, margin, and gap',
    tokens: {
      '--ink-spacing-0': '0px',
      '--ink-spacing-50': '4px (tight)',
      '--ink-spacing-100': '8px (compact)',
      '--ink-spacing-150': '12px (small)',
      '--ink-spacing-200': '16px (medium — most common)',
      '--ink-spacing-300': '24px (large)',
      '--ink-spacing-400': '32px (spacious)',
      '--ink-spacing-500': '40px (extra large)',
      '--ink-spacing-600': '48px (section gaps)',
      '--ink-spacing-700': '64px (page sections)',
    },
  },
  typography: {
    description: 'Font sizes and weights',
    tokens: {
      '--ink-font-size-xs': 'Extra small (captions, badges)',
      '--ink-font-size-sm': 'Small (labels, helper text)',
      '--ink-font-size-md': 'Medium (body text — default)',
      '--ink-font-size-lg': 'Large (subheadings)',
      '--ink-font-size-xl': 'Extra large (headings)',
      '--ink-font-size-2xl': 'Page titles',
      '--ink-font-weight-regular': 'Normal text (400)',
      '--ink-font-weight-medium': 'Emphasized text (500)',
      '--ink-font-weight-semibold': 'Subheadings (600)',
      '--ink-font-weight-bold': 'Headings (700)',
      '--ink-font-family-default': 'Primary font family',
    },
  },
  radius: {
    description: 'Border radius',
    tokens: {
      '--ink-radius-sm': '4px (buttons, inputs)',
      '--ink-radius-md': '8px (cards, panels)',
      '--ink-radius-lg': '12px (modals, dialogs)',
      '--ink-radius-full': '9999px (pills, avatars)',
    },
  },
  shadow: {
    description: 'Box shadow / elevation',
    tokens: {
      '--ink-shadow-xs': 'Subtle shadow (cards)',
      '--ink-shadow-sm': 'Light shadow (dropdowns)',
      '--ink-shadow-md': 'Medium shadow (popovers)',
      '--ink-shadow-lg': 'Heavy shadow (modals)',
      '--ink-shadow-xl': 'Maximum elevation (dialogs)',
    },
  },
  usage: {
    description: 'Quick reference for common patterns',
    patterns: {
      'Card/Panel': 'background: var(--ink-bg-color-default); border: 1px solid var(--ink-border-color-subtle); border-radius: var(--ink-radius-md); padding: var(--ink-spacing-200);',
      'Page background': 'background: var(--ink-bg-color-canvas-page);',
      'Section gap': 'gap: var(--ink-spacing-300);',
      'Form field gap': 'gap: var(--ink-spacing-200);',
      'Heading': 'font-size: var(--ink-font-size-xl); font-weight: var(--ink-font-weight-semibold); color: var(--ink-font-color-default);',
      'Body text': 'font-size: var(--ink-font-size-md); color: var(--ink-font-color-default);',
      'Helper text': 'font-size: var(--ink-font-size-sm); color: var(--ink-font-color-secondary);',
    },
  },
};

export function registerGetTokens(server: McpServer, sourceReader: SourceReader, tracker: Tracker) {
  server.tool(
    'get_design_tokens',
    'Get Ink Design System CSS custom properties (design tokens). Without a category filter, returns a URL to the full tokens.css (~66KB). With a category filter, returns the filtered tokens inline (much smaller).',
    {
      category: z
        .string()
        .optional()
        .describe('Filter tokens by category: color, spacing, typography, radius, shadow, size. Use "guide" to get a semantic usage guide for the most common tokens. Omit for all tokens.'),
      mode: z
        .enum(['urls', 'inline'])
        .optional()
        .default('urls')
        .describe('Response mode for unfiltered tokens: "urls" returns a URL (default), "inline" returns full content. Filtered tokens are always inline.'),
    },
    withTracking(tracker, 'get_design_tokens', server, async ({ category, mode }) => {
      // Semantic event
      tracker.emit({
        event: 'token_access',
        ts: new Date().toISOString(),
        category: category ?? null,
      });

      // Guide mode: return semantic usage guide
      if (category === 'guide') {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                category: 'guide',
                description: 'Semantic guide for the most commonly used Ink design tokens. Use var(--token-name) in CSS.',
                guide: TOKEN_GUIDE,
              }),
            },
          ],
        };
      }

      // Filtered tokens are always returned inline (they're small, ~5-15KB)
      if (category) {
        const filtered = sourceReader.getTokensByCategory(category);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                category,
                guide: TOKEN_GUIDE[category as keyof typeof TOKEN_GUIDE] ?? undefined,
                tokens: filtered,
              }),
            },
          ],
        };
      }

      // Full tokens: inline mode returns content directly
      if (mode === 'inline') {
        const tokens = sourceReader.getTokens();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                mode: 'inline',
                path: tokens.path,
                content: tokens.content,
              }),
            },
          ],
        };
      }

      // Full tokens: URL mode (default) — return a URL instead of 66KB of content
      const baseUrl = getSourceBaseUrl();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              mode: 'urls',
              path: 'tokens.css',
              url: `${baseUrl}/tokens.css`,
              hint: 'Fetch this URL to get the full tokens.css (~66KB). Or call with category parameter for filtered inline results.',
            }),
          },
        ],
      };
    })
  );
}
