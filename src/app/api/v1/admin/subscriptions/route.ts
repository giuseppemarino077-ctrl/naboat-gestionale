import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { MESI_PER_STAGIONE, TIPI, dataPartenzaSerializzata, etichetta, listino, listinoPerTenant, marcaScaduti, preventivo, quantitaAmmessa } from "@/lib/subscriptions";
import { z } from "zod";

// NaBoat: listino (attivazione, canone mensile/stagionale, fee), elenco abbonamenti,
// condizioni personalizzate per azienda e interruttore del modulo Marketplace.
export async function GET() {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;

  await marcaScaduti();

  const [l, subscriptions, tenants] = await Promise.all([
    listino(),
    prisma.subscription.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
      include: { tenant: { select: { nome: true, status: true } } },
    }),
    prisma.tenant.findMany({
      orderBy: { nome: "asc" },
      select: {
        id: true,
        nome: true,
        status: true,
        moduloMarketplace: true,
        feeNaboatPct: true,
        prezzoAttivazioneCent: true,
        canoneMensileCent: true,
        canoneStagionaleCent: true,
      },
    }),
  ]);

  const incassatoCent = subscriptions
    .filter((s) => s.stato === "attivo" || s.stato === "scaduto")
    .reduce((tot, s) => tot + s.prezzoCent, 0);

  return ok({ listino: l, mesiPerStagione: MESI_PER_STAGIONE, tipi: TIPI, subscriptions, tenants, incassatoCent });
}

const ListinoSchema = z.object({
  azione: z.literal("listino"),
  prezzoAttivazioneEuro: z.string().max(20),
  canoneMensileEuro: z.string().max(20),
  canoneStagionaleEuro: z.string().max(20),
  // Listino del modulo Ormeggio (prodotto separato, stessi campi)
  prezzoAttivazioneOrmeggioEuro: z.string().max(20).optional(),
  canoneOrmeggioMensileEuro: z.string().max(20).optional(),
  feeNaboatPctDefault: z.number().min(0).max(50),
  abbonamentoObbligatorio: z.boolean(),
});

const CondizioniSchema = z.object({
  azione: z.literal("condizioniAzienda"),
  id: z.string().uuid(),
  moduloMarketplace: z.boolean(),
  feeNaboatPct: z.number().min(0).max(50),
  prezzoAttivazioneEuro: z.string().max(20).optional().nullable(),
  canoneMensileEuro: z.string().max(20).optional().nullable(),
  canoneStagionaleEuro: z.string().max(20).optional().nullable(),
});

const StatoSchema = z.object({
  azione: z.enum(["attiva", "annulla"]),
  id: z.string().uuid(),
});

const ManualeSchema = z.object({
  azione: z.literal("creaManuale"),
  id: z.string().uuid(), // azienda
  tipo: z.enum(TIPI),
  quantita: z.number().int().default(1),
});

function parseEuro(v: string): number | null {
  const n = Math.round(Number(String(v).trim().replace(",", ".")) * 100);
  return Number.isFinite(n) && n >= 0 && n <= 100000000 ? n : null;
}

