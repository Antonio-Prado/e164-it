function nowBucketMs(windowMs) {
  const now = Date.now();
  const bucket = Math.floor(now / windowMs);
  const resetMs = (bucket + 1) * windowMs;
  return { now, bucket, resetMs };
}

export async function enforceRateLimit({ kv, keyPrefix, limitPerMinute }) {
  const windowMs = 60_000;
  const { now, bucket, resetMs } = nowBucketMs(windowMs);

  const key = `${keyPrefix}:${bucket}`;
  const ttlSeconds = Math.max(1, Math.ceil((resetMs - now) / 1000) + 5);

  const raw = await kv.get(key);
  const count = raw ? Number.parseInt(raw, 10) : 0;

  if (Number.isFinite(limitPerMinute) && limitPerMinute > 0 && count >= limitPerMinute) {
    const retryAfter = Math.max(1, Math.ceil((resetMs - now) / 1000));
    return {
      allowed: false,
      headers: {
        "retry-after": String(retryAfter),
        "x-ratelimit-limit": String(limitPerMinute),
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(Math.floor(resetMs / 1000))
      }
    };
  }

  const nextCount = count + 1;
  await kv.put(key, String(nextCount), { expirationTtl: ttlSeconds });

  const remaining = Number.isFinite(limitPerMinute) && limitPerMinute > 0
    ? String(Math.max(0, limitPerMinute - nextCount))
    : "0";

  return {
    allowed: true,
    headers: {
      "x-ratelimit-limit": String(limitPerMinute ?? 0),
      "x-ratelimit-remaining": remaining,
      "x-ratelimit-reset": String(Math.floor(resetMs / 1000))
    }
  };
}
