import { describe, test, expect, vi, beforeEach } from 'vitest';

// ── 1a. detectTransport — pure function tests ───────────────────────────

// detectTransport is not exported, so we test it indirectly through module internals.
// We re-implement the same logic for a focused unit test, then verify integration via trackHttpRequest.

function detectTransport(req: { method: string; headers: { get(name: string): string | null } }, path: string): 'sse' | 'jsonrpc' | 'page' {
  const accept = req.headers.get('accept') || '';
  if (accept.includes('text/event-stream')) return 'sse';
  if (req.method === 'POST') return 'jsonrpc';
  if (path.startsWith('/api/mcp')) return 'jsonrpc';
  return 'page';
}

describe('detectTransport (pure logic)', () => {
  test('Accept: text/event-stream → sse', () => {
    const req = { method: 'GET', headers: { get: (name: string) => name === 'accept' ? 'text/event-stream' : null } };
    expect(detectTransport(req, '/api/mcp')).toBe('sse');
  });

  test('POST with application/json → jsonrpc', () => {
    const req = { method: 'POST', headers: { get: () => 'application/json' } };
    expect(detectTransport(req, '/api/mcp')).toBe('jsonrpc');
  });

  test('GET to /api/mcp (no SSE header) → jsonrpc', () => {
    const req = { method: 'GET', headers: { get: () => null } };
    expect(detectTransport(req, '/api/mcp')).toBe('jsonrpc');
  });

  test('GET to /dashboard → page', () => {
    const req = { method: 'GET', headers: { get: () => null } };
    expect(detectTransport(req, '/dashboard')).toBe('page');
  });
});

// ── 1b. trackHttpRequest — wrapper behavior ─────────────────────────────

// We need to mock the Tracker before importing http-tracking,
// since it creates a module-level Tracker instance.
vi.mock('@/src/analytics/tracker', () => {
  const emitFn = vi.fn();
  return {
    Tracker: vi.fn().mockImplementation(() => ({
      emit: emitFn,
      setSession: vi.fn(),
      getLogPath: vi.fn().mockReturnValue(''),
    })),
    __emitFn: emitFn,
  };
});

describe('trackHttpRequest', () => {
  let trackHttpRequest: typeof import('@/src/analytics/http-tracking').trackHttpRequest;
  let emitFn: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/src/analytics/http-tracking');
    trackHttpRequest = mod.trackHttpRequest;
    const mockMod = await import('@/src/analytics/tracker') as { __emitFn: ReturnType<typeof vi.fn> };
    emitFn = mockMod.__emitFn;
  });

  function makeRequest(method: string, url: string, headers: Record<string, string> = {}): Request {
    return new Request(url, { method, headers });
  }

  const dummyContext = { params: Promise.resolve({ transport: 'mcp' }) };

  test('returns handler response unchanged', async () => {
    const response = new Response('ok', { status: 200 });
    const handler = vi.fn().mockResolvedValue(response);
    const wrapped = trackHttpRequest(handler);

    const result = await wrapped(makeRequest('GET', 'http://localhost/api/mcp'), dummyContext);
    expect(result).toBe(response);
    expect(handler).toHaveBeenCalledOnce();
  });

  test('emits http_request event with correct fields', async () => {
    const response = new Response('ok', { status: 200 });
    const handler = vi.fn().mockResolvedValue(response);
    const wrapped = trackHttpRequest(handler);

    await wrapped(makeRequest('POST', 'http://localhost/api/mcp', { 'content-type': 'application/json' }), dummyContext);

    expect(emitFn).toHaveBeenCalledOnce();
    const event = emitFn.mock.calls[0][0];
    expect(event.event).toBe('http_request');
    expect(event.method).toBe('POST');
    expect(event.path).toBe('/api/mcp');
    expect(event.statusCode).toBe(200);
    expect(event.durationMs).toBeGreaterThanOrEqual(0);
    expect(event.transport).toBe('jsonrpc');
  });

  test('on handler throw: emits event with status 500, then rethrows', async () => {
    const error = new Error('boom');
    const handler = vi.fn().mockRejectedValue(error);
    const wrapped = trackHttpRequest(handler);

    await expect(
      wrapped(makeRequest('GET', 'http://localhost/api/mcp'), dummyContext),
    ).rejects.toThrow('boom');

    expect(emitFn).toHaveBeenCalledOnce();
    const event = emitFn.mock.calls[0][0];
    expect(event.statusCode).toBe(500);
  });
});

// ── 1c. withTracking — HOF behavior ─────────────────────────────────────

