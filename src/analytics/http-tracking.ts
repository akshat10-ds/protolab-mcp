/**
 * HTTP-level request tracking for the MCP API route.
 *
 * Wraps Next.js route handlers to capture status code, duration,
 * and transport type, then emits an http_request event via Tracker.
 */

import { Tracker } from './tracker';

// Module-level singleton tracker for HTTP events
const httpTracker = new Tracker();

type RouteContext = { params: Promise<{ transport: string }> };
type RouteHandler = (req: Request, context: RouteContext) => Promise<Response>;

function detectTransport(req: Request, path: string): 'sse' | 'jsonrpc' | 'page' {
  // SSE transport uses Accept: text/event-stream
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) return 'sse';

  // MCP JSON-RPC uses POST with application/json
  if (req.method === 'POST') return 'jsonrpc';

  // GET requests to the MCP endpoint that aren't SSE are still jsonrpc (initialization)
  if (path.startsWith('/api/mcp')) return 'jsonrpc';

  return 'page';
}

export function trackHttpRequest(handler: RouteHandler): RouteHandler {
  return async (req: Request, context: RouteContext): Promise<Response> => {
    const start = Date.now();
    const url = new URL(req.url);

    let response: Response;
    try {
      response = await handler(req, context);
    } catch (err) {
      // Emit a 500 for unhandled errors, then rethrow
      const durationMs = Date.now() - start;
      httpTracker.emit({
        event: 'http_request',
        ts: new Date().toISOString(),
        method: req.method,
        path: url.pathname,
        statusCode: 500,
        durationMs,
        userAgent: req.headers.get('user-agent') || '',
        transport: detectTransport(req, url.pathname),
      });
      throw err;
    }

    const durationMs = Date.now() - start;
    httpTracker.emit({
      event: 'http_request',
      ts: new Date().toISOString(),
      method: req.method,
      path: url.pathname,
      statusCode: response.status,
      durationMs,
      userAgent: req.headers.get('user-agent') || '',
      transport: detectTransport(req, url.pathname),
    });

    return response;
  };
}
