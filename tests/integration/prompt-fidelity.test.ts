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

/** Helper to get prompt text from build_prototype */
async function getPromptText(description: string): Promise<string> {
  const result = await client.getPrompt({
    name: 'build_prototype',
    arguments: { description },
  });
  const content = result.messages[0].content;
  if ('text' in content) return content.text;
  throw new Error('Expected text content');
}

describe('Prompt fidelity: layout presets', () => {
  test('agreements list page includes List Page preset', async () => {
    const text = await getPromptText('agreements list page');

    expect(text).toContain('Layout Recipe: List Page');
    expect(text).toContain('AgreementTableView');
    expect(text).toContain('FilterBar');
    expect(text).toContain('DataTable');
    expect(text).toContain('Tables are NOT wrapped in Cards');
  });

  test('list page includes GlobalNav showcase config', async () => {
    const text = await getPromptText('agreements list page');

    expect(text).toContain('globalNavItems');
    expect(text).toContain('Agreements');
    expect(text).toContain('Templates');
    expect(text).toContain('Reports');
    expect(text).toContain('Admin');
  });

  test('list page includes LocalNav showcase config', async () => {
    const text = await getPromptText('agreements list page');

    expect(text).toContain('localNavSections');
    expect(text).toContain('Inbox');
  });

  test('settings page includes Settings preset', async () => {
    const text = await getPromptText('settings page');

    expect(text).toContain('Layout Recipe: Settings Page');
    expect(text).toContain('Card.Header');
    expect(text).toContain('Card.Body');
    expect(text).toContain('Form fields stack vertically');
  });

  test('dashboard includes Dashboard preset with no LocalNav', async () => {
    const text = await getPromptText('dashboard overview');

    expect(text).toContain('Layout Recipe: Dashboard');
    expect(text).toContain('NO LocalNav sidebar');
    expect(text).not.toContain('localNavSections');
  });

  test('detail page includes Detail preset', async () => {
    const text = await getPromptText('agreement detail view');

    expect(text).toContain('Layout Recipe: Detail Page');
    expect(text).toContain('Status badge goes ABOVE the title');
  });
});

describe('Prompt fidelity: component gotchas', () => {
  test('Card API card includes gotcha about no padding prop', async () => {
    // Settings page reliably matches Card
    const text = await getPromptText('settings page with form');

    expect(text).toContain('NO padding prop');
    expect(text).toContain('Card.Body');
  });

  test('DataTable API card includes gotcha about being data-driven', async () => {
    const text = await getPromptText('agreements list page with table');

    // DataTable gotcha
    expect(text).toContain('Data-driven: NO children');
    expect(text).toContain('columns={DataTableColumn[]}');
  });
});

describe('Prompt fidelity: always-included sections', () => {
  test('spacing cheat sheet is always present', async () => {
    const text = await getPromptText('a simple button page');

    expect(text).toContain('Spacing Between Components');
    expect(text).toContain('GlobalNav → Content');
    expect(text).toContain('Form field → Form field');
  });

  test('visual hierarchy rules are always present', async () => {
    const text = await getPromptText('a simple button page');

    expect(text).toContain('Visual Hierarchy');
    expect(text).toContain('Heading level={1}');
    expect(text).toContain('Status badges');
    expect(text).toContain('Border radius');
  });

  test('page templates resource reference is always present', async () => {
    const text = await getPromptText('any prototype page');

    expect(text).toContain('ink://page-templates');
  });
});

describe('Prompt fidelity: composition recipes', () => {
  test('stat card recipe included for dashboard description', async () => {
    const text = await getPromptText('dashboard with kpi metrics');

    expect(text).toContain('Composition Recipes');
    expect(text).toContain('StatCard');
  });

  test('form section recipe included for settings description', async () => {
    const text = await getPromptText('form section with inputs');

    expect(text).toContain('Composition Recipes');
    expect(text).toContain('FormSection');
  });
});

describe('Page templates resource', () => {
  test('ink://page-templates returns valid JSON with 8 templates', async () => {
    const result = await client.readResource({ uri: 'ink://page-templates' });

    expect(result.contents).toHaveLength(1);
    expect(result.contents[0].mimeType).toBe('application/json');

    const content = result.contents[0];
    const text = 'text' in content ? content.text : '';
    const data = JSON.parse(text as string);
    expect(data.templates).toHaveLength(8);

    // Check that each template has required fields
    for (const t of data.templates) {
      expect(t).toHaveProperty('id');
      expect(t).toHaveProperty('title');
      expect(t).toHaveProperty('diagram');
      expect(t).toHaveProperty('layout');
      expect(t).toHaveProperty('spacing');
    }
  });

  test('templates include expected page types', async () => {
    const result = await client.readResource({ uri: 'ink://page-templates' });
    const content = result.contents[0];
    const text = 'text' in content ? content.text : '';
    const data = JSON.parse(text as string);
    const ids = data.templates.map((t: { id: string }) => t.id);

    expect(ids).toContain('list-page');
    expect(ids).toContain('dashboard');
    expect(ids).toContain('detail-page');
    expect(ids).toContain('settings-page');
    expect(ids).toContain('error-page');
    expect(ids).toContain('feature-intro');
  });
});