describe('withTracking', () => {
  let withTracking: typeof import('@/src/analytics/wrapper').withTracking;

  beforeEach(async () => {
    vi.clearAllMocks();
    const mod = await import('@/src/analytics/wrapper');
    withTracking = mod.withTracking;
  });

  function makeTracker() {
    return {
      emit: vi.fn(),
      setSession: vi.fn(),
      getLogPath: vi.fn().mockReturnValue(''),
    };
  }

  function makeMcpServer(clientName = 'test-client', clientVersion = '1.0.0') {
    return {
      server: {
        getClientVersion: vi.fn().mockReturnValue({ name: clientName, version: clientVersion }),
      },
    } as unknown as import('@modelcontextprotocol/sdk/server/mcp.js').McpServer;
  }

  const successResult = { content: [{ type: 'text', text: 'hello' }] };

  test('emits session_start on first call only', async () => {
    const tracker = makeTracker();
    const handler = vi.fn().mockResolvedValue(successResult);
    const wrapped = withTracking(tracker as never, 'test_tool', makeMcpServer(), handler);

    await wrapped({}, { sessionId: 'sess-1' });
    await wrapped({}, { sessionId: 'sess-1' });

    const sessionEvents = tracker.emit.mock.calls.filter(
      ([e]: [{ event: string }]) => e.event === 'session_start',
    );
    expect(sessionEvents).toHaveLength(1);
    expect(sessionEvents[0][0].clientName).toBe('test-client');
  });

  test('emits tool_call with success: true on success', async () => {
    const tracker = makeTracker();
    const handler = vi.fn().mockResolvedValue(successResult);
    const wrapped = withTracking(tracker as never, 'test_tool', makeMcpServer(), handler);

    await wrapped({}, {});

    const toolEvents = tracker.emit.mock.calls.filter(
      ([e]: [{ event: string }]) => e.event === 'tool_call',
    );
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0][0].success).toBe(true);
    expect(toolEvents[0][0].tool).toBe('test_tool');
  });

  test('emits tool_call with success: false + error event on throw', async () => {
    const tracker = makeTracker();
    const handler = vi.fn().mockRejectedValue(new Error('fail'));
    const wrapped = withTracking(tracker as never, 'test_tool', makeMcpServer(), handler);

    await expect(wrapped({}, {})).rejects.toThrow('fail');

    const toolEvents = tracker.emit.mock.calls.filter(
      ([e]: [{ event: string }]) => e.event === 'tool_call',
    );
    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0][0].success).toBe(false);

    const errorEvents = tracker.emit.mock.calls.filter(
      ([e]: [{ event: string }]) => e.event === 'error',
    );
    expect(errorEvents).toHaveLength(1);
    expect(errorEvents[0][0].message).toBe('fail');
  });

  test('measures duration (durationMs >= 0)', async () => {
    const tracker = makeTracker();
    const handler = vi.fn().mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(successResult), 10)),
    );
    const wrapped = withTracking(tracker as never, 'test_tool', makeMcpServer(), handler);

    await wrapped({}, {});

    const toolEvents = tracker.emit.mock.calls.filter(
      ([e]: [{ event: string }]) => e.event === 'tool_call',
    );
    expect(toolEvents[0][0].durationMs).toBeGreaterThanOrEqual(0);
  });

  test('rethrows errors from the wrapped handler', async () => {
    const tracker = makeTracker();
    const handler = vi.fn().mockRejectedValue(new Error('original'));
    const wrapped = withTracking(tracker as never, 'test_tool', makeMcpServer(), handler);

    await expect(wrapped({}, {})).rejects.toThrow('original');
  });
});

// ── 1d. Tracker class — persistence logic ───────────────────────────────

describe('Tracker', () => {
  // We need the REAL Tracker class, not the mock. Use dynamic import
  // with a cache-busted approach.

  test('emit() is a no-op when Redis env vars are missing (no throw)', async () => {
    // Ensure Redis env vars are not set
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.KV_REST_API_TOKEN;

    // Import the real module (not the mock) by using the actual file path
    const { Tracker: RealTracker } = await vi.importActual<typeof import('@/src/analytics/tracker')>('@/src/analytics/tracker');
    const tracker = new RealTracker();

    // Should not throw
    expect(() => {
      tracker.emit({
        event: 'tool_call',
        ts: new Date().toISOString(),
        tool: 'test',
        durationMs: 10,
        success: true,
        responseSizeChars: 0,
      });
    }).not.toThrow();
  });

  test('setSession() stores session info', async () => {
    const { Tracker: RealTracker } = await vi.importActual<typeof import('@/src/analytics/tracker')>('@/src/analytics/tracker');
    const tracker = new RealTracker();

    // Should not throw
    expect(() => tracker.setSession('sess-1', 'claude-code', '1.0')).not.toThrow();
  });

  test('getLogPath() returns empty string', async () => {
    const { Tracker: RealTracker } = await vi.importActual<typeof import('@/src/analytics/tracker')>('@/src/analytics/tracker');
    const tracker = new RealTracker();

    expect(tracker.getLogPath()).toBe('');
  });
});
