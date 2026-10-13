import { randomUUID } from "node:crypto";
export function fetchConRevisioni(db) {
  return async (input, init = {}) => {
    const url = new URL(input);
    const method = (init.method ?? "GET").toUpperCase();
    if (!["GET", "HEAD"].includes(method) && (url.pathname.startsWith("/api/v1/ormeggio/") || url.pathname.startsWith("/api/v1/boats/"))) {
      const headers = new Headers(init.headers);
      let body;
      try { body = JSON.parse(init.body ?? "null"); } catch {}
      const path = url.pathname.replace("/api/v1/boats/", "/api/v1/ormeggio/barche/").replace("/api/v1/ormeggio/", "").split("/");
      const model = { aree: "area", posti: "posto", barche: "boat", proprietari: "proprietario", permanenze: "permanenza", attivita: "attivita", servizi: "servizioCatalogo", movimenti: "permanenza", addebiti: "addebito" }[path[0]];
      const id = path[0] === "movimenti" ? body?.permanenzaId : path[1];
      if (model && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id) && !headers.has("If-Match")) {
        const row = await db[model].findUnique({ where: { id }, select: { revisione: true } });
        if (row) headers.set("If-Match", String(row.revisione));
      }
      if (method === "POST" && !headers.has("Idempotency-Key")) headers.set("Idempotency-Key", randomUUID());
      return globalThis.fetch(input, { ...init, headers });
    }
    return globalThis.fetch(input, init);
  };
}
