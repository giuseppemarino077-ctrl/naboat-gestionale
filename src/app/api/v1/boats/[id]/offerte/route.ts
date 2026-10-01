import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const CODICI = ["LOCAZIONE", "LOCAZIONE_CON_COMANDANTE", "NOLEGGIO"] as const;
const SKIPPER_MODI = ["NON_DISPONIBILE", "OPZIONALE", "INCLUSO", "OBBLIGATORIO"] as const;

async function barcaDelTenant(tenantId: string, id: string) {
  return prisma.boat.findFirst({ where: { id, tenantId }, select: { id: true } });
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(_req);
  if ("error" in t) return t.error;
  const { id } = await params;
  if (!(await barcaDelTenant(t.tenantId, id))) return fail("Barca non trovata", 404);
  const offerte = await prisma.boatOfferta.findMany({ where: { tenantId: t.tenantId, boatId: id } });
  const perCodice = new Map(offerte.map((o) => [o.codice, o]));
  return ok(CODICI.map((codice) => perCodice.get(codice) ?? { id: null, boatId: id, codice, attiva: false, skipperModo: "NON_DISPONIBILE", guidaAutonoma: false, etaMinima: null, noteLimiti: null, noteRequisiti: null }));
}

const Schema = z.object({
  codice: z.enum(CODICI),
  attiva: z.boolean(),
  skipperModo: z.enum(SKIPPER_MODI).default("NON_DISPONIBILE"),
  guidaAutonoma: z.boolean().default(false),
  etaMinima: z.number().int().min(18).max(99).optional().nullable(),
  noteLimiti: z.string().max(2000).optional().nullable(),
  noteRequisiti: z.string().max(2000).optional().nullable(),
}).strict();

// Salvataggio di una singola modalità (indipendente): una modifica alla locazione
// non tocca il noleggio.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  if (!(await barcaDelTenant(t.tenantId, id))) return fail("Barca non trovata", 404);
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati modalità non validi", 422);
  const v = p.data;
  // L'età minima ha senso solo con la guida autonoma consentita.
  if (v.etaMinima != null && !v.guidaAutonoma) {
    return fail("L'età minima è ammessa solo se la guida autonoma è consentita", 422);
  }
  if (!v.attiva) {
    // Disattivare una modalità non cancella lo storico: resta leggibile.
  }
  const salvata = await prisma.boatOfferta.upsert({
    where: { boatId_codice: { boatId: id, codice: v.codice } },
    update: { attiva: v.attiva, skipperModo: v.skipperModo, guidaAutonoma: v.guidaAutonoma, etaMinima: v.etaMinima ?? null, noteLimiti: v.noteLimiti ?? null, noteRequisiti: v.noteRequisiti ?? null },
    create: { tenantId: t.tenantId, boatId: id, codice: v.codice, attiva: v.attiva, skipperModo: v.skipperModo, guidaAutonoma: v.guidaAutonoma, etaMinima: v.etaMinima ?? null, noteLimiti: v.noteLimiti ?? null, noteRequisiti: v.noteRequisiti ?? null },
  });
  return ok(salvata);
}
