/**
 * Basic fixed-window rate limiter, implemented as a module-scoped in-memory
 * Map. This is intentionally simple ("בסיסי") and suited to a serverless
 * deployment like Vercel with an important caveat: the Map only persists
 * for the lifetime of a single warm serverless instance/lambda. It resets
 * on cold starts and is NOT shared across concurrent instances, so it
 * will not perfectly rate-limit a distributed attack. It DOES meaningfully
 * slow down repeated PIN-guessing from a single client hitting a warm
 * instance, which is the realistic threat for this app's scale.
 *
 * For strict, cross-instance rate limiting, replace this with a shared
 * store such as Upstash Redis (works well with Vercel's serverless model)
 * - see README for a pointer.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Periodically prevent unbounded memory growth within a long-lived warm
// instance by capping the map size; oldest-inserted entries are dropped.
const MAX_TRACKED_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  key: string,
  { windowMs, max }: { windowMs: number; max: number }
): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    if (buckets.size >= MAX_TRACKED_KEYS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey !== undefined) buckets.delete(oldestKey);
    }
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: max - 1, retryAfterSeconds: 0 };
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.ceil((existing.windowStart + windowMs - now) / 1000);
    return { allowed: false, remaining: 0, retryAfterSeconds };
  }

  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, retryAfterSeconds: 0 };
}

/** Extracts a best-effort client identifier from standard proxy headers
 * (Vercel/most reverse proxies set x-forwarded-for). Falls back to a
 * constant so the limiter still functions (shared bucket) if no header
 * is present, rather than throwing. */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;
  return "unknown";
}
