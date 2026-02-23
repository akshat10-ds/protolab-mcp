/**
 * Resolve the base URL for the site root.
 *
 * Priority:
 * 1. NEXT_PUBLIC_BASE_URL env var (explicit override)
 * 2. VERCEL_URL (auto-set by Vercel in production/preview)
 * 3. Fallback to localhost:3000 for local dev
 *
 * Computed lazily once — env vars don't change in a serverless module.
 */

let _siteBaseUrl: string | null = null;
let _sourceBaseUrl: string | null = null;

export function getSiteBaseUrl(): string {
  if (!_siteBaseUrl) {
    _siteBaseUrl = process.env.NEXT_PUBLIC_BASE_URL
      ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');
  }
  return _siteBaseUrl;
}

/** Base URL for static source files at /source/ */
export function getSourceBaseUrl(): string {
  if (!_sourceBaseUrl) {
    _sourceBaseUrl = `${getSiteBaseUrl()}/source`;
  }
  return _sourceBaseUrl;
}
