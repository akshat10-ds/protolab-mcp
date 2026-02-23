/**
 * E2E Journey Tests — simulate realistic multi-tool workflows
 * that an LLM would perform when using the MCP server.
 */
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

/** Helper: call a tool and parse JSON response */
async function callTool(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  const result = await client.callTool({ name, arguments: args });
  const text = (result.content as Array<{ type: string; text: string }>)[0]?.text;
  return JSON.parse(text);
}

/** Helper: get top N component names from search */
async function searchTopN(query: string, n: number): Promise<string[]> {
  const result = await callTool('search_components', { query }) as {
    components: Array<{ name: string }>;
  };
  return result.components.slice(0, n).map(r => r.name);
}

// ═══════════════════════════════════════════════════════════════════════
// Journey 1: "Build a settings page"
// ═══════════════════════════════════════════════════════════════════════
describe('Journey 1: Build a settings page', () => {
  test('search "settings page with form" does NOT rank Pagination #1', async () => {
    const top5 = await searchTopN('settings page with form', 5);
    expect(top5[0]).not.toBe('Pagination');
  });

  test('search "settings page with form" has relevant components in top 5', async () => {
    const top5 = await searchTopN('settings page with form', 5);
    // At least one form/input/nav-related component should appear
    const relevant = ['Input', 'LocalNav', 'Form', 'Select', 'TextArea', 'Dropdown', 'PageHeader'];
    const hasRelevant = top5.some(name => relevant.includes(name));
    expect(hasRelevant, `Top 5 for "settings page with form": ${top5.join(', ')}`).toBe(true);
  });

  test('get_component returns props matching propDetails', async () => {
    const detail = await callTool('get_component', { name: 'Input' }) as {
      name: string;
      props: string[];
      propDetails?: Array<{ name: string }>;
    };

    expect(detail.name).toBe('Input');
    expect(detail.props.length).toBeGreaterThan(0);

    if (detail.propDetails) {
      const detailNames = new Set(detail.propDetails.map(p => p.name));
      // Every prop in meta.props should exist in propDetails
      for (const prop of detail.props) {
        expect(detailNames.has(prop), `Input prop "${prop}" not in propDetails`).toBe(true);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Journey 2: "Map a design to components"
// ═══════════════════════════════════════════════════════════════════════
describe('Journey 2: Map a design to components', () => {
  let mappings: Array<{
    element: string;
    match: { name: string; layer: number } | null;
    confidence: string;
  }>;

  beforeAll(async () => {
    const result = await callTool('map_ui_elements', {
      elements: [
        'save button',
        'notification banner',
        'data table with sorting',
        'navigation sidebar',
      ],
    }) as { mappings: typeof mappings };
    mappings = result.mappings;
  });

  test('"save button" maps to Button, not ComboButton', () => {
    const m = mappings.find(m => m.element === 'save button');
    expect(m?.match?.name).toBe('Button');
  });

  test('"notification banner" maps to Banner', () => {
    const m = mappings.find(m => m.element === 'notification banner');
    expect(m?.match?.name).toBe('Banner');
  });

  test('"data table with sorting" maps to DataTable', () => {
    const m = mappings.find(m => m.element === 'data table with sorting');
    expect(m?.match?.name).toBe('DataTable');
  });

  test('"navigation sidebar" maps to LocalNav or DocuSignShell', () => {
    const m = mappings.find(m => m.element === 'navigation sidebar');
    const valid = ['LocalNav', 'DocuSignShell', 'GlobalNav'];
    expect(valid).toContain(m?.match?.name);
  });

  test('all matches have valid confidence levels', () => {
    for (const m of mappings) {
      expect(['high', 'medium', 'low', 'none']).toContain(m.confidence);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Journey 3: "Scaffold and validate"
// ═══════════════════════════════════════════════════════════════════════
describe('Journey 3: Scaffold and validate', () => {
  test('scaffold_project without fonts excludes font files', async () => {
    const result = await callTool('scaffold_project', {
      projectName: 'journey-test',
      components: ['DocuSignShell'],
      includeFonts: false,
    }) as { files: Array<{ path: string }> };

    // Should not include any font file references
    const fontFiles = result.files?.filter((f: { path: string }) =>
      f.path.includes('font') || f.path.endsWith('.woff2')
    ) ?? [];
    expect(fontFiles.length, `Font files found: ${fontFiles.map((f: { path: string }) => f.path).join(', ')}`).toBe(0);
  });

  test('scaffold_project generates smart App.tsx with DocuSignShell + DataTable', async () => {
    const result = await callTool('scaffold_project', {
      projectName: 'smart-app-test',
      components: ['DocuSignShell', 'DataTable', 'Badge', 'Button', 'PageHeader'],
      mode: 'inline',
      includeFonts: false,
    }) as { files: Record<string, string> };

    const appTsx = result.files['src/App.tsx'];
    expect(appTsx, 'App.tsx should exist').toBeDefined();

    // Should have correct imports
    expect(appTsx).toContain("from '@/design-system'");
    expect(appTsx).toContain('DocuSignShell');
    expect(appTsx).toContain('DataTable');

    // Should use globalNav as config object (not JSX)
    expect(appTsx).toContain('globalNav={{');

    // Should have sample data and columns
    expect(appTsx).toContain('sampleData');
    expect(appTsx).toContain('columns');
    expect(appTsx).toContain('getRowKey');

    // Should NOT be the empty placeholder
    expect(appTsx).not.toContain('{/* Your prototype here */}');
  });

  test('scaffold_project generates form App.tsx when Input is included', async () => {
    const result = await callTool('scaffold_project', {
      projectName: 'form-test',
      components: ['Input', 'Button', 'Stack'],
      mode: 'inline',
      includeFonts: false,
    }) as { files: Record<string, string> };

    const appTsx = result.files['src/App.tsx'];
    expect(appTsx).toContain('Input');
    expect(appTsx).toContain('label=');
    expect(appTsx).toContain('Button');
    expect(appTsx).not.toContain('{/* Your prototype here */}');
  });

  test('validate_component_usage catches unknown components', async () => {
    const code = `
import { Button, FakeComponent } from '@ink/design-system';
export default function App() {
  return <div><Button kind="brand">Save</Button><FakeComponent /></div>;
}`;
    const result = await callTool('validate_component_usage', { code }) as {
      componentsUnknown: string[];
      issues: Array<{ severity: string; component: string; message: string }>;
    };

    // Should flag the unknown component
    expect(result.componentsUnknown).toContain('FakeComponent');
    const hasError = result.issues.some(i =>
      i.severity === 'error' && i.component === 'FakeComponent'
    );
    expect(hasError, `Issues: ${JSON.stringify(result.issues)}`).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Journey 4: "Explore → drill down → get source"
// ═══════════════════════════════════════════════════════════════════════
describe('Journey 4: Explore, drill down, get source', () => {
  test('list_components(layer=5) returns pattern components', async () => {
    const result = await callTool('list_components', { layer: 5 }) as {
      components: Array<{
        layer: number;
        layerName: string;
        count: number;
        components: Array<{ name: string }>;
      }>;
    };

    // Should have exactly one group for layer 5
    expect(result.components.length).toBe(1);
    expect(result.components[0].layer).toBe(5);

    const names = result.components[0].components.map(c => c.name);
    expect(names).toContain('DataTable');
  });

  test('get_component("DataTable") has propDetails with columns and data', async () => {
    const detail = await callTool('get_component', { name: 'DataTable' }) as {
      name: string;
      propDetails?: Array<{ name: string }>;
    };

    expect(detail.name).toBe('DataTable');
    expect(detail.propDetails).toBeDefined();

    const propNames = detail.propDetails!.map(p => p.name);
    expect(propNames).toContain('columns');
    expect(propNames).toContain('data');
  });

  test('get_component_source("DataTable", urls mode) returns well-formed URLs', async () => {
    const result = await callTool('get_component_source', {
      name: 'DataTable',
      mode: 'urls',
    }) as { files: Array<{ url: string; path: string }> };

    expect(result.files.length).toBeGreaterThan(0);
    for (const file of result.files) {
      expect(file.url).toBeTruthy();
      expect(file.path).toBeTruthy();
      // URL should contain the source path prefix
      expect(file.url).toContain('/source/');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Journey 6: "Validate generated code"
// ═══════════════════════════════════════════════════════════════════════
describe('Journey 6: Validate generated code', () => {
  test('validate_component_usage detects unknown props', async () => {
    // Use Modal (doesn't extend HTMLAttributes) so unknown props are detectable
    const code = `<Modal open={true} onClose={() => {}} title="Test" fakeUnknownProp="test"><p>Content</p></Modal>`;
    const result = await callTool('validate_component_usage', { code }) as {
      issues: Array<{ severity: string; component: string; message: string }>;
    };
    const hasUnknownProp = result.issues.some(i => i.message.includes('fakeUnknownProp'));
    expect(hasUnknownProp, `Issues: ${JSON.stringify(result.issues)}`).toBe(true);
  });

  test('validate_component_usage detects invalid enum values', async () => {
    const code = `<Button kind="invalid">Save</Button>`;
    const result = await callTool('validate_component_usage', { code }) as {
      issues: Array<{ severity: string; component: string; message: string }>;
    };
    const hasInvalid = result.issues.some(i => i.message.includes('"invalid"'));
    expect(hasInvalid, `Issues: ${JSON.stringify(result.issues)}`).toBe(true);
  });

  test('validate_component_usage detects JSX inline hardcoded colors', async () => {
    const code = `<div style={{ color: '#FF0000', backgroundColor: '#000' }}><Button kind="brand">Save</Button></div>`;
    const result = await callTool('validate_component_usage', { code }) as {
      issues: Array<{ severity: string; component: string; message: string }>;
    };
    const hasColor = result.issues.some(i => i.message.includes('hardcoded color'));
    expect(hasColor, `Issues: ${JSON.stringify(result.issues)}`).toBe(true);
  });

  test('get_component with nonsense name returns fuzzy suggestions', async () => {
    const result = await callTool('get_component', { name: 'Buton' }) as {
      error: string;
      suggestions: string[];
    };
    expect(result.error).toContain('not found');
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions).toContain('Button');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Journey 5: "Prompt-driven prototype"
// ═══════════════════════════════════════════════════════════════════════
describe('Journey 5: Prompt-driven prototype', () => {
  test('build_prototype prompt returns useful content', async () => {
    const result = await client.getPrompt({
      name: 'build_prototype',
      arguments: { description: 'user profile page with avatar and form' },
    });

    expect(result.messages.length).toBeGreaterThan(0);

    // Combine all message text
    const fullText = result.messages
      .map(m => (m.content as { type: string; text: string }).text ?? '')
      .join('\n');

    // Should mention relevant components
    expect(fullText).toContain('Input');
    expect(fullText).toContain('Button');
  });
});
