'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

/* ═══════════════════════════════════════
   Constants
   ═══════════════════════════════════════ */

const ENDPOINT = 'https://protolab-mcp.vercel.app/api/mcp';

const ASCII_ART = [
  '  ██████╗ ██████╗  ██████╗ ████████╗ ██████╗ ██╗      █████╗ ██████╗ ',
  '  ██╔══██╗██╔══██╗██╔═══██╗╚══██╔══╝██╔═══██╗██║     ██╔══██╗██╔══██╗',
  '  ██████╔╝██████╔╝██║   ██║   ██║   ██║   ██║██║     ███████║██████╔╝',
  '  ██╔═══╝ ██╔══██╗██║   ██║   ██║   ██║   ██║██║     ██╔══██║██╔══██╗',
  '  ██║     ██║  ██║╚██████╔╝   ██║   ╚██████╔╝███████╗██║  ██║██████╔╝',
  '  ╚═╝     ╚═╝  ╚═╝ ╚═════╝    ╚═╝    ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═════╝ ',
];

const TERMINAL_LINES = [
  '$ protolab',
  '',
  ...ASCII_ART,
  '',
  '  Ink Design System → MCP Server',
  '  63 components · 8 tools · 3 prompts',
  '',
  '$ protolab status --verbose',
  '  ✓ server      online at protolab-mcp.vercel.app/api/mcp',
  '  ✓ components  63 loaded (tokens → layouts)',
  '  ✓ transport   Streamable HTTP',
  '',
];

const NAV_COMMANDS = [
  { label: 'setup', target: 'setup' },
  { label: 'examples', target: 'examples' },
  { label: 'about', target: 'about' },
];

const CLIENTS = [
  {
    id: 'claude-code',
    label: 'claude-code',
    file: '.mcp.json',
    config: JSON.stringify(
      { mcpServers: { 'ink-design-system': { url: ENDPOINT } } },
      null,
      2,
    ),
  },
  {
    id: 'cursor',
    label: 'cursor',
    file: '.cursor/mcp.json',
    config: JSON.stringify(
      { mcpServers: { 'ink-design-system': { url: ENDPOINT } } },
      null,
      2,
    ),
  },
  {
    id: 'windsurf',
    label: 'windsurf',
    file: '~/.codeium/windsurf/mcp_config.json',
    config: JSON.stringify(
      { mcpServers: { 'ink-design-system': { url: ENDPOINT } } },
      null,
      2,
    ),
  },
  {
    id: 'claude-desktop',
    label: 'claude-desktop',
    file: 'claude_desktop_config.json',
    config: JSON.stringify(
      {
        mcpServers: {
          'ink-design-system': {
            url: ENDPOINT,
            transport: 'streamable-http',
          },
        },
      },
      null,
      2,
    ),
  },
];

const EXAMPLES = [
  { name: 'agreements-list', prompt: 'Build me an agreements list page with search, filters, and a data table' },
  { name: 'settings-page', prompt: 'I need a settings page with sidebar navigation and form sections for profile, notifications, and security' },
  { name: 'dashboard', prompt: 'Create a dashboard with 4 KPI stat cards and a recent activity table' },
  { name: 'detail-view', prompt: 'Build an agreement detail page with a status badge, document info, and action buttons' },
  { name: 'error-page', prompt: 'Design a 404 error page with a message and a button to go back home' },
  { name: 'template-gallery', prompt: 'Build a template gallery page with cards showing template previews and a search bar' },
];

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

const isCmd = (l: string) => l.startsWith('$ ');
const isAscii = (l: string) => /[█╗╔╝╚═║]/.test(l);

/* ═══════════════════════════════════════
   Command Processor
   ═══════════════════════════════════════ */

type CmdResult = { lines: string[]; scrollTo?: string; clear?: boolean };

