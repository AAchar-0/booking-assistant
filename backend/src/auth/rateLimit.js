// Fixed-window rate limiter kept in memory: "at most `max` hits per `windowMs` for each key".
// Good enough for one server instance (our case). With several instances you would use a shared store such as Redis.
export function createRateLimiter({ windowMs, max, now = () => Date.now() }) {
  const buckets = new Map();   // key -> { count, resetAt }

  return {
    /** Records one hit. Returns { allowed, retryAfterSeconds }. */
    hit(key) {
      const t = now();
      if (buckets.size > 10_000) {                       // keep memory bounded: forget expired windows
        for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
      }
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        bucket = { count: 0, resetAt: t + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= max;
      return { allowed, retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((bucket.resetAt - t) / 1000)) };
    },
  };
}
