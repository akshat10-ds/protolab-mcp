/**
 * Analytics event type definitions for the Ink MCP Server.
 */

// ── Base fields added by the tracker ────────────────────────────────

export interface EventBase {
  /** ISO 8601 timestamp */
  ts: string;
  /** Stable ID for the current MCP session */
  sessionId?: string;
  /** Name of the connected client (e.g. "claude-code") */
  clientName?: string;
  /** Version of the connected client */
  clientVersion?: string;
}

// ── Automatic events (emitted by the wrapper) ───────────────────────

export interface ToolCallEvent extends EventBase {
  event: 'tool_call';
  tool: string;
  durationMs: number;
  success: boolean;
  responseSizeChars: number;
}

// ── Semantic events (emitted by tool logic) ─────────────────────────

export interface ComponentLookupEvent extends EventBase {
  event: 'component_lookup';
  component: string;
  found: boolean;
}

export interface SourceDeliveryEvent extends EventBase {
  event: 'source_delivery';
  component: string;
  fileCount: number;
  totalBytes: number;
  depCount: number;
  depNames: string[];
}

export interface SearchQueryEvent extends EventBase {
  event: 'search_query';
  query: string;
  resultCount: number;
  topMatches: string[];
}

export interface TokenAccessEvent extends EventBase {
  event: 'token_access';
  category: string | null;
}

export interface ComponentListEvent extends EventBase {
  event: 'component_list';
  layerFilter: number | null;
}

export interface SessionStartEvent extends EventBase {
  event: 'session_start';
  clientName: string;
  clientVersion: string;
}

export interface ErrorEvent extends EventBase {
  event: 'error';
  tool: string;
  message: string;
}

export interface ValidationEvent extends EventBase {
  event: 'validation';
  componentsChecked: number;
  issueCount: number;
  errorCount: number;
}

export interface HttpRequestEvent extends EventBase {
  event: 'http_request';
  method: string;
  path: string;
  statusCode: number;
  durationMs: number;
  userAgent: string;
  transport: 'sse' | 'jsonrpc' | 'page';
}

// ── Union type ──────────────────────────────────────────────────────

export type AnalyticsEvent =
  | ToolCallEvent
  | ComponentLookupEvent
  | SourceDeliveryEvent
  | SearchQueryEvent
  | TokenAccessEvent
  | ComponentListEvent
  | SessionStartEvent
  | ErrorEvent
  | ValidationEvent
  | HttpRequestEvent;
