'use client';

import { useState, useEffect, useCallback } from 'react';

/* ═══════════════════════════════════════
   Types
   ═══════════════════════════════════════ */

interface DashboardData {
  http: {
    total: number;
    methods: Record<string, number>;
    statusCodes: Record<string, number>;
    durationBuckets: Record<string, number>;
    transport: { sse: number; jsonrpc: number; page: number };
  };
  tools: {
    total: number;
    stats: Array<{ tool: string; calls: number; errors: number; avgMs: number }>;
  };
  uniqueUsers: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
    wowGrowth: number | null;
    momGrowth: number | null;
  };
  uniqueSessions: {
    today: number;
    thisWeek: number;
    thisMonth: number;
    allTime: number;
  };
  components: Array<{ key: string; count: number }>;
  searches: Array<{ key: string; count: number }>;
  sessions: {
    total: number;
    clients: Array<{ key: string; count: number }>;
  };
  errors: {
    total: number;
    rate: string;
    recent: Array<{ ts: string; tool: string; message: string }>;
  };
  recentActivity: Array<Record<string, unknown>>;
  dailyTrend: Array<{ day: string; httpRequests: number; toolCalls: number; uniqueUsers: number }>;
  generatedAt: string;
}

interface ErrorData {
  error: string;
  setup: string[];
}

/* ═══════════════════════════════════════
   Helpers
   ═══════════════════════════════════════ */

const BLOCK_CHARS = ['', '\u2581', '\u2582', '\u2583', '\u2584', '\u2585', '\u2586', '\u2587', '\u2588'];

function bar(value: number, max: number, width = 20): string {
  if (max === 0) return '';
  const filled = Math.round((value / max) * width);
  return '\u2588'.repeat(filled) + '\u2591'.repeat(width - filled);
}

function sparkline(values: number[]): string {
  const max = Math.max(...values, 1);
  return values.map((v) => BLOCK_CHARS[Math.round((v / max) * 8)] || ' ').join('');
}

function formatNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function growthArrow(pct: number | null): string {
  if (pct === null) return '--';
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return '0%';
}

function growthColor(pct: number | null): string {
  if (pct === null) return 'var(--t-text-dim)';
  if (pct > 0) return 'var(--t-green)';
  if (pct < 0) return 'var(--t-amber)';
  return 'var(--t-text-dim)';
}

function formatDay(day: string): string {
  // YYYYMMDD -> MM/DD
  return `${day.slice(4, 6)}/${day.slice(6, 8)}`;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
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
   Components
   ═══════════════════════════════════════ */

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={st.statCard}>
      <div style={st.statLabel}>{label}</div>
      <div style={st.statValue}>{value}</div>
      {sub && <div style={st.statSub}>{sub}</div>}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={st.sectionTitle}>
      <span style={{ color: 'var(--t-green)' }}>$ </span>
      <span style={{ color: 'var(--t-text-bright)' }}>{children}</span>
      <div style={st.sectionRule} />
    </div>
  );
}

/* ═══════════════════════════════════════
   Dashboard Page
   ═══════════════════════════════════════ */