function processCommand(raw: string): CmdResult {
  const cmd = raw.trim().toLowerCase();

  if (!cmd) return { lines: [] };

  if (cmd === 'help') {
    return {
      lines: [
        '',
        '  Available commands:',
        '',
        '    help        show this message',
        '    setup       jump to setup instructions',
        '    examples    browse example prompts',
        '    about       learn what makes it work',
        '    clear       clear terminal',
        '',
      ],
    };
  }
  if (cmd === 'setup' || cmd.startsWith('setup ')) {
    return { lines: ['  → scrolling to setup...', ''], scrollTo: 'setup' };
  }
  if (cmd === 'examples') {
    return { lines: ['  → scrolling to examples...', ''], scrollTo: 'examples' };
  }
  if (cmd === 'about') {
    return { lines: ['  → scrolling to about...', ''], scrollTo: 'about' };
  }
  if (cmd === 'clear') {
    return { lines: [], clear: true };
  }
  if (cmd === 'whoami') {
    return {
      lines: [
        '  Built by Akshat Mishra',
        '  Design Systems × Developer Tools',
        '',
      ],
    };
  }
  if (cmd.startsWith('sudo')) {
    return { lines: ['  Permission denied. This is a read-only terminal.', ''] };
  }
  if (cmd === 'status') {
    return {
      lines: [
        '  ✓ server      online at protolab-mcp.vercel.app/api/mcp',
        '  ✓ components  63 loaded (tokens → layouts)',
        '  ✓ transport   Streamable HTTP',
        '',
      ],
    };
  }

  return {
    lines: [
      `  command not found: ${cmd}`,
      '  Type "help" for available commands.',
      '',
    ],
  };
}

/* ═══════════════════════════════════════
   Theme Hook
   ═══════════════════════════════════════ */

function useTheme() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  useEffect(() => {
    const saved = localStorage.getItem('protolab-theme') as 'dark' | 'light' | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  const toggle = useCallback(() => {
    setTheme((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('protolab-theme', next);
      return next;
    });
  }, []);

  return { theme, toggle };
}

/* ═══════════════════════════════════════
   Typewriter Hook
   ═══════════════════════════════════════ */

function useTypewriter(sequence: string[]) {
  const [lines, setLines] = useState<string[]>([]);
  const [typing, setTyping] = useState('');
  const [done, setDone] = useState(false);
  const skipRef = useRef(false);

  const skip = useCallback(() => {
    skipRef.current = true;
    setLines([...sequence]);
    setTyping('');
    setDone(true);
  }, [sequence]);

  useEffect(() => {
    skipRef.current = false;
    let cancelled = false;
    let tid: ReturnType<typeof setTimeout>;

    const wait = (ms: number) =>
      new Promise<void>((r) => {
        tid = setTimeout(r, ms);
      });

    async function run() {
      await wait(400);

      for (let i = 0; i < sequence.length; i++) {
        if (cancelled || skipRef.current) return;
        const line = sequence[i];

        if (isCmd(line)) {
          for (let j = 1; j <= line.length; j++) {
            if (cancelled || skipRef.current) return;
            setTyping(line.slice(0, j));
            await wait(30 + Math.random() * 25);
          }
          setTyping('');
          setLines((p) => [...p, line]);
          await wait(300);
        } else if (isAscii(line)) {
          setLines((p) => [...p, line]);
          await wait(18);
        } else if (line === '') {
          setLines((p) => [...p, line]);
          await wait(10);
        } else if (line.includes('✓')) {
          setLines((p) => [...p, line]);
          await wait(120);
        } else {
          setLines((p) => [...p, line]);
          await wait(60);
        }
      }

      if (!cancelled && !skipRef.current) setDone(true);
    }

    run();
    return () => {
      cancelled = true;
      clearTimeout(tid);
    };
  }, [sequence]);

  return { lines, typing, done, skip };
}

/* ═══════════════════════════════════════
   Line Renderer
   ═══════════════════════════════════════ */

function TermLine({ text }: { text: string }) {
  if (text === '') return <br />;

  if (isCmd(text)) {
    return (
      <div style={st.line}>
        <span style={{ color: 'var(--t-green)' }}>$ </span>
        <span style={{ color: 'var(--t-text-bright)' }}>{text.slice(2)}</span>
      </div>
    );
  }

  if (isAscii(text)) {
    return (
      <div
        className="ascii-art"
        style={{ ...st.line, color: 'var(--t-blue)', lineHeight: '1.15', opacity: 0.45 }}
      >
        {text}
      </div>
    );
  }

  if (text.includes('✓')) {
    const m = text.match(/^(\s*)(✓)(\s+\S+)(\s+)(.*)/);
    if (m) {
      return (
        <div style={st.line}>
          {m[1]}
          <span style={{ color: 'var(--t-green)' }}>{m[2]}</span>
          <span style={{ color: 'var(--t-text-dim)' }}>{m[3]}</span>
          {m[4]}
          <span>{m[5]}</span>
        </div>
      );
    }
  }

  if (text.includes('→') || text.includes('·')) {
    return (
      <div style={{ ...st.line, color: 'var(--t-amber)' }}>{text}</div>
    );
  }

  return <div style={st.line}>{text}</div>;
}

/* ═══════════════════════════════════════
   JSON Syntax Highlighter
   ═══════════════════════════════════════ */

function HighlightedJSON({ code }: { code: string }) {
  return (
    <>
      {code.split('\n').map((line, i) => (
        <div key={i} style={{ minHeight: '1.4em' }}>
          <JSONLine text={line} />
        </div>
      ))}
    </>
  );
}

function JSONLine({ text }: { text: string }) {
  // key: "value"
  const kv = text.match(/^(\s*)"([^"]+)"(\s*:\s*)"([^"]*)"(.*)/);
  if (kv) {
    return (
      <>
        {kv[1]}
        <span style={{ color: 'var(--t-blue)' }}>&quot;{kv[2]}&quot;</span>
        <span style={{ color: 'var(--t-text-dim)' }}>{kv[3]}</span>
        <span style={{ color: 'var(--t-green)' }}>&quot;{kv[4]}&quot;</span>
        <span style={{ color: 'var(--t-text-dim)' }}>{kv[5]}</span>
      </>
    );
  }

  // key: { or key: [
  const ko = text.match(/^(\s*)"([^"]+)"(\s*:\s*)(.*)/);
  if (ko) {
    return (
      <>
        {ko[1]}
        <span style={{ color: 'var(--t-blue)' }}>&quot;{ko[2]}&quot;</span>
        <span style={{ color: 'var(--t-text-dim)' }}>{ko[3]}{ko[4]}</span>
      </>
    );
  }

  // braces / brackets
  if (/^\s*[{}[\],]/.test(text)) {
    return <span style={{ color: 'var(--t-text-dim)' }}>{text}</span>;
  }

  return <>{text}</>;
}

