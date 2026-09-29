import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import Redis from "ioredis";

// Readiness: l'app è pronta a servire traffico? Verifica DB e (se configurato)
// Redis. Da usare su proxy e monitor (es. curl /api/readyz), NON come healthcheck
// del container: quello resta /api/healthz. Non espone segreti, solo booleani.
export async function GET() {
  const checks: Record<string, boolean> = { db: false, redis: true };
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = true;
  } catch { /* db down */ }

  if (process.env.REDIS_URL) {
    let r: Redis | null = null;
    try {
      r = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: true, connectTimeout: 1500 });
      await r.connect();
      checks.redis = (await r.ping()) === "PONG";
    } catch {
      checks.redis = false;
    } finally {
      r?.disconnect();
    }
  }

  const ok = Object.values(checks).every(Boolean);
  return NextResponse.json(
    { ok, checks, time: new Date().toISOString() },
    { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  );
}
