/**
 * Higher-order function that wraps MCP tool handlers with automatic
 * timing, success/error tracking, and session detection.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Tracker } from './tracker';

interface ToolResult {
  content: Array<{ type: string; text: string }>;
}

/**
 * Wraps a tool callback so that every invocation emits a `tool_call`
 * event (and an `error` event on failure).  On the first call of a
 * session it also emits `session_start`.
 *
 * The returned function has the same signature as the original callback
 * so it can be passed directly to `server.tool()`.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function withTracking<F extends (...args: any[]) => Promise<ToolResult>>(
  tracker: Tracker,
  toolName: string,
  mcpServer: McpServer,
  handler: F,
): F {
  let sessionInitialised = false;

  const wrapped = async (...callArgs: unknown[]): Promise<ToolResult> => {
    // The second argument to every ToolCallback is `extra`
    const extra = (callArgs[1] ?? {}) as { sessionId?: string };

    // ── Session detection (once per session) ───────────────────────
    if (!sessionInitialised) {
      const sessionId = extra.sessionId ?? `session-${Date.now()}`;
      const clientInfo = mcpServer.server.getClientVersion();
      const clientName = clientInfo?.name ?? 'unknown';
      const clientVersion = clientInfo?.version ?? 'unknown';

      tracker.setSession(sessionId, clientName, clientVersion);
      tracker.emit({
        event: 'session_start',
        ts: new Date().toISOString(),
        clientName,
        clientVersion,
      });
      sessionInitialised = true;
    }

    // ── Execute & measure ──────────────────────────────────────────
    const start = Date.now();
    try {
      const result = await handler(...callArgs);

      const responseText = result.content
        .map((c) => c.text ?? '')
        .join('');

      tracker.emit({
        event: 'tool_call',
        ts: new Date().toISOString(),
        tool: toolName,
        durationMs: Date.now() - start,
        success: true,
        responseSizeChars: responseText.length,
      });

      return result;
    } catch (err) {
      tracker.emit({
        event: 'tool_call',
        ts: new Date().toISOString(),
        tool: toolName,
        durationMs: Date.now() - start,
        success: false,
        responseSizeChars: 0,
      });

      tracker.emit({
        event: 'error',
        ts: new Date().toISOString(),
        tool: toolName,
        message: err instanceof Error ? err.message : String(err),
      });

      throw err;
    }
  };

  return wrapped as unknown as F;
}
