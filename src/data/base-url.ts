/**
 * Resolve the base URL for the site root.
 *
 * Priority:
 * 1. NEXT_PUBLIC_BASE_URL env var (explicit override)
 * 2. VERCEL_URL (auto-set by Vercel in production/preview)
 * 3. Fallback to localhost:3000 for local dev
 */
export function getSiteBaseUrl(): string {
  if (process.env.NEXT_PUBLIC_BASE_URL) {
    return process.env.NEXT_PUBLIC_BASE_URL;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return 'http://localhost:3000';
}

/** Base URL for static source files at /source/ */
export function getSourceBaseUrl(): string {
  return `${getSiteBaseUrl()}/source`;
}
