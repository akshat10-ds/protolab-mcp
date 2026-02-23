/**
 * Analytics tracker with optional Upstash Redis persistence.
 *
 * Accepts either UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN
 * (the latter is what Vercel's Upstash integration injects).
 * When not configured, falls back to no-op (backward-compatible).
 */

import type { AnalyticsEvent } from './events';
import type { Redis } from '@upstash/redis';

/** Resolve Redis env vars — Vercel integration uses KV_REST_API_*, direct Upstash uses UPSTASH_REDIS_REST_* */
function getRedisEnv(): { url: string; token: string } | null {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  return { url, token };
}

// Lazy-initialized Redis client (only when env var exists)
let redisInstance: Redis | null = null;
let redisInitialized = false;

function getRedis(): Redis | null {
  if (redisInitialized) return redisInstance;
  redisInitialized = true;

  const env = getRedisEnv();
  if (!env) return null;

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Redis: RedisClient } = require('@upstash/redis') as typeof import('@upstash/redis');
  redisInstance = new RedisClient(env);
  return redisInstance;
}

/** Format date as YYYYMMDD */
function dayKey(d = new Date()): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

/** Format date as YYYY-WW (ISO week) */
function weekKey(d = new Date()): string {
  const year = d.getFullYear();
  const jan1 = new Date(year, 0, 1);
  const days = Math.floor((d.getTime() - jan1.getTime()) / 86400000);
  const week = Math.ceil((days + jan1.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/** Format date as YYYY-MM */
function monthKey(d = new Date()): string {
  return d.toISOString().slice(0, 7);
}

const DAY_TTL = 90 * 86400;
const WEEK_TTL = 180 * 86400;
const MONTH_TTL = 365 * 86400;

export class Tracker {
  private sessionId?: string;
  private clientName?: string;
  private clientVersion?: string;

  /** Set session info — called lazily on first tool call. */
  setSession(id: string, clientName?: string, clientVersion?: string): void {
    this.sessionId = id;
    this.clientName = clientName;
    this.clientVersion = clientVersion;
  }

  /** Emit an analytics event. Persists to Redis if configured, otherwise no-op. */
  emit(event: AnalyticsEvent): void {
    // Fire-and-forget — analytics should never break MCP
    this._persist(event).catch(() => {});
  }

  /** Returns empty string — no log file in serverless mode. */
  getLogPath(): string {
    return '';
  }

  private async _persist(event: AnalyticsEvent): Promise<void> {
    const redis = getRedis();
    if (!redis) return;

    const now = new Date();
    const day = dayKey(now);
    const week = weekKey(now);
    const month = monthKey(now);
    const pipe = redis.pipeline();

    // ── Recent events (capped list) ──────────────────────────────
    const summary = JSON.stringify({
      event: event.event,
      ts: event.ts,
      ...(event.event === 'tool_call' && { tool: event.tool, success: event.success, durationMs: event.durationMs }),
      ...(event.event === 'http_request' && { method: event.method, path: event.path, status: event.statusCode, durationMs: event.durationMs }),
      ...(event.event === 'error' && { tool: event.tool, message: event.message }),
      ...(event.event === 'session_start' && { client: event.clientName }),
      ...(event.event === 'component_lookup' && { component: event.component }),
      ...(event.event === 'search_query' && { query: event.query, results: event.resultCount }),
    });
    pipe.lpush('mcp:recent', summary);
    pipe.ltrim('mcp:recent', 0, 199);

    // ── Per-event-type persistence ───────────────────────────────
    switch (event.event) {
      case 'http_request': {
        pipe.incr('mcp:http:total');
        pipe.incr(`mcp:http:method:${event.method}`);
        pipe.incr(`mcp:http:status:${event.statusCode}`);
        pipe.incr(`mcp:http:transport:${event.transport}`);
        pipe.incr(`mcp:http:daily:${day}`);
        pipe.expire(`mcp:http:daily:${day}`, DAY_TTL);

        // Duration buckets
        const bucket =
          event.durationMs < 100 ? '<100ms' :
          event.durationMs < 500 ? '100-500ms' :
          event.durationMs < 1000 ? '500-1000ms' :
          '>1000ms';
        pipe.hincrby('mcp:http:duration:buckets', bucket, 1);
        break;
      }

      case 'tool_call': {
        pipe.incr('mcp:tool:total');
        pipe.hincrby('mcp:tool:calls', event.tool, 1);
        pipe.hincrby('mcp:tool:duration', event.tool, event.durationMs);
        pipe.incr(`mcp:tool:daily:${day}`);
        pipe.expire(`mcp:tool:daily:${day}`, DAY_TTL);
        if (!event.success) {
          pipe.hincrby('mcp:tool:errors', event.tool, 1);
        }
        break;
      }

      case 'component_lookup': {
        if (event.found) {
          pipe.hincrby('mcp:comp:lookups', event.component, 1);
        }
        break;
      }

      case 'search_query': {
        pipe.hincrby('mcp:search:queries', event.query, 1);
        break;
      }

      case 'session_start': {
        pipe.incr('mcp:session:total');
        pipe.hincrby('mcp:session:clients', event.clientName || 'unknown', 1);

        // Unique user tracking via HyperLogLog
        const uid = this.sessionId || `anon-${Date.now()}`;
        pipe.pfadd('mcp:unique:all', uid);
        pipe.pfadd(`mcp:unique:daily:${day}`, uid);
        pipe.expire(`mcp:unique:daily:${day}`, DAY_TTL);
        pipe.pfadd(`mcp:unique:weekly:${week}`, uid);
        pipe.expire(`mcp:unique:weekly:${week}`, WEEK_TTL);
        pipe.pfadd(`mcp:unique:monthly:${month}`, uid);
        pipe.expire(`mcp:unique:monthly:${month}`, MONTH_TTL);
        break;
      }

      case 'error': {
        pipe.incr('mcp:errors:total');
        pipe.lpush('mcp:errors:recent', JSON.stringify({
          ts: event.ts,
          tool: event.tool,
          message: event.message,
        }));
        pipe.ltrim('mcp:errors:recent', 0, 49);
        break;
      }
    }

    await pipe.exec();
  }
}
