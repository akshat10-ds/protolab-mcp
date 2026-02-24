/**
 * Dashboard data API — reads pre-aggregated analytics from Upstash Redis.
 *
 * Returns 503 with setup instructions if Redis is not configured.
 */

import { NextResponse } from 'next/server';
import { Redis } from '@upstash/redis';

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

/** Wrap a promise with a timeout */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms)
    ),
  ]);
}

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

export async function GET() {
  const env = getRedisEnv();
  if (!env) {
    return NextResponse.json(
      {
        error: 'Upstash Redis not configured',
        setup: [
          '1. Go to Vercel Marketplace → install Upstash Redis integration',
          '2. Create a Redis database and connect it to this project',
          '3. Redeploy',
        ],
      },
      { status: 503 },
    );
  }

  try {
  const kv = new Redis(env);
  const now = new Date();
  const today = dayKey(now);
  const thisWeek = weekKey(now);
  const thisMonth = monthKey(now);

  // Previous week/month for growth calculations
  const lastWeekDate = new Date(now.getTime() - 7 * 86400000);
  const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
  const lastWeek = weekKey(lastWeekDate);
  const lastMonth = monthKey(lastMonthDate);

  // ── Pipeline 1: counters + hashes ─────────────────────────────
  const p1 = kv.pipeline();
  p1.get('mcp:http:total');                     // 0
  p1.get('mcp:http:method:GET');                // 1
  p1.get('mcp:http:method:POST');               // 2
  p1.hgetall('mcp:http:duration:buckets');      // 3
  p1.get('mcp:http:transport:sse');             // 4
  p1.get('mcp:http:transport:jsonrpc');         // 5
  p1.get('mcp:http:transport:page');            // 6
  p1.get('mcp:tool:total');                     // 7
  p1.hgetall('mcp:tool:calls');                 // 8
  p1.hgetall('mcp:tool:errors');                // 9
  p1.hgetall('mcp:tool:duration');              // 10
  p1.hgetall('mcp:comp:lookups');               // 11
  p1.hgetall('mcp:search:queries');             // 12
  p1.get('mcp:session:total');                  // 13
  p1.hgetall('mcp:session:clients');            // 14
  p1.get('mcp:errors:total');                   // 15
  p1.lrange('mcp:errors:recent', 0, 19);       // 16
  p1.lrange('mcp:recent', 0, 29);              // 17

  // Status code counters
  p1.get('mcp:http:status:200');                // 18
  p1.get('mcp:http:status:204');                // 19
  p1.get('mcp:http:status:400');                // 20
  p1.get('mcp:http:status:404');                // 21
  p1.get('mcp:http:status:500');                // 22

  const r1 = await withTimeout(p1.exec(), 5000, 'Redis pipeline 1');

  // ── Pipeline 2: daily trends (14 days) + unique users ─────────
  const p2 = kv.pipeline();
  const trendDays: string[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 86400000);
    const dk = dayKey(d);
    trendDays.push(dk);
    p2.get(`mcp:http:daily:${dk}`);       // 0..13
    p2.get(`mcp:tool:daily:${dk}`);       // 14..27
    p2.pfcount(`mcp:unique:daily:${dk}`); // 28..41
  }

  // Unique user aggregates (IP-hash based)
  p2.pfcount('mcp:unique:all');                     // 42
  p2.pfcount(`mcp:unique:daily:${today}`);          // 43
  p2.pfcount(`mcp:unique:weekly:${thisWeek}`);      // 44
  p2.pfcount(`mcp:unique:monthly:${thisMonth}`);    // 45
  p2.pfcount(`mcp:unique:weekly:${lastWeek}`);      // 46
  p2.pfcount(`mcp:unique:monthly:${lastMonth}`);    // 47

  // Unique session aggregates (MCP session ID based)
  p2.pfcount('mcp:sessions:all');                   // 48
  p2.pfcount(`mcp:sessions:daily:${today}`);        // 49
  p2.pfcount(`mcp:sessions:weekly:${thisWeek}`);    // 50
  p2.pfcount(`mcp:sessions:monthly:${thisMonth}`);  // 51

  const r2 = await withTimeout(p2.exec(), 5000, 'Redis pipeline 2');

  // ── Assemble response ─────────────────────────────────────────
  const num = (v: unknown) => (typeof v === 'number' ? v : parseInt(String(v || '0'), 10)) || 0;

  // Tool stats
  const toolCalls = r1[8] as Record<string, string> | null;
  const toolErrors = r1[9] as Record<string, string> | null;
  const toolDuration = r1[10] as Record<string, string> | null;

  const toolStats = sortedHash(toolCalls).map((t) => {
    const errors = num(toolErrors?.[t.key]);
    const totalMs = num(toolDuration?.[t.key]);
    return {
      tool: t.key,
      calls: t.count,
      errors,
      avgMs: t.count > 0 ? Math.round(totalMs / t.count) : 0,
    };
  });

  // Daily trend
  const dailyTrend = trendDays.map((day, i) => ({
    day,
    httpRequests: num(r2[i]),
    toolCalls: num(r2[14 + i]),
    uniqueUsers: num(r2[28 + i]),
  }));

  // Unique users
  const uniqueAllTime = num(r2[42]);
  const uniqueToday = num(r2[43]);
  const uniqueThisWeek = num(r2[44]);
  const uniqueThisMonth = num(r2[45]);
  const uniqueLastWeek = num(r2[46]);
  const uniqueLastMonth = num(r2[47]);

  // Unique sessions
  const sessionsAllTime = num(r2[48]);
  const sessionsToday = num(r2[49]);
  const sessionsThisWeek = num(r2[50]);
  const sessionsThisMonth = num(r2[51]);

  const wowGrowth = uniqueLastWeek > 0
    ? Math.round(((uniqueThisWeek - uniqueLastWeek) / uniqueLastWeek) * 100)
    : null;
  const momGrowth = uniqueLastMonth > 0
    ? Math.round(((uniqueThisMonth - uniqueLastMonth) / uniqueLastMonth) * 100)
    : null;

  // Status codes
  const statusCodes: Record<string, number> = {};
  const statusPairs: [string, number][] = [
    ['200', num(r1[18])], ['204', num(r1[19])],
    ['400', num(r1[20])], ['404', num(r1[21])], ['500', num(r1[22])],
  ];
  for (const [code, count] of statusPairs) {
    if (count > 0) statusCodes[code] = count;
  }

  // Parse recent lists
  const parseList = (list: unknown) =>
    Array.isArray(list)
      ? list.map((item) => {
          try { return JSON.parse(String(item)); }
          catch { return item; }
        })
      : [];

  const httpTotal = num(r1[0]);
  const errorsTotal = num(r1[15]);

  const response = NextResponse.json({
    http: {
      total: httpTotal,
      methods: { GET: num(r1[1]), POST: num(r1[2]) },
      statusCodes,
      durationBuckets: r1[3] || {},
      transport: {
        sse: num(r1[4]),
        jsonrpc: num(r1[5]),
        page: num(r1[6]),
      },
    },
    tools: {
      total: num(r1[7]),
      stats: toolStats,
    },
    uniqueUsers: {
      today: uniqueToday,
      thisWeek: uniqueThisWeek,
      thisMonth: uniqueThisMonth,
      allTime: uniqueAllTime,
      wowGrowth,
      momGrowth,
    },
    uniqueSessions: {
      today: sessionsToday,
      thisWeek: sessionsThisWeek,
      thisMonth: sessionsThisMonth,
      allTime: sessionsAllTime,
    },
    components: sortedHash(r1[11] as Record<string, string> | null),
    searches: sortedHash(r1[12] as Record<string, string> | null),
    sessions: {
      total: num(r1[13]),
      clients: sortedHash(r1[14] as Record<string, string> | null),
    },
    errors: {
      total: errorsTotal,
      rate: httpTotal > 0 ? `${((errorsTotal / httpTotal) * 100).toFixed(1)}%` : '0%',
      recent: parseList(r1[16]),
    },
    recentActivity: parseList(r1[17]),
    dailyTrend,
    generatedAt: now.toISOString(),
  });
  // Cache for 15s on CDN, serve stale up to 60s while revalidating
  response.headers.set('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
  return response;
  } catch (err) {
    console.error('[dashboard] Redis error:', err);
    return NextResponse.json(
      { error: 'Failed to fetch analytics', message: String(err) },
      { status: 500 },
    );
  }
}