/* ═══════════════════════════════════════
   Components
   ═══════════════════════════════════════ */

function CopyButton({ text, label = 'copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [text]);

  return (
    <button onClick={handleCopy} className="copy-btn" style={st.copyBtn}>
      {copied ? (
        <span style={{ color: 'var(--t-green)' }}>copied ✓</span>
      ) : (
        <span>{label}</span>
      )}
    </button>
  );
}

/* ─── Terminal Hero ─── */

function TerminalHero({ theme, onToggleTheme }: { theme: 'dark' | 'light'; onToggleTheme: () => void }) {
  const { lines: introLines, typing, done, skip } = useTypewriter(TERMINAL_LINES);
  const [extraLines, setExtraLines] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const [showIntro, setShowIntro] = useState(true);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const visibleLines = [...(showIntro ? introLines : []), ...extraLines];

  // Auto-scroll terminal
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [visibleLines, typing, extraLines]);

  // Auto-focus input when animation completes
  useEffect(() => {
    if (done) inputRef.current?.focus();
  }, [done]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input;
    setInput('');
    const result = processCommand(cmd);

    if (result.clear) {
      setShowIntro(false);
      setExtraLines([]);
      return;
    }

    setExtraLines((prev) => [...prev, `$ ${cmd}`, ...result.lines]);

    if (result.scrollTo) {
      setTimeout(() => scrollTo(result.scrollTo!), 300);
    }
  };

  const focusInput = () => {
    if (done) inputRef.current?.focus();
  };

  return (
    <section style={st.heroSection}>
      <div style={st.terminal} onClick={!done ? skip : focusInput}>
        {/* Title bar */}
        <div style={st.titleBar}>
          <div style={st.dots}>
            <span style={{ ...st.dot, background: '#FF5F57' }} />
            <span style={{ ...st.dot, background: '#FFBD2E' }} />
            <span style={{ ...st.dot, background: '#28CA41' }} />
          </div>
          <div style={st.titleCenter}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/docusign-logo.svg" alt="Docusign" style={st.titleLogo} />
            <span style={st.titleText}>protolab — zsh — 80×24</span>
          </div>
          <button
            className="theme-toggle"
            onClick={(e) => { e.stopPropagation(); onToggleTheme(); }}
            style={st.themeToggle}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? '☀' : '☾'}
          </button>
        </div>

        {/* Body */}
        <div ref={bodyRef} className="term-body" style={st.termBody}>
          {visibleLines.map((line, i) => (
            <TermLine key={i} text={line} />
          ))}

          {/* Currently typing (during animation) */}
          {typing && (
            <div style={st.line}>
              <span style={{ color: 'var(--t-green)' }}>$ </span>
              <span style={{ color: 'var(--t-text-bright)' }}>{typing.slice(2)}</span>
              <span style={st.cursor}>▋</span>
            </div>
          )}

          {/* Interactive input (after animation) */}
          {done && !typing && (
            <form onSubmit={handleSubmit} style={st.inputLine}>
              <span style={{ color: 'var(--t-green)' }}>$ </span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                style={st.termInput}
                spellCheck={false}
                autoComplete="off"
                autoCapitalize="off"
                aria-label="Terminal input"
              />
            </form>
          )}
        </div>

        {/* Nav commands */}
        {done && (
          <div style={st.commandBar}>
            {NAV_COMMANDS.map((c) => (
              <button
                key={c.label}
                className="term-cmd"
                onClick={(e) => {
                  e.stopPropagation();
                  scrollTo(c.target);
                }}
                style={st.cmdBtn}
              >
                <span style={{ color: 'var(--t-text-dim)' }}>[</span>
                {c.label}
                <span style={{ color: 'var(--t-text-dim)' }}>]</span>
              </button>
            ))}
            <span style={st.cmdHint}>or type a command</span>
          </div>
        )}
      </div>

      {/* Skip hint / scroll indicator */}
      {!done && <div style={st.skipHint}>click to skip</div>}
      {done && (
        <button
          className="scroll-more"
          onClick={() => scrollTo('setup')}
          style={st.scrollMore}
        >
          ↓ scroll for more
        </button>
      )}
    </section>
  );
}

