const ENDPOINT = 'https://protolab-mcp.vercel.app/api/mcp';

const tools = [
  { name: 'search_components', desc: 'Search by keyword or use case' },
  { name: 'get_component', desc: 'Full details — props, examples, dependencies' },
  { name: 'get_component_source', desc: 'TSX, CSS modules, and transitive deps' },
  { name: 'list_components', desc: 'Browse all components by layer' },
  { name: 'get_design_tokens', desc: 'CSS custom properties by category' },
  { name: 'map_ui_elements', desc: 'Batch-map UI descriptions to components' },
  { name: 'scaffold_project', desc: 'Generate a full Vite + React project' },
  { name: 'get_usage_stats', desc: 'Usage analytics (local server only)' },
];

const prompts = [
  { name: 'build_prototype', desc: 'Step-by-step prototype workflow' },
  { name: 'figma_to_code', desc: 'Figma design to Ink component mapping' },
  { name: 'find_component', desc: 'Find the right component for a UI need' },
];

export default function Home() {
  return (
    <div style={styles.page}>
      <main style={styles.main}>
        <div style={styles.badge}>MCP Server</div>
        <h1 style={styles.title}>ProtoLab</h1>
        <p style={styles.subtitle}>
          Remote MCP server for the <strong>Ink Design System</strong>.
          <br />
          63 components. 8 tools. 3 prompts. One URL.
        </p>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Quick Start</h2>
          <p style={styles.instructions}>
            Add this to your MCP client config (Claude Code, v0, Cursor, Claude
            Desktop):
          </p>
          <pre style={styles.code}>
{JSON.stringify(
  { mcpServers: { protolab: { url: ENDPOINT } } },
  null,
  2
)}
          </pre>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Tools</h2>
          <div style={styles.grid}>
            {tools.map((t) => (
              <div key={t.name} style={styles.card}>
                <code style={styles.toolName}>{t.name}</code>
                <p style={styles.cardDesc}>{t.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Prompts</h2>
          <div style={styles.grid}>
            {prompts.map((p) => (
              <div key={p.name} style={styles.card}>
                <code style={styles.toolName}>{p.name}</code>
                <p style={styles.cardDesc}>{p.desc}</p>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Endpoint</h2>
          <pre style={styles.code}>POST {ENDPOINT}</pre>
          <p style={styles.muted}>
            Supports MCP Streamable HTTP transport. No API key required.
          </p>
        </section>

        <footer style={styles.footer}>
          Built on the{' '}
          <strong>Ink Design System</strong> — 6-layer component architecture
          from tokens to layouts.
        </footer>
      </main>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0a0a',
    color: '#ededed',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  main: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '80px 24px',
  },
  badge: {
    display: 'inline-block',
    padding: '4px 12px',
    borderRadius: 999,
    border: '1px solid #333',
    fontSize: 12,
    fontWeight: 500,
    color: '#888',
    marginBottom: 16,
    letterSpacing: '0.05em',
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 48,
    fontWeight: 700,
    margin: '0 0 12px',
    letterSpacing: '-0.02em',
  },
  subtitle: {
    fontSize: 18,
    lineHeight: 1.6,
    color: '#999',
    margin: '0 0 48px',
  },
  section: {
    marginBottom: 48,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 600,
    marginBottom: 16,
    color: '#ededed',
  },
  instructions: {
    fontSize: 14,
    color: '#888',
    marginBottom: 12,
  },
  code: {
    background: '#141414',
    border: '1px solid #222',
    borderRadius: 8,
    padding: '16px 20px',
    fontSize: 13,
    fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, monospace',
    overflowX: 'auto',
    display: 'block',
    color: '#c9d1d9',
    lineHeight: 1.5,
    whiteSpace: 'pre',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: 12,
  },
  card: {
    background: '#141414',
    border: '1px solid #222',
    borderRadius: 8,
    padding: '14px 16px',
  },
  toolName: {
    fontSize: 13,
    fontFamily: '"SF Mono", "Fira Code", Menlo, monospace',
    color: '#58a6ff',
  },
  cardDesc: {
    fontSize: 13,
    color: '#888',
    margin: '6px 0 0',
    lineHeight: 1.4,
  },
  muted: {
    fontSize: 13,
    color: '#666',
    marginTop: 8,
  },
  footer: {
    marginTop: 64,
    paddingTop: 24,
    borderTop: '1px solid #222',
    fontSize: 13,
    color: '#666',
    lineHeight: 1.5,
  },
};
