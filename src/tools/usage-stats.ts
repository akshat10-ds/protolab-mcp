import { z } from 'zod';
import { Redis } from '@upstash/redis';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tracker } from '../analytics/tracker';

/** Resolve Redis env vars — Vercel integration uses KV_REST_API_*, direct Upstash uses UPSTASH_REDIS_REST_* */
function getRedisEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

/** Format date as YYYYMMDD */
function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Format date as YYYY-WW (ISO week) */
function weekKey(d: Date): string {
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Format date as YYYY-MM */
function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Sort a hash object by value descending and limit */
function sortedHash(hash: Record<string, string> | null, limit = 20): Array<{ key: string; count: number }> {
  if (!hash) return [];
  return Object.entries(hash)
    .map(([key, val]) => ({ key, count: parseInt(val, 10) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

export function registerUsageStats(server: McpServer, _tracker: Tracker) {
  server.tool(
    'get_usage_stats',
    'Get usage analytics for the Ink Design System MCP server — tool call counts, popular components, search queries, errors, session info',
    {
      report: z
        .enum(['summary', 'components', 'searches', 'errors', 'timeline', 'sessions'])
        .optional()
        .default('summary')
        .describe('Which report to return (default: summary)'),
      since: z
        .string()
        .optional()
        .describe('ISO date to filter from (e.g. "2026-01-01"). Defaults to 30 days ago.'),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe('Max items for rankings (default: 20)'),
    },
    async ({ report, limit }) => {
      // If Redis is not configured, return a helpful message
      const env = getRedisEnv();
      if (!env) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  message:
                    'Usage analytics require Upstash Redis. ' +
                    'Install the Upstash Redis integration from Vercel Marketplace and connect it to this project.',
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      const kv = new Redis(env);
      const now = new Date();
      const today = dayKey(now);
      const thisWeek = weekKey(now);
      const thisMonth = monthKey(now);

      const num = (v: unknown) => (typeof v === 'number' ? v : parseInt(String(v || '0'), 10)) || 0;

      if (report === 'summary') {
        const p = kv.pipeline();
        p.get('mcp:http:total');
        p.get('mcp:tool:total');
        p.get('mcp:session:total');
        p.get('mcp:errors:total');
        p.pfcount('mcp:unique:all');
        p.pfcount(`mcp:unique:daily:${today}`);
        p.pfcount(`mcp:unique:weekly:${thisWeek}`);
        p.pfcount(`mcp:unique:monthly:${thisMonth}`);
        p.hgetall('mcp:tool:calls');
        p.hgetall('mcp:session:clients');
        const r = await p.exec();

        const toolCalls = r[8] as Record<string, string> | null;
        const topTools = sortedHash(toolCalls, 5);
        const clients = sortedHash(r[9] as Record<string, string> | null, 5);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  httpRequests: num(r[0]),
                  toolCalls: num(r[1]),
                  sessions: num(r[2]),
                  errors: num(r[3]),
                  uniqueUsers: {
                    allTime: num(r[4]),
                    today: num(r[5]),
                    thisWeek: num(r[6]),
                    thisMonth: num(r[7]),
                  },
                  topTools: topTools.map((t) => `${t.key}: ${t.count}`),
                  topClients: clients.map((c) => `${c.key}: ${c.count}`),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (report === 'components') {
        const hash = await kv.hgetall('mcp:comp:lookups') as Record<string, string> | null;
        const sorted = sortedHash(hash, limit);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { topComponents: sorted.map((c) => ({ component: c.key, lookups: c.count })) },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (report === 'searches') {
        const hash = await kv.hgetall('mcp:search:queries') as Record<string, string> | null;
        const sorted = sortedHash(hash, limit);
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                { topSearches: sorted.map((s) => ({ query: s.key, count: s.count })) },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (report === 'errors') {
        const p = kv.pipeline();
        p.get('mcp:errors:total');
        p.lrange('mcp:errors:recent', 0, limit - 1);
        p.hgetall('mcp:tool:errors');
        const r = await p.exec();

        const recentRaw = r[1] as string[] | null;
        const recent = (recentRaw || []).map((item) => {
          try { return JSON.parse(item); }
          catch { return item; }
        });
        const errorsByTool = sortedHash(r[2] as Record<string, string> | null, limit);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalErrors: num(r[0]),
                  errorsByTool: errorsByTool.map((e) => ({ tool: e.key, errors: e.count })),
                  recentErrors: recent,
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      if (report === 'timeline') {
        const p = kv.pipeline();
        const days: string[] = [];
        for (let i = 13; i >= 0; i--) {
          const d = new Date(now.getTime() - i * 86400000);
          const dk = dayKey(d);
          days.push(dk);
          p.get(`mcp:http:daily:${dk}`);
          p.get(`mcp:tool:daily:${dk}`);
          p.pfcount(`mcp:unique:daily:${dk}`);
        }
        const r = await p.exec();

        const timeline = days.map((day, i) => ({
          day,
          httpRequests: num(r[i * 3]),
          toolCalls: num(r[i * 3 + 1]),
          uniqueUsers: num(r[i * 3 + 2]),
        }));

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ dailyTrend: timeline }, null, 2),
            },
          ],
        };
      }

      if (report === 'sessions') {
        const p = kv.pipeline();
        p.get('mcp:session:total');
        p.hgetall('mcp:session:clients');
        p.pfcount('mcp:unique:all');
        const r = await p.exec();

        const clients = sortedHash(r[1] as Record<string, string> | null, limit);

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify(
                {
                  totalSessions: num(r[0]),
                  uniqueUsersAllTime: num(r[2]),
                  clients: clients.map((c) => ({ client: c.key, sessions: c.count })),
                },
                null,
                2,
              ),
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ error: `Unknown report type: ${report}` }, null, 2),
          },
        ],
      };
    },
  );
}