export default function DashboardPage() {
  const { theme, toggle } = useTheme();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<ErrorData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async (retries = 2) => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const res = await fetch('/api/dashboard');
        const json = await res.json();
        if (res.ok) {
          setData(json);
          setError(null);
          return;
        }
        // On 503 (Redis not configured), don't retry
        if (res.status === 503) {
          setError(json);
          return;
        }
        // On 500, retry after brief delay
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        // Final attempt failed — show error but keep last-good data
        setError(json);
      } catch {
        if (attempt < retries) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        setError({ error: 'Failed to connect to dashboard', setup: [] });
      }
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  return (
    <div style={st.page}>
      {/* Header */}
      <header style={st.header}>
        <div style={st.headerLeft}>
          <a href="/" style={st.backLink}>{'<-'} protolab</a>
          <span style={st.headerTitle}>
            <span style={{ color: 'var(--t-green)' }}>$ </span>
            protolab dashboard
          </span>
        </div>
        <div style={st.headerRight}>
          {data && (
            <span style={st.refreshTime}>
              updated {timeAgo(data.generatedAt)}
            </span>
          )}
          <button onClick={toggle} style={st.themeToggle} aria-label="Toggle theme">
            {theme === 'dark' ? '\u2600' : '\u263E'}
          </button>
        </div>
      </header>

      {/* Loading */}
      {loading && (
        <div style={st.loadingWrap}>
          <span style={{ color: 'var(--t-green)' }}>Loading analytics</span>
          <span style={st.blink}>\u258B</span>
        </div>
      )}

      {/* Error / setup message */}
      {error && (
        <div style={st.errorWrap}>
          <div style={st.errorTitle}>
            <span style={{ color: 'var(--t-amber)' }}>[!]</span> {error.error}
          </div>
          {error.setup.length > 0 && (
            <div style={st.setupSteps}>
              {error.setup.map((step, i) => (
                <div key={i} style={st.setupStep}>{step}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Dashboard content */}
      {data && (
        <div style={st.content}>

          {/* ── Headline Stats ── */}
          <div style={st.statsRow}>
            <StatCard
              label="Unique Users"
              value={formatNum(data.uniqueUsers.thisMonth)}
              sub="this month"
            />
            <StatCard
              label="Total Requests"
              value={formatNum(data.http.total)}
            />
            <StatCard
              label="Tool Calls"
              value={formatNum(data.tools.total)}
            />
            <StatCard
              label="Error Rate"
              value={data.errors.rate}
              sub={`${data.errors.total} total`}
            />
          </div>

          {/* ── Adoption & Growth ── */}
          <SectionTitle>adoption --verbose</SectionTitle>
          <div style={st.panel}>
            <div style={{ ...st.adoptionLabel, marginBottom: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--t-cyan)' }}>unique users</span>
              <span style={{ color: 'var(--t-text-muted)', margin: '0 6px' }}>(by IP)</span>
            </div>
            <div style={st.adoptionGrid}>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>today</span>
                <span style={st.adoptionValue}>{data.uniqueUsers.today}</span>
              </div>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>this week</span>
                <span style={st.adoptionValue}>{data.uniqueUsers.thisWeek}</span>
              </div>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>this month</span>
                <span style={st.adoptionValue}>{data.uniqueUsers.thisMonth}</span>
              </div>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>all-time</span>
                <span style={st.adoptionValue}>{data.uniqueUsers.allTime}</span>
              </div>
            </div>
            <div style={{ ...st.adoptionLabel, marginBottom: 8, marginTop: 16, paddingTop: 12, borderTop: '1px solid var(--t-border-subtle)', fontSize: 12 }}>
              <span style={{ color: 'var(--t-cyan)' }}>unique sessions</span>
              <span style={{ color: 'var(--t-text-muted)', margin: '0 6px' }}>(MCP connections)</span>
            </div>
            <div style={st.adoptionGrid}>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>today</span>
                <span style={st.adoptionValue}>{data.uniqueSessions?.today ?? 0}</span>
              </div>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>this week</span>
                <span style={st.adoptionValue}>{data.uniqueSessions?.thisWeek ?? 0}</span>
              </div>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>this month</span>
                <span style={st.adoptionValue}>{data.uniqueSessions?.thisMonth ?? 0}</span>
              </div>
              <div style={st.adoptionItem}>
                <span style={st.adoptionLabel}>all-time</span>
                <span style={st.adoptionValue}>{data.uniqueSessions?.allTime ?? 0}</span>
              </div>
            </div>
            <div style={st.growthRow}>
              <span style={st.growthLabel}>WoW:</span>
              <span style={{ ...st.growthValue, color: growthColor(data.uniqueUsers.wowGrowth) }}>
                {growthArrow(data.uniqueUsers.wowGrowth)}
              </span>
              <span style={{ ...st.growthLabel, marginLeft: 24 }}>MoM:</span>
              <span style={{ ...st.growthValue, color: growthColor(data.uniqueUsers.momGrowth) }}>
                {growthArrow(data.uniqueUsers.momGrowth)}
              </span>
            </div>
            <div style={st.sparkWrap}>
              <span style={st.sparkLabel}>14d unique users</span>
              <span style={st.spark}>
                {sparkline(data.dailyTrend.map((d) => d.uniqueUsers))}
              </span>
            </div>
          </div>

          {/* ── Usage Trend ── */}
          <SectionTitle>trend --days 14</SectionTitle>
          <div style={st.panel}>
            <div style={st.trendLegend}>
              <span><span style={{ color: 'var(--t-blue)' }}>{'\u2588'}</span> HTTP requests</span>
              <span><span style={{ color: 'var(--t-green)' }}>{'\u2588'}</span> Tool calls</span>
            </div>
            {(() => {
              const maxHttp = Math.max(...data.dailyTrend.map((d) => d.httpRequests), 1);
              const maxTool = Math.max(...data.dailyTrend.map((d) => d.toolCalls), 1);
              const maxAll = Math.max(maxHttp, maxTool);
              return data.dailyTrend.map((d) => (
                <div key={d.day} style={st.trendRow}>
                  <span style={st.trendDay}>{formatDay(d.day)}</span>
                  <div style={st.trendBars}>
                    <div style={{ ...st.trendBar, color: 'var(--t-blue)', width: '100%' }}>
                      {bar(d.httpRequests, maxAll, 30)}
                    </div>
                    <div style={{ ...st.trendBar, color: 'var(--t-green)', width: '100%' }}>
                      {bar(d.toolCalls, maxAll, 30)}
                    </div>
                  </div>
                  <span style={st.trendCount}>{d.httpRequests}/{d.toolCalls}</span>
                </div>
              ));
            })()}
          </div>

          {/* ── Tool Usage ── */}
          <SectionTitle>tools --stats</SectionTitle>
          <div style={st.panel}>
            {data.tools.stats.length > 0 ? (
              <>
                <div style={st.tableHeader}>
                  <span style={{ width: 180 }}>tool</span>
                  <span style={{ flex: 1 }}>usage</span>
                  <span style={{ width: 60, textAlign: 'right' }}>calls</span>
                  <span style={{ width: 60, textAlign: 'right' }}>errors</span>
                  <span style={{ width: 60, textAlign: 'right' }}>avg ms</span>
                </div>
                {(() => {
                  const maxCalls = Math.max(...data.tools.stats.map((t) => t.calls), 1);
                  return data.tools.stats.map((t) => (
                    <div key={t.tool} style={st.tableRow}>
                      <span style={{ width: 180, color: 'var(--t-cyan)' }}>{t.tool}</span>
                      <span style={{ flex: 1, color: 'var(--t-blue)' }}>
                        {bar(t.calls, maxCalls, 24)}
                      </span>
                      <span style={{ width: 60, textAlign: 'right' }}>{t.calls}</span>
                      <span style={{ width: 60, textAlign: 'right', color: t.errors > 0 ? 'var(--t-amber)' : 'var(--t-text-dim)' }}>
                        {t.errors}
                      </span>
                      <span style={{ width: 60, textAlign: 'right', color: 'var(--t-text-dim)' }}>
                        {t.avgMs}
                      </span>
                    </div>
                  ));
                })()}
              </>
            ) : (
              <div style={st.emptyState}>No tool calls recorded yet</div>
            )}
          </div>

          {/* ── Status Codes ── */}
          <SectionTitle>status --codes</SectionTitle>
          <div style={st.panel}>
            {(() => {
              const codes = data.http.statusCodes;
              const entries = Object.entries(codes).sort(([a], [b]) => a.localeCompare(b));
              if (entries.length === 0) return <div style={st.emptyState}>No status codes recorded yet</div>;
              const maxCode = Math.max(...entries.map(([, v]) => v), 1);
              return entries.map(([code, count]) => {
                const color = code.startsWith('2') ? 'var(--t-green)' :
                              code.startsWith('3') ? 'var(--t-blue)' :
                              code.startsWith('4') ? 'var(--t-amber)' :
                              'var(--t-red, var(--t-amber))';
                return (
                  <div key={code} style={st.transportRow}>
                    <span style={{ width: 60, color, fontWeight: 600 }}>{code}</span>
                    <span style={{ flex: 1, color }}>
                      {bar(count, maxCode, 30)}
                    </span>
                    <span style={{ width: 50, textAlign: 'right' }}>{count}</span>
                    <span style={{ width: 50, textAlign: 'right', color: 'var(--t-text-dim)' }}>
                      {data.http.total > 0 ? `${Math.round((count / data.http.total) * 100)}%` : '0%'}
                    </span>
                  </div>
                );
              });
            })()}
          </div>

          {/* ── HTTP Methods ── */}
          <SectionTitle>methods --breakdown</SectionTitle>
          <div style={st.panel}>
            {(() => {
              const methods = data.http.methods;
              const entries = Object.entries(methods).filter(([, v]) => v > 0);
              if (entries.length === 0) return <div style={st.emptyState}>No HTTP methods recorded yet</div>;
              const maxMethod = Math.max(...entries.map(([, v]) => v), 1);
              return entries.map(([method, count]) => (
                <div key={method} style={st.transportRow}>
                  <span style={{ width: 90, color: 'var(--t-cyan)', fontWeight: 600 }}>{method}</span>
                  <span style={{ flex: 1, color: 'var(--t-blue)' }}>
                    {bar(count, maxMethod, 30)}
                  </span>
                  <span style={{ width: 50, textAlign: 'right' }}>{count}</span>
                  <span style={{ width: 50, textAlign: 'right', color: 'var(--t-text-dim)' }}>
                    {data.http.total > 0 ? `${Math.round((count / data.http.total) * 100)}%` : '0%'}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* ── Transport ── */}
          <SectionTitle>transport --breakdown</SectionTitle>
          <div style={st.panel}>
            {(() => {
              const { sse, jsonrpc, page } = data.http.transport;
              const total = sse + jsonrpc + page || 1;
              const items = [
                { label: 'SSE', count: sse, color: 'var(--t-green)' },
                { label: 'JSON-RPC', count: jsonrpc, color: 'var(--t-blue)' },
                { label: 'Page', count: page, color: 'var(--t-amber)' },
              ];
              return items.map((item) => (
                <div key={item.label} style={st.transportRow}>
                  <span style={{ width: 90, color: item.color }}>{item.label}</span>
                  <span style={{ flex: 1, color: item.color }}>
                    {bar(item.count, total, 30)}
                  </span>
                  <span style={{ width: 50, textAlign: 'right' }}>{item.count}</span>
                  <span style={{ width: 50, textAlign: 'right', color: 'var(--t-text-dim)' }}>
                    {total > 0 ? `${Math.round((item.count / total) * 100)}%` : '0%'}
                  </span>
                </div>
              ));
            })()}
          </div>

          {/* ── Response Time ── */}
          <SectionTitle>latency --histogram</SectionTitle>
          <div style={st.panel}>
            {(() => {
              const buckets = data.http.durationBuckets;
              const order = ['<100ms', '100-500ms', '500-1000ms', '>1000ms'];
              const vals = order.map((k) => Number(buckets[k]) || 0);
              const maxB = Math.max(...vals, 1);
              return order.map((label, i) => (
                <div key={label} style={st.transportRow}>
                  <span style={{ width: 100, color: 'var(--t-text-dim)' }}>{label}</span>
                  <span style={{ flex: 1, color: i < 2 ? 'var(--t-green)' : 'var(--t-amber)' }}>
                    {bar(vals[i], maxB, 30)}
                  </span>
                  <span style={{ width: 50, textAlign: 'right' }}>{vals[i]}</span>
                </div>
              ));
            })()}
          </div>

          {/* ── Top Components ── */}
          <SectionTitle>components --top 20</SectionTitle>
          <div style={st.panel}>
            {data.components.length > 0 ? (
              (() => {
                const maxC = data.components[0]?.count || 1;
                return data.components.map((c) => (
                  <div key={c.key} style={st.transportRow}>
                    <span style={{ width: 180, color: 'var(--t-cyan)' }}>{c.key}</span>
                    <span style={{ flex: 1, color: 'var(--t-blue)' }}>
                      {bar(c.count, maxC, 24)}
                    </span>
                    <span style={{ width: 50, textAlign: 'right' }}>{c.count}</span>
                  </div>
                ));
              })()
            ) : (
              <div style={st.emptyState}>No component lookups yet</div>
            )}
          </div>

          {/* ── Top Searches ── */}
          <SectionTitle>searches --top 20</SectionTitle>
          <div style={st.panel}>
            {data.searches.length > 0 ? (
              data.searches.map((s, i) => (
                <div key={s.key} style={st.searchRow}>
                  <span style={{ width: 30, color: 'var(--t-text-dim)' }}>
                    {String(i + 1).padStart(2, ' ')}.
                  </span>
                  <span style={{ flex: 1 }}>{s.key}</span>
                  <span style={{ color: 'var(--t-text-dim)' }}>{s.count}</span>
                </div>
              ))
            ) : (
              <div style={st.emptyState}>No search queries yet</div>
            )}
          </div>

          {/* ── Client Breakdown ── */}
          <SectionTitle>sessions --clients</SectionTitle>
          <div style={st.panel}>
            <div style={st.clientHeader}>
              <span>Total sessions: {data.sessions.total}</span>
            </div>
            {data.sessions.clients.length > 0 ? (
              (() => {
                const maxS = data.sessions.clients[0]?.count || 1;
                return data.sessions.clients.map((c) => (
                  <div key={c.key} style={st.transportRow}>
                    <span style={{ width: 180, color: 'var(--t-cyan)' }}>{c.key}</span>
                    <span style={{ flex: 1, color: 'var(--t-green)' }}>
                      {bar(c.count, maxS, 24)}
                    </span>
                    <span style={{ width: 50, textAlign: 'right' }}>{c.count}</span>
                  </div>
                ));
              })()
            ) : (
              <div style={st.emptyState}>No client sessions yet</div>
            )}
          </div>

          {/* ── Recent Errors ── */}
          <SectionTitle>errors --recent</SectionTitle>
          <div style={st.panel}>
            {data.errors.recent.length > 0 ? (
              data.errors.recent.map((e, i) => (
                <div key={i} style={st.errorRow}>
                  <span style={st.errorTs}>{e.ts ? timeAgo(e.ts) : ''}</span>
                  <span style={st.errorTool}>{e.tool}</span>
                  <span style={st.errorMsg}>{e.message}</span>
                </div>
              ))
            ) : (
              <div style={{ ...st.emptyState, color: 'var(--t-green)' }}>No errors recorded</div>
            )}
          </div>

          {/* ── Activity Feed ── */}
          {data.recentActivity.length > 0 && (
            <>
              <SectionTitle>log --tail 30</SectionTitle>
              <div style={st.panel}>
                {data.recentActivity.map((evt, i) => {
                  const eventType = String(evt.event || '');
                  const colorMap: Record<string, string> = {
                    tool_call: 'var(--t-blue)',
                    http_request: 'var(--t-text-dim)',
                    error: 'var(--t-amber)',
                    session_start: 'var(--t-green)',
                    component_lookup: 'var(--t-cyan)',
                    search_query: 'var(--t-amber)',
                  };
                  const color = colorMap[eventType] || 'var(--t-text)';
                  const ts = evt.ts ? timeAgo(String(evt.ts)) : '';
                  const details = Object.entries(evt)
                    .filter(([k]) => k !== 'event' && k !== 'ts')
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' ');

                  return (
                    <div key={i} style={st.logRow}>
                      <span style={{ width: 65, color: 'var(--t-text-dim)', flexShrink: 0 }}>{ts}</span>
                      <span style={{ width: 130, color, flexShrink: 0 }}>{eventType}</span>
                      <span style={{ color: 'var(--t-text-dim)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {details}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* Footer */}
          <footer style={st.footer}>
            <span style={{ color: 'var(--t-text-dim)' }}>protolab dashboard v1.0.0</span>
            <span style={{ color: 'var(--t-text-muted)' }}>{'\u00b7'}</span>
            <span style={{ color: 'var(--t-text-dim)' }}>auto-refresh 30s</span>
            <span style={{ color: 'var(--t-text-muted)' }}>{'\u00b7'}</span>
            <a href="/" style={st.footerLink}>{'<-'} home</a>
          </footer>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════
   Styles
   ═══════════════════════════════════════ */

const st: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: 'var(--t-bg)',
    fontFamily: 'var(--t-font)',
    color: 'var(--t-text)',
    fontSize: 13,
  },

  /* Header */
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 24px',
    borderBottom: '1px solid var(--t-border)',
    background: 'var(--t-chrome)',
    position: 'sticky' as const,
    top: 0,
    zIndex: 10,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 20,
  },
  backLink: {
    color: 'var(--t-blue)',
    textDecoration: 'none',
    fontSize: 13,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: 600,
  },
  headerRight: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  refreshTime: {
    fontSize: 12,
    color: 'var(--t-text-muted)',
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
    lineHeight: 1,
  },

  /* Content */
  content: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '24px 24px 64px',
  },

  /* Loading */
  loadingWrap: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: '80px 24px',
    fontSize: 14,
  },
  blink: {
    animation: 'blink 1s step-end infinite',
    color: 'var(--t-green)',
  },

  /* Error */
  errorWrap: {
    maxWidth: 600,
    margin: '80px auto',
    padding: 24,
    border: '1px solid var(--t-border)',
    borderRadius: 'var(--t-radius)',
    background: 'var(--t-surface)',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: 600,
    marginBottom: 16,
  },
  setupSteps: {
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  setupStep: {
    color: 'var(--t-text-dim)',
    paddingLeft: 8,
  },

  /* Stats row */
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 12,
    marginBottom: 32,
  },
  statCard: {
    padding: '16px 20px',
    border: '1px solid var(--t-border)',
    borderRadius: 'var(--t-radius-sm)',
    background: 'var(--t-surface)',
  },
  statLabel: {
    fontSize: 11,
    color: 'var(--t-text-dim)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 700,
    color: 'var(--t-text-bright)',
    lineHeight: 1.2,
  },
  statSub: {
    fontSize: 11,
    color: 'var(--t-text-muted)',
    marginTop: 2,
  },

  /* Section titles */
  sectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    marginTop: 32,
    marginBottom: 12,
  },
  sectionRule: {
    height: 1,
    background: 'var(--t-border)',
    marginTop: 8,
  },

  /* Panel */
  panel: {
    border: '1px solid var(--t-border)',
    borderRadius: 'var(--t-radius-sm)',
    background: 'var(--t-surface)',
    padding: '16px 20px',
    marginBottom: 8,
    overflowX: 'auto' as const,
  },

  /* Adoption */
  adoptionGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: 16,
    marginBottom: 16,
  },
  adoptionItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
  },
  adoptionLabel: {
    fontSize: 11,
    color: 'var(--t-text-dim)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  adoptionValue: {
    fontSize: 20,
    fontWeight: 700,
    color: 'var(--t-text-bright)',
  },
  growthRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--t-border-subtle)',
  },
  growthLabel: {
    fontSize: 12,
    color: 'var(--t-text-dim)',
  },
  growthValue: {
    fontSize: 13,
    fontWeight: 600,
  },
  sparkWrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    paddingTop: 12,
    borderTop: '1px solid var(--t-border-subtle)',
  },
  sparkLabel: {
    fontSize: 11,
    color: 'var(--t-text-dim)',
    whiteSpace: 'nowrap',
  },
  spark: {
    fontSize: 16,
    color: 'var(--t-green)',
    letterSpacing: 1,
  },

  /* Trend */
  trendLegend: {
    display: 'flex',
    gap: 20,
    marginBottom: 12,
    fontSize: 12,
    color: 'var(--t-text-dim)',
  },
  trendRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
  },
  trendDay: {
    width: 50,
    color: 'var(--t-text-dim)',
    flexShrink: 0,
  },
  trendBars: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: 1,
  },
  trendBar: {
    whiteSpace: 'pre',
    fontSize: 10,
    lineHeight: 1.2,
  },
  trendCount: {
    width: 70,
    textAlign: 'right' as const,
    color: 'var(--t-text-dim)',
    fontSize: 11,
    flexShrink: 0,
  },

  /* Tool table */
  tableHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    marginBottom: 8,
    borderBottom: '1px solid var(--t-border-subtle)',
    color: 'var(--t-text-dim)',
    fontSize: 11,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  tableRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 24,
    whiteSpace: 'pre' as const,
  },

  /* Transport / histogram rows */
  transportRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 24,
    whiteSpace: 'pre' as const,
  },

  /* Search */
  searchRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
  },

  /* Empty state */
  emptyState: {
    color: 'var(--t-text-muted)',
    fontSize: 12,
    fontStyle: 'italic' as const,
    padding: '8px 0',
  },

  /* Client */
  clientHeader: {
    color: 'var(--t-text-dim)',
    marginBottom: 8,
  },

  /* Errors */
  errorRow: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    minHeight: 22,
    padding: '4px 0',
    borderBottom: '1px solid var(--t-border-subtle)',
  },
  errorTs: {
    width: 65,
    flexShrink: 0,
    color: 'var(--t-text-dim)',
    fontSize: 11,
  },
  errorTool: {
    width: 140,
    flexShrink: 0,
    color: 'var(--t-amber)',
  },
  errorMsg: {
    color: 'var(--t-amber)',
    opacity: 0.8,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },

  /* Activity feed */
  logRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    minHeight: 22,
    fontSize: 12,
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
    color: 'var(--t-blue)',
    textDecoration: 'none',
    fontFamily: 'var(--t-font)',
    fontSize: 13,
  },
};