export async function PATCH(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const body = await req.json().catch(() => null);

  // --- Listino di piattaforma ---
  const listinoP = ListinoSchema.safeParse(body);
  if (listinoP.success) {
    const attivazione = parseEuro(listinoP.data.prezzoAttivazioneEuro);
    const mensile = parseEuro(listinoP.data.canoneMensileEuro);
    const stagionale = parseEuro(listinoP.data.canoneStagionaleEuro);
    if (attivazione === null || mensile === null || stagionale === null) return fail("Importi non validi", 422);

    // Listino ormeggio: se i campi non arrivano, restano com'erano.
    const attivazioneOrm = listinoP.data.prezzoAttivazioneOrmeggioEuro === undefined ? undefined : parseEuro(listinoP.data.prezzoAttivazioneOrmeggioEuro);
    const mensileOrm = listinoP.data.canoneOrmeggioMensileEuro === undefined ? undefined : parseEuro(listinoP.data.canoneOrmeggioMensileEuro);
    if (attivazioneOrm === null || mensileOrm === null) return fail("Importi ormeggio non validi", 422);

    const salvato = await prisma.platformSettings.upsert({
      where: { id: "singleton" },
      update: {
        prezzoAttivazioneCent: attivazione,
        canoneMensileCent: mensile,
        canoneStagionaleCent: stagionale,
        ...(attivazioneOrm !== undefined ? { prezzoAttivazioneOrmeggioCent: attivazioneOrm } : {}),
        ...(mensileOrm !== undefined ? { canoneOrmeggioMensileCent: mensileOrm } : {}),
        feeNaboatPctDefault: listinoP.data.feeNaboatPctDefault,
        abbonamentoObbligatorio: listinoP.data.abbonamentoObbligatorio,
      },
      create: {
        id: "singleton",
        prezzoAttivazioneCent: attivazione,
        canoneMensileCent: mensile,
        canoneStagionaleCent: stagionale,
        feeNaboatPctDefault: listinoP.data.feeNaboatPctDefault,
        abbonamentoObbligatorio: listinoP.data.abbonamentoObbligatorio,
      },
    });
    await prisma.auditLog.create({
      data: { actorId: g.session.sub, azione: "listino.modificato", entita: "PlatformSettings", entitaId: salvato.id },
    });
    return ok(salvato);
  }

  // --- Condizioni personalizzate di una azienda ---
  const condP = CondizioniSchema.safeParse(body);
  if (condP.success) {
    const d = condP.data;
    const leggi = (v: string | null | undefined): number | null | undefined => {
      if (v === undefined) return undefined;
      if (v === null || v.trim() === "") return null;
      const cent = parseEuro(v);
      if (cent === null) throw new Error("Importo non valido");
      return cent;
    };
    let attivazione, mensile, stagionale;
    try {
      attivazione = leggi(d.prezzoAttivazioneEuro);
      mensile = leggi(d.canoneMensileEuro);
      stagionale = leggi(d.canoneStagionaleEuro);
    } catch {
      return fail("Importi non validi", 422);
    }

    const tenant = await prisma.tenant
      .update({
        where: { id: d.id },
        data: {
          moduloMarketplace: d.moduloMarketplace,
          feeNaboatPct: d.feeNaboatPct,
          ...(attivazione !== undefined ? { prezzoAttivazioneCent: attivazione } : {}),
          ...(mensile !== undefined ? { canoneMensileCent: mensile } : {}),
          ...(stagionale !== undefined ? { canoneStagionaleCent: stagionale } : {}),
        },
        select: { id: true, nome: true, moduloMarketplace: true, feeNaboatPct: true, prezzoAttivazioneCent: true, canoneMensileCent: true, canoneStagionaleCent: true },
      })
      .catch(() => null);
    if (!tenant) return fail("Azienda non trovata", 404);
    await prisma.auditLog.create({
      data: { tenantId: tenant.id, actorId: g.session.sub, azione: "condizioni.modificate", entita: "Tenant", entitaId: tenant.id },
    });
    return ok(tenant);
  }

  // --- Creazione manuale (bonifico) ---
  const manuale = ManualeSchema.safeParse(body);
  if (manuale.success) {
    if (!quantitaAmmessa(manuale.data.tipo, manuale.data.quantita)) return fail("Quantità non ammessa", 422);
    const tenant = await prisma.tenant.findUnique({ where: { id: manuale.data.id }, select: { id: true } });
    if (!tenant) return fail("Azienda non trovata", 404);
    if (manuale.data.tipo === "attivazione") {
      const gia = await prisma.subscription.findFirst({ where: { tenantId: tenant.id, tipo: "attivazione", stato: "attivo" }, select: { id: true } });
      if (gia) return fail("Attivazione già registrata per questa azienda", 422);
    }
    // Si usa il listino effettivo dell'azienda (listino di piattaforma + override).
    const l = await listinoPerTenant(tenant.id);
    const inizio = manuale.data.tipo === "attivazione" ? new Date() : await dataPartenzaSerializzata(tenant.id);
    const prev = preventivo(manuale.data.tipo, manuale.data.quantita, l, inizio);
    const sub = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        tipo: manuale.data.tipo,
        quantita: manuale.data.quantita,
        prezzoCent: prev.prezzoCent,
        inizioAt: prev.inizioAt,
        fineAt: prev.fineAt,
        stato: "attivo",
        metodo: "manuale",
        paidAt: new Date(),
      },
    });
    await prisma.auditLog.create({
      data: { tenantId: tenant.id, actorId: g.session.sub, azione: `abbonamento.creato.${manuale.data.tipo}`, entita: "Subscription", entitaId: sub.id },
    });
    return ok({ ...sub, etichetta: etichetta(sub.tipo, sub.quantita) }, 201);
  }

  // --- Attiva / annulla un abbonamento esistente ---
  const stato = StatoSchema.safeParse(body);
  if (stato.success) {
    const sub = await prisma.subscription.findUnique({ where: { id: stato.data.id }, select: { id: true, tenantId: true, stato: true } });
    if (!sub) return fail("Abbonamento non trovato", 404);

    if (stato.data.azione === "attiva") {
      if (sub.stato === "attivo") return fail("Abbonamento già attivo", 422);
      const upd = await prisma.subscription.update({
        where: { id: sub.id },
        data: { stato: "attivo", paidAt: new Date(), metodo: "manuale" },
      });
      await prisma.auditLog.create({
        data: { tenantId: sub.tenantId, actorId: g.session.sub, azione: "abbonamento.attivato.manuale", entita: "Subscription", entitaId: sub.id },
      });
      return ok({ id: upd.id, stato: upd.stato });
    }

    const upd = await prisma.subscription.update({ where: { id: sub.id }, data: { stato: "annullato" } });
    await prisma.auditLog.create({
      data: { tenantId: sub.tenantId, actorId: g.session.sub, azione: "abbonamento.annullato", entita: "Subscription", entitaId: sub.id },
    });
    return ok({ id: upd.id, stato: upd.stato });
  }

  return fail("Richiesta non valida", 422);
}
