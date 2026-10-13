"use client";
const revisioni = new Map<string, number>();
const ripetizioni = new Map<string, string>();
function registra(value: unknown, forza = false): void {
  if (!value || typeof value !== "object") return;
  if (Array.isArray(value)) { value.forEach((v) => registra(v, forza)); return; }
  const obj = value as Record<string, unknown>;
  if (typeof obj.id === "string" && typeof obj.revisione === "number" && (forza || !revisioni.has(obj.id))) revisioni.set(obj.id, obj.revisione);
  for (const v of Object.values(obj)) registra(v, forza);
}
export async function richiestaOrmeggio(input: string, options: RequestInit = {}) {
  const method = (options.method ?? "GET").toUpperCase();
  const headers = new Headers(options.headers);
  const mutation = !["GET", "HEAD"].includes(method);
  let body: Record<string, unknown> | null = null;
  if (typeof options.body === "string") { try { body = JSON.parse(options.body); } catch {} }
  const path = input.split("?")[0].split("/");
  const isMovement = path.at(-1) === "movimenti";
  const id = isMovement ? body?.permanenzaId : [...path].reverse().find((s) => /^[0-9a-f-]{36}$/i.test(s));
  if (mutation && typeof id === "string") {
    const rev = typeof body?.revisione === "number" ? body.revisione : revisioni.get(id);
    if (rev != null && !headers.has("If-Match")) headers.set("If-Match", String(rev));
  }
  const intent = JSON.stringify([input, method, options.body ?? null]);
  if (mutation && method === "POST") {
    const key = ripetizioni.get(intent) ?? crypto.randomUUID();
    ripetizioni.set(intent, key); headers.set("Idempotency-Key", key);
  }
  if (mutation && !navigator.onLine) throw new Error("Connessione assente: ricollegati prima di salvare");
  const r = await fetch(input, { ...options, headers, cache: "no-store" });
  if (r.ok) {
    const data = await r.clone().json().catch(() => null);
    registra(data, mutation);
    if (isMovement && typeof id === "string" && headers.has("If-Match")) revisioni.set(id, Number(headers.get("If-Match")) + 1);
    if (mutation) ripetizioni.delete(intent);
  } else if (mutation && r.status < 500) {
    ripetizioni.delete(intent);
    if (r.status === 409 && typeof id === "string") revisioni.delete(id);
  }
  return r;
}
