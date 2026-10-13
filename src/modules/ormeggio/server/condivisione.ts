import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { fail } from "@/lib/api";
import { transazioneCondivisa } from "@/lib/db";
import { requireOrmeggio } from "@/modules/ormeggio/accesso";

const risorse = {
  aree: { table: "Area", delegate: "area" }, posti: { table: "Posto", delegate: "posto" }, barche: { table: "Boat", delegate: "boat" },
  permanenze: { table: "Permanenza", delegate: "permanenza" }, attivita: { table: "Attivita", delegate: "attivita" },
  addebiti: { table: "Addebito", delegate: "addebito" },
  proprietari: { table: "Proprietario", delegate: "proprietario" }, servizi: { table: "ServizioCatalogo", delegate: "servizioCatalogo" },
} as const;
class Annulla extends Error { constructor(public risposta: Response) { super("Operazione annullata"); } }
function datiAudit(record: Record<string, unknown> | null) {
  if (!record) return null;
  const campi = new Set(["nome", "stato", "postoId", "boatId", "pronta", "fineAt", "finePrevistaAt", "inizioAt", "tipo", "note", "priorita", "addettoId", "quantita", "incluso", "righe", "colonne", "archiviata", "bloccato", "prezzoCent", "corrispettivoCent", "importoCent", "codice", "revisione"]);
  return Object.fromEntries(Object.entries(record).filter(([key]) => campi.has(key)));
}
function rispostaVisibile(json: Record<string, unknown>, risorsa: string, t: { vedeImporti?: boolean; ruoloOrmeggio?: string }) {
  if (t.vedeImporti || !["permanenze", "attivita"].includes(risorsa)) return json;
  if (risorsa === "attivita") return { ...json, prezzoCent: null };
  if (t.ruoloOrmeggio !== "addetto") return { ...json, corrispettivoCent: null };
  const safe = new Set(["id", "revisione", "boatId", "postoId", "tipo", "inizioAt", "finePrevistaAt", "fineAt", "stato", "pronta"]);
  return Object.fromEntries(Object.entries(json).filter(([key]) => safe.has(key)));
}

