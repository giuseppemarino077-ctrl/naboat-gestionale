import { fail, ok } from "@/lib/api";
import { traccia } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { CODICI_ESPERIENZA } from "@/lib/esperienze";
import { motivoNonIdonea } from "@/lib/marketplace";
import { bloccaPiano, verificaFotoPiano, verificaPubblicazione } from "@/lib/piani";
import { portoDelTenant, modelloValido } from "@/lib/riferimenti";
import { deletePhoto } from "@/lib/storage";
import { rigeneraBarca } from "@/lib/seo";
import { requireAzienda } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  nome: z.string().min(2).max(160).optional(),
  tipo: z.string().max(40).optional().nullable(),
  capienza: z.number().int().min(1).max(60).optional().nullable(),
  potenzaCv: z.number().min(0).max(100000).optional().nullable(),
  codiceInterno: z.string().max(80).optional().nullable(),
  patenteRichiesta: z.boolean().optional(),
  stato: z.enum(["disponibile", "non_disponibile", "manutenzione"]).optional(),
  fotoCopertina: z.string().max(500).optional().nullable(),
  rimuoviFoto: z.string().max(500).optional(),
  lat: z.number().min(-90).max(90).optional().nullable(),
  lon: z.number().min(-180).max(180).optional().nullable(),
  portoId: z.string().uuid().optional().nullable(),
  modelloId: z.string().uuid().optional().nullable(),
  descrizione: z.string().max(3000).optional().nullable(),
  lunghezzaM: z.number().min(0).max(200).optional().nullable(),
  cabine: z.number().int().min(0).max(30).optional().nullable(),
  dotazioni: z.array(z.string().max(60)).max(40).optional(),
  esperienze: z.array(z.string().max(40)).max(40).optional(),
  esperienzePersonalizzate: z.array(z.string().max(80)).max(20).optional(),
  carburante: z.string().max(80).optional().nullable(),
  cauzioneCent: z.number().int().min(0).max(100000000).optional().nullable(),
  etaMinima: z.number().int().min(0).max(99).optional().nullable(),
  pubblicata: z.boolean().optional(),
  inPausa: z.boolean().optional(),
  archiviato: z.boolean().optional(),
  ordineFoto: z.array(z.string().max(500)).max(60).optional(),
  // Pagamenti online della singola barca: eredita | attivi | disattivati.
  pagamentiOnline: z.enum(["eredita", "attivi", "disattivati"]).optional(),
});

