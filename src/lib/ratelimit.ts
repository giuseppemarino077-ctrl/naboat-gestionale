import Redis from "ioredis";

// Rate limit a finestra fissa su Redis, con fallback in-memory se Redis non
// raggiungibile (evita di bloccare gli utenti per un guasto della cache).

let redis: Redis | null | undefined;

function client(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.REDIS_URL;
  if (!url) {
    redis = null;
    return redis;
  }
  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
      retryStrategy: (t) => (t > 3000 ? null : 500),
    });
    redis.on("error", () => { /* silenzioso: si usa il fallback */ });
    return redis;
  } catch {
    redis = null;
    return redis;
  }
}

const mem = new Map<string, { n: number; reset: number }>();

function memLimit(key: string, limit: number, windowSec: number) {
  const now = Date.now();
  const h = mem.get(key);
  if (!h || h.reset < now) {
    mem.set(key, { n: 1, reset: now + windowSec * 1000 });
    if (mem.size > 5000) for (const [k, v] of mem) if (v.reset < now) mem.delete(k);
    return { ok: true, remaining: limit - 1 };
  }
  h.n += 1;
  return { ok: h.n <= limit, remaining: Math.max(0, limit - h.n) };
}

export async function rateLimit(key: string, limit: number, windowSec: number) {
  const r = client();
  if (r && r.status === "ready") {
    try {
      const n = await r.incr(key);
      if (n === 1) await r.expire(key, windowSec);
      return { ok: n <= limit, remaining: Math.max(0, limit - n) };
    } catch {
      // cade nel fallback
    }
  }
  return memLimit(key, limit, windowSec);
}

// IP reale: dietro Cloudflare usare CF-Connecting-IP (non falsificabile dal
// client una volta che l'origin è raggiungibile solo dai range Cloudflare).
export function clientIp(req: Request) {
  const h = req.headers;
  return (
    h.get("cf-connecting-ip") ||
    h.get("x-real-ip") ||
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
