/**
 * Fixed-window in-memory limiter. Good for a single instance; use a shared store (e.g. Redis)
 * when running several instances behind a load balancer.
 */
interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

export interface RateStatus {
  limited: boolean;
  retryAfterSeconds: number;
}

function current(key: string, now: number): Bucket | undefined {
  const bucket = buckets.get(key);
  if (bucket && bucket.resetAt <= now) {
    buckets.delete(key);
    return undefined;
  }
  return bucket;
}

/** Is this key currently over its limit? Does not count an attempt. */
export function checkRate(key: string, limit: number, now = Date.now()): RateStatus {
  const bucket = current(key, now);
  if (bucket && bucket.count >= limit) {
    return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }
  return { limited: false, retryAfterSeconds: 0 };
}

/** Record one (failed) attempt. */
export function recordAttempt(key: string, windowMs: number, now = Date.now()): void {
  const bucket = current(key, now);
  if (bucket) bucket.count += 1;
  else buckets.set(key, { count: 1, resetAt: now + windowMs });
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
}

export function clearRate(key: string): void {
  buckets.delete(key);
}

export function resetAllRateLimits(): void {
  buckets.clear();
}