// Dettaglio barca con i riferimenti usati dalla scheda (porto, modello, dotazioni).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const barca = await prisma.boat.findFirst({
    where: { id, tenantId: t.tenantId },
    include: { porto: { select: { id: true, nome: true } }, modello: { select: { id: true, modello: true, marca: true } } },
  });
  if (!barca) return fail("Barca non trovata", 404);
  return ok(barca);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = Schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Dati non validi", 422);
  const cur = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!cur) return fail("Barca non trovata", 404);
  if (p.data.portoId && !(await portoDelTenant(t.tenantId, p.data.portoId))) return fail("Porto non valido per questa azienda", 422);
  if (p.data.modelloId && !(await modelloValido(p.data.modelloId))) return fail("Modello non valido", 422);
  if (p.data.esperienze && p.data.esperienze.some((c) => !CODICI_ESPERIENZA.has(c))) return fail("Esperienza non valida", 422);
  if (p.data.esperienzePersonalizzate) {
    const pulite = p.data.esperienzePersonalizzate.map((s) => s.trim()).filter(Boolean);
    p.data.esperienzePersonalizzate = Array.from(new Set(pulite));
  }
  if (p.data.esperienze || p.data.esperienzePersonalizzate) {
    const ten = await prisma.tenant.findUnique({ where: { id: t.tenantId }, select: { esperienzeAttive: true, esperienzePersonalizzate: true } });
    const attive = new Set(ten?.esperienzeAttive ?? []);
    const custom = new Set(ten?.esperienzePersonalizzate ?? []);
    if (p.data.esperienze?.some((c) => !attive.has(c))) return fail("Esperienza non attiva per questa azienda", 422);
    if (p.data.esperienzePersonalizzate?.some((s) => !custom.has(s))) return fail("Esperienza personalizzata non valida", 422);
  }

  // Tutto il calcolo di pubblicabilità e limiti sta nella transazione, con il
  // lock del piano: due pubblicazioni simultanee non sfondano il tetto Free.
  const esito = await prisma.$transaction(async (tx) => {
    await bloccaPiano(tx, t.tenantId);
    const attuale = await tx.boat.findFirst({ where: { id, tenantId: t.tenantId } });
    if (!attuale) return { ok: false as const, stato: 404, errore: "Barca non trovata" };

    let gallery = attuale.fotoGallery;
    let copertina = p.data.fotoCopertina !== undefined ? p.data.fotoCopertina : attuale.fotoCopertina;
    let daCancellare: string | null = null;
    if (p.data.rimuoviFoto) {
      // Si cancella solo un file realmente associato a questa barca: un percorso
      // arbitrario inviato dal client non deve raggiungere il cancellatore.
      if (gallery.includes(p.data.rimuoviFoto)) {
        gallery = gallery.filter((u) => u !== p.data.rimuoviFoto);
        if (copertina === p.data.rimuoviFoto) copertina = gallery[0] ?? null;
        daCancellare = p.data.rimuoviFoto;
      }
    }
    // Riordino della galleria: si accettano solo foto già presenti; le mancanti restano in coda.
    if (p.data.ordineFoto) {
      const presenti = new Set(gallery);
      const ordinate = p.data.ordineFoto.filter((u) => presenti.has(u));
      const resto = gallery.filter((u) => !ordinate.includes(u));
      gallery = [...ordinate, ...resto];
    }
    if (copertina && !gallery.includes(copertina)) return { ok: false as const, stato: 422, errore: "Copertina non in galleria" };

    const { rimuoviFoto: _r, fotoCopertina: _c, ordineFoto: _o, ...rest } = p.data;

    const tenant = await tx.tenant.findUnique({ where: { id: t.tenantId }, select: { status: true, moduloMarketplace: true } });
    const tariffeAttive = await tx.tariffa.count({ where: { boatId: attuale.id, tenantId: t.tenantId, attivo: true } });
    const requisiti = {
      uso: attuale.uso,
      archiviato: attuale.archiviato,
      bloccataAdmin: attuale.bloccataAdmin,
      fotoCopertina: copertina,
      fotoGallery: gallery,
      tariffeAttive,
      aziendaStatus: tenant?.status ?? "pending",
      moduloMarketplace: tenant?.moduloMarketplace ?? false,
    };

    // M01: la pubblicazione richiede i requisiti; il blocco NaBoat non si aggira.
    if (rest.pubblicata === true) {
      const motivo = motivoNonIdonea({ ...requisiti, pubblicata: true, inPausa: rest.inPausa ?? attuale.inPausa });
      if (motivo) return { ok: false as const, stato: attuale.bloccataAdmin ? 409 : motivo.includes("Marketplace") ? 403 : 422, errore: motivo };
      const lim = await verificaPubblicazione(tx, t.tenantId, { boatId: attuale.id, fotoCount: gallery.length });
      if (!lim.ok) return { ok: false as const, stato: 402, errore: lim.messaggio };
    }

    const pubblicataDopo = rest.pubblicata ?? attuale.pubblicata;
    const inPausaDopo = rest.inPausa ?? attuale.inPausa;
    const nelCatalogo = pubblicataDopo && !inPausaDopo && !attuale.bloccataAdmin;

    // M02: una barca già nel catalogo rispetta il limite foto anche nelle modifiche.
    if (nelCatalogo && rest.pubblicata !== true) {
      const limFoto = await verificaFotoPiano(tx, t.tenantId, gallery.length);
      if (!limFoto.ok) return { ok: false as const, stato: 402, errore: limFoto.messaggio };
    }

    // M01: se la modifica toglie i requisiti (ultima foto rimossa) la barca non
    // resta pubblicata. In ogni caso il catalogo la esclude con FILTRO_CATALOGO,
    // così una tariffa disattivata altrove non la lascia esposta.
    if (nelCatalogo && gallery.length === 0 && !copertina) rest.pubblicata = false;

    const aggiornata = await tx.boat.update({ where: { id: attuale.id }, data: { ...rest, fotoGallery: gallery, fotoCopertina: copertina } });
    return { ok: true as const, aggiornata, prima: attuale, fotoCopertina: copertina, fotoGallery: gallery, daCancellare };
  });

  if (!esito.ok) return fail(esito.errore, esito.stato);
  // Il file rimosso si cancella solo a transazione riuscita: se i limiti bloccano
  // la modifica, la foto resta al suo posto.
  if (esito.daCancellare) await deletePhoto(esito.daCancellare);
  await traccia({
    tenantId: t.tenantId,
    actorId: t.userId,
    azione: "boat.modificata",
    entita: "Boat",
    entitaId: esito.prima.id,
    prima: esito.prima as unknown as Record<string, unknown>,
    dopo: esito.aggiornata as unknown as Record<string, unknown>,
  });
  // I testi della pagina pubblica seguono i dati della barca.
  await rigeneraBarca(esito.prima.id).catch(() => {});
  // Contratto di risposta completo: il client non deve ricostruire la barca con
  // un oggetto parziale (che azzererebbe i campi non inviati).
  return ok(esito.aggiornata);
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const attive = await prisma.booking.count({
    where: { boatId: id, tenantId: t.tenantId, stato: { in: ["prenotata", "in_mare"] } },
  });
  if (attive > 0) return fail("Barca con prenotazioni attive: impossibile eliminare", 409);
  const cur2 = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId } });
  const d = await prisma.boat.deleteMany({ where: { id, tenantId: t.tenantId } });
  if (!d.count) return fail("Barca non trovata", 404);
  for (const u of cur2?.fotoGallery ?? []) await deletePhoto(u);
  return ok({ ok: true });
}