type Operazione = (...args: any[]) => Promise<Response | undefined>;
export function operazioneCondivisa<H extends Operazione>(handler: H): H {
  return (async (...args: Parameters<H>) => {
    const req = args[0] as Request;
    const t = await requireOrmeggio(req);
    if ("error" in t) return t.error;
    const path = new URL(req.url).pathname.replace("/api/v1/ormeggio/", "").split("/");
    const body = req.method === "DELETE" ? null : await req.clone().json().catch(() => null);
    const resource = path[0] === "movimenti" ? risorse.permanenze : risorse[path[0] as keyof typeof risorse];
    const id = path[0] === "movimenti" ? body?.permanenzaId : path[1];
    const mutazioneEsistente = !!resource && typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);
    const header = req.headers.get("If-Match");
    const versione = header && /^"?\d+"?$/.test(header) ? Number(header.replaceAll('"', "")) : null;
    const chiave = req.headers.get("Idempotency-Key");
    const idempotente = req.method === "POST" && (!!chiave || path[0] === "movimenti" || path[0] === "permanenze" && !path[1]);
    if (idempotente && (!chiave || !/^[A-Za-z0-9_-]{16,100}$/.test(chiave))) return fail("Indica una chiave univoca dell'operazione (Idempotency-Key)", 422);
    const impronta = createHash("sha256").update(JSON.stringify([req.method, new URL(req.url).pathname, body, header])).digest("hex");
    try {
      return await transazioneCondivisa(async (tx) => {
        await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${t.tenantId} FOR SHARE`;
        await tx.$queryRaw`SELECT id FROM "Appartenenza" WHERE "tenantId" = ${t.tenantId} AND "userId" = ${t.userId} FOR SHARE`;
        const fresh = await requireOrmeggio(req);
        if ("error" in fresh) throw new Annulla(fresh.error ?? fail("Accesso negato", 403));
        if (idempotente && chiave) {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`${t.tenantId}:${t.userId}:${chiave}`}, 0))`;
          const old = await tx.operazioneCondivisa.findUnique({ where: { tenantId_userId_chiave: { tenantId: t.tenantId, userId: t.userId, chiave } } });
          if (old) {
            if (old.impronta !== impronta) throw new Annulla(fail("Chiave già usata per un'operazione diversa", 409));
            return NextResponse.json(rispostaVisibile(old.risposta as Record<string, unknown>, path[0], fresh), { status: old.status, headers: { "Idempotency-Replayed": "true" } });
          }
        }
        let contoId = typeof body?.permanenzaId === "string" ? body.permanenzaId : path[0] === "permanenze" ? id : null;
        if (["addebiti", "attivita"].includes(path[0]) && mutazioneEsistente) {
          const delegate = tx[resource.delegate] as unknown as { findFirst: (args: object) => Promise<{ permanenzaId: string } | null> };
          contoId = (await delegate.findFirst({ where: { id, tenantId: t.tenantId }, select: { permanenzaId: true } }))?.permanenzaId ?? null;
        }
        if (contoId && ["permanenze", "addebiti", "incassi", "attivita"].includes(path[0])) await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`conto:${t.tenantId}:${contoId}`}, 0))`;
        let prima: Record<string, unknown> | null = null;
        if (mutazioneEsistente) {
          const rows = await tx.$queryRawUnsafe<{ revisione: number }[]>(`SELECT "revisione" FROM "${resource.table}" WHERE id = $1 AND "tenantId" = $2 FOR UPDATE`, id, t.tenantId);
          if (!rows.length) throw new Annulla(fail("Elemento non trovato", 404));
          if (versione == null || versione < 1) throw new Annulla(fail("Ricarica la scheda: è richiesta la revisione corrente (If-Match)", 422));
          if (rows[0].revisione !== versione) {
            const ultima = await tx.auditLog.findFirst({ where: { tenantId: t.tenantId, entita: resource.table, entitaId: id }, orderBy: { createdAt: "desc" }, select: { actorId: true } });
            const nomeConsentito = fresh.role === "owner" || fresh.role === "superadmin" || fresh.ruoloOrmeggio === "responsabile";
            const autore = ultima?.actorId && nomeConsentito ? await tx.appartenenza.findFirst({ where: { tenantId: t.tenantId, userId: ultima.actorId }, select: { user: { select: { nome: true } } } }) : null;
            throw new Annulla(fail(`${autore?.user.nome ?? "Un altro operatore"} ha modificato questi dati. Le tue modifiche non sono state salvate: aggiorna la scheda e confrontale prima di riprovare.`, 409));
          }
          const delegate = tx[resource.delegate] as unknown as { findFirst: (args: object) => Promise<Record<string, unknown> | null> };
          prima = await delegate.findFirst({ where: { id, tenantId: t.tenantId } });
        }
        if (typeof body?.postoId === "string" && /^[0-9a-f-]{36}$/i.test(body.postoId)) {
          await tx.$queryRaw`SELECT a.id FROM "Area" a JOIN "Posto" p ON p."areaId" = a.id WHERE p.id = ${body.postoId} AND p."tenantId" = ${t.tenantId} FOR SHARE OF a`;
          await tx.$queryRaw`SELECT id FROM "Posto" WHERE id = ${body.postoId} AND "tenantId" = ${t.tenantId} FOR UPDATE`;
        }
        let response = await handler(...args);
        if (!response || !response.ok) throw new Annulla(response ?? fail("Operazione non riuscita", 500));
        if (!fresh.vedeImporti && ["permanenze", "attivita"].includes(path[0])) {
          const json = await response.clone().json();
          response = NextResponse.json(rispostaVisibile(json, path[0], fresh), { status: response.status });
        }
        let dopo: Record<string, unknown> | null = null;
        if (mutazioneEsistente) {
          if (path[0] === "movimenti") await tx.permanenza.updateMany({ where: { id, tenantId: t.tenantId }, data: { pronta: prima?.pronta === true } });
          const delegate = tx[resource.delegate] as unknown as { findFirst: (args: object) => Promise<Record<string, unknown> | null> };
          dopo = await delegate.findFirst({ where: { id, tenantId: t.tenantId } });
          if (dopo && dopo.revisione === prima?.revisione) {
            await tx.$executeRawUnsafe(`UPDATE "${resource.table}" SET revisione = revisione + 1 WHERE id = $1 AND "tenantId" = $2`, id, t.tenantId);
            dopo = await delegate.findFirst({ where: { id, tenantId: t.tenantId } });
          }
          if (dopo && req.method !== "DELETE") {
            const json = await response.clone().json();
            if (json.id === id) response = NextResponse.json({ ...json, revisione: dopo.revisione }, { status: response.status });
          }
        }
        await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: `ormeggio.condivisa.${req.method.toLowerCase()}`, entita: resource?.table ?? path[0], entitaId: mutazioneEsistente ? id : null, dettagli: JSON.stringify({ prima: datiAudit(prima), dopo: datiAudit(dopo) }) } });
        if (idempotente && chiave) {
          const json = await response.clone().json();
          await tx.operazioneCondivisa.create({ data: { tenantId: t.tenantId, userId: t.userId, chiave, impronta, risposta: json as Prisma.InputJsonValue, status: response.status } });
        }
        return response;
      });
    } catch (e) {
      if (e instanceof Annulla) return e.risposta;
      const message = e instanceof Error ? e.message : "";
      if (/23P01|exclusion constraint|senza_sovrapposizioni|P2034|deadlock detected|ultimo_titolare_attivo/i.test(message)) return fail("Conflitto con un'altra operazione: aggiorna i dati prima di riprovare", 409);
      throw e;
    }
  }) as H;
}