/* ─── Section Header ─── */

function SectionHeader({ command }: { command: string }) {
  return (
    <div style={st.sectionHeader}>
      <span style={{ color: 'var(--t-green)' }}>$ </span>
      <span style={{ color: 'var(--t-text-bright)' }}>protolab {command}</span>
      <div style={st.sectionRule} />
    </div>
  );
}

/* ─── Setup ─── */

function SetupSection() {
  const [active, setActive] = useState('claude-code');
  const client = CLIENTS.find((c) => c.id === active)!;

  return (
    <section id="setup" style={st.section}>
      <SectionHeader command="setup" />

      <div style={st.tabs}>
        {CLIENTS.map((c) => (
          <button
            key={c.id}
            className="tab-btn"
            onClick={() => setActive(c.id)}
            style={{
              ...st.tab,
              ...(active === c.id ? st.tabActive : {}),
            }}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div style={st.codeBlock}>
        <div style={st.codeHeader}>
          <span style={st.codeComment}># {client.file}</span>
          <CopyButton text={client.config} />
        </div>
        <pre style={st.pre}>
          <HighlightedJSON code={client.config} />
        </pre>
      </div>

      <p style={st.hint}>Paste, restart, done.</p>
    </section>
  );
}

/* ─── Examples ─── */

function ExamplesSection() {
  const [copiedName, setCopiedName] = useState<string | null>(null);

  const copy = (name: string, prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedName(name);
    setTimeout(() => setCopiedName(null), 2000);
  };

  return (
    <section id="examples" style={st.section}>
      <SectionHeader command="examples" />

      <div style={st.exList}>
        {EXAMPLES.map((ex) => (
          <button
            key={ex.name}
            className="example-row"
            onClick={() => copy(ex.name, ex.prompt)}
            style={st.exRow}
          >
            <span style={st.exName}>{ex.name}</span>
            <span style={st.exPrompt}>&ldquo;{ex.prompt}&rdquo;</span>
            {copiedName === ex.name && (
              <span style={st.exCopied}>copied ✓</span>
            )}
          </button>
        ))}
      </div>

      <p style={st.hint}>Click any row to copy the prompt.</p>
    </section>
  );
}

/* ─── About ─── */

function AboutSection() {
  const items = [
    { key: 'components', val: 'Inspired by Ink, optimized for prototyping' },
    { key: 'layouts', val: 'Knows Docusign page composition patterns' },
    { key: 'iteration', val: '"Move the filters" → rebuilt in seconds' },
  ];

  return (
    <section id="about" style={st.section}>
      <SectionHeader command="about" />

      <div style={st.aboutList}>
        {items.map((item) => (
          <div key={item.key} style={st.aboutRow}>
            <span style={st.aboutKey}>{item.key}</span>
            <span style={st.aboutVal}>{item.val}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════
   Page
   ═══════════════════════════════════════ */

export default function Home() {
  const { theme, toggle } = useTheme();

  return (
    <div>
      <TerminalHero theme={theme} onToggleTheme={toggle} />

      <div style={st.content}>
        <SetupSection />
        <ExamplesSection />
        <AboutSection />

        <footer style={st.footer}>
          <span style={{ color: 'var(--t-text-dim)' }}>protolab v1.0.0</span>
          <span style={{ color: 'var(--t-text-muted)' }}>·</span>
          <span style={{ color: 'var(--t-text-dim)' }}>built by <span style={{ color: 'var(--t-green)' }}>Akshat Mishra</span></span>
          <span style={{ color: 'var(--t-text-muted)' }}>·</span>
          <button
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            style={st.footerLink}
          >
            ↑ top
          </button>
        </footer>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════
   Styles
   ═══════════════════════════════════════ */

const st: Record<string, React.CSSProperties> = {
  /* Hero */
  heroSection: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 24px',
  },

  /* Terminal window */
  terminal: {
    width: '100%',
    maxWidth: 780,
    borderRadius: 'var(--t-radius)',
    overflow: 'hidden',
    border: '1px solid var(--t-border)',
    boxShadow: 'var(--t-shadow-terminal)',
  },
  titleBar: {
    display: 'flex',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--t-chrome)',
    borderBottom: '1px solid var(--t-border-subtle)',
  },
  dots: { display: 'flex', gap: 8, marginRight: 16 },
  dot: { width: 12, height: 12, borderRadius: '50%' },
  titleCenter: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  titleLogo: {
    height: 14,
    opacity: 0.6,
    filter: 'var(--t-logo-filter, none)',
  },
  titleText: {
    textAlign: 'center' as const,
    fontSize: 12,
    color: 'var(--t-text-dim)',
    letterSpacing: '0.02em',
  },
  themeToggle: {
    width: 32,
    height: 24,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
    border: '1px solid var(--t-border)',
    borderRadius: 'var(--t-radius-sm)',
    color: 'var(--t-text-dim)',
    fontSize: 14,
    cursor: 'pointer',
    fontFamily: 'var(--t-font)',
    transition: 'border-color 0.15s, color 0.15s',
    lineHeight: 1,
  },
  termBody: {
    padding: '20px 24px',
    background: 'var(--t-surface)',
    fontSize: 14,
    lineHeight: 1.5,
    fontFamily: 'var(--t-font)',
    minHeight: 400,
    overflowY: 'auto' as const,
  },
  line: { whiteSpace: 'pre' as const, minHeight: '1.5em' },
  cursor: {
    animation: 'blink 1s step-end infinite',
    color: 'var(--t-green)',
  },

  /* Command bar */
  commandBar: {
    display: 'flex',
    gap: 4,
    padding: '12px 24px',
    background: 'var(--t-chrome)',
    borderTop: '1px solid var(--t-border-subtle)',
    animation: 'fadeInUp 0.4s ease',
  },
  cmdBtn: {
    padding: '6px 14px',
    background: 'transparent',
    border: 'none',
    color: 'var(--t-blue)',
    fontSize: 13,
    fontFamily: 'var(--t-font)',
    cursor: 'pointer',
    borderRadius: 'var(--t-radius-sm)',
    transition: 'background 0.15s',
  },
  skipHint: {
    marginTop: 16,
    fontSize: 12,
    color: 'var(--t-text-muted)',
    opacity: 0,
    animationName: 'fadeInUp',
    animationDuration: '0.3s',
    animationTimingFunction: 'ease',
    animationDelay: '2s',
    animationFillMode: 'forwards' as const,
  },

  /* Interactive input */
  inputLine: {
    display: 'flex',
    alignItems: 'center',
    whiteSpace: 'pre' as const,
    minHeight: '1.5em',
  },
  termInput: {
    background: 'transparent',
    border: 'none',
    outline: 'none',
    color: 'var(--t-text-bright)',
    fontSize: 14,
    fontFamily: 'var(--t-font)',
    flex: 1,
    caretColor: 'var(--t-green)',
    lineHeight: 1.5,
    padding: 0,
  },
  cmdHint: {
    marginLeft: 'auto',
    fontSize: 12,
    color: 'var(--t-text-muted)',
    fontStyle: 'italic' as const,
  },

  /* Scroll indicator */
  scrollMore: {
    marginTop: 24,
    padding: '8px 16px',
    background: 'none',
    border: 'none',
    color: 'var(--t-text-dim)',
    fontSize: 13,
    fontFamily: 'var(--t-font)',
    cursor: 'pointer',
    animation: 'pulse 2.5s ease-in-out infinite, gentleBounce 2.5s ease-in-out infinite',
    transition: 'color 0.15s',
    letterSpacing: '0.05em',
  },

  /* Content */
  content: {
    maxWidth: 720,
    margin: '0 auto',
    padding: '0 24px',
  },

  /* Sections */
  section: {
    paddingTop: 64,
    paddingBottom: 64,
    borderBottom: '1px solid var(--t-border-subtle)',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 600,
    marginBottom: 24,
  },
  sectionRule: {
    height: 1,
    background: 'var(--t-border)',
    marginTop: 12,
  },

  /* Tabs */
  tabs: {
    display: 'flex',
    gap: 2,
    borderBottom: '1px solid var(--t-border)',
    marginBottom: 0,
  },
  tab: {
    padding: '10px 18px',
    fontSize: 13,
    fontWeight: 500,
    color: 'var(--t-text-dim)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontFamily: 'var(--t-font)',
    transition: 'color 0.15s, border-color 0.15s',
  },
  tabActive: {
    color: 'var(--t-text-bright)',
    borderBottomColor: 'var(--t-green)',
  },

  /* Code */
  codeBlock: {
    border: '1px solid var(--t-border)',
    borderTop: 'none',
    borderRadius: '0 0 var(--t-radius-sm) var(--t-radius-sm)',
    overflow: 'hidden',
    marginBottom: 16,
  },
  codeHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    background: 'var(--t-chrome)',
    borderBottom: '1px solid var(--t-border-subtle)',
  },
  codeComment: {
    fontSize: 12,
    color: 'var(--t-text-muted)',
  },
  pre: {
    background: 'var(--t-surface)',
    padding: '16px 20px',
    fontSize: 13,
    fontFamily: 'var(--t-font)',
    overflowX: 'auto' as const,
    color: 'var(--t-text)',
    lineHeight: 1.6,
    margin: 0,
  },
  hint: {
    fontSize: 13,
    color: 'var(--t-text-dim)',
  },

  /* Copy */
  copyBtn: {
    padding: '4px 10px',
    fontSize: 12,
    color: 'var(--t-text-dim)',
    background: 'transparent',
    border: '1px solid var(--t-border)',
    borderRadius: 'var(--t-radius-sm)',
    cursor: 'pointer',
    fontFamily: 'var(--t-font)',
    transition: 'border-color 0.15s, color 0.15s',
  },

  /* Examples */
  exList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    marginBottom: 16,
  },
  exRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 16,
    padding: '10px 8px 10px 20px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--t-radius-sm)',
    cursor: 'pointer',
    fontFamily: 'var(--t-font)',
    fontSize: 13,
    textAlign: 'left' as const,
    color: 'var(--t-text)',
    transition: 'background 0.15s',
    width: '100%',
  },
  exName: {
    color: 'var(--t-cyan)',
    minWidth: 160,
    fontWeight: 500,
    flexShrink: 0,
  },
  exPrompt: {
    color: 'var(--t-text-dim)',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  exCopied: {
    color: 'var(--t-green)',
    fontSize: 12,
    flexShrink: 0,
  },

  /* About */
  aboutList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 16,
  },
  aboutRow: {
    display: 'flex',
    gap: 20,
    fontSize: 14,
    lineHeight: 1.6,
  },
  aboutKey: {
    color: 'var(--t-amber)',
    minWidth: 130,
    fontWeight: 500,
    flexShrink: 0,
  },
  aboutVal: {
    color: 'var(--t-text)',
  },

  /* Footer */
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    paddingTop: 32,
    paddingBottom: 48,
    fontSize: 13,
  },
  footerLink: {
    background: 'none',
    border: 'none',
    color: 'var(--t-blue)',
    cursor: 'pointer',
    fontFamily: 'var(--t-font)',
    fontSize: 13,
  },
};
