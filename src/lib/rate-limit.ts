import "server-only";

/**
 * Simple in-memory rate limit (per server process): protects the paid AI endpoints from scripts that loop requests.
 * For several server instances it would move to Redis together with the database.
 */
const hits = new Map<string, number[]>();

export function allow(key: string, limit = 60, windowMs = 60_000): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    return false;
  }
  recent.push(now);
  hits.set(key, recent);
  return true;
}
