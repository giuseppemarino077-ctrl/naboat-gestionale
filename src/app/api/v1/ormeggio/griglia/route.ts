import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireOrmeggio } from "@/lib/ormeggio";

// Griglia ormeggio per una data: posti + permanenza presente a quella data.
// La posizione NON si legge da Permanenza.postoId (che è solo il posto corrente):
// si ricostruisce dalle assegnazioni con validità temporale, così una data passata
// mostra il posto realmente occupato allora, anche dopo spostamenti o chiusure.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;

  const dataStr = new URL(req.url).searchParams.get("data");
  const data = dataStr ? new Date(`${dataStr}T12:00:00`) : new Date();
  if (Number.isNaN(data.getTime())) return fail("Data non valida", 422);
  const inizio = new Date(data); inizio.setHours(0, 0, 0, 0);
  const fine = new Date(data); fine.setHours(23, 59, 59, 999);

  const [aree, assegnazioni] = await Promise.all([
    prisma.area.findMany({
      where: { tenantId: t.tenantId },
      orderBy: [{ ordine: "asc" }, { createdAt: "asc" }],
      include: { posti: { orderBy: [{ riga: "asc" }, { colonna: "asc" }] } },
    }),
    prisma.assegnazionePosto.findMany({
      where: {
        tenantId: t.tenantId,
        dal: { lte: fine },
        OR: [{ al: null }, { al: { gt: inizio } }],
      },
      include: {
        posto: { select: { id: true, areaId: true } },
        permanenza: {
          include: {
            boat: { include: { proprietario: { select: { nome: true, telefono: true } } } },
            attivita: { select: { stato: true } },
            addebiti: { select: { importoCent: true, stato: true } },
            payments: { select: { stato: true, totaleCent: true } },
            contratto: { select: { firmatoAt: true } },
            movimenti: { select: { tipo: true, effettivoAt: true }, orderBy: [{ effettivoAt: "desc" }, { createdAt: "desc" }] },
          },
        },
      },
    }),
  ]);

  type Perm = (typeof assegnazioni)[number]["permanenza"];

  function semaforo(p: Perm) {
    const motivi: string[] = [];
    const bloccata = p.boat.stato === "manutenzione" || p.boat.stato === "non_disponibile";
    if (p.boat.stato === "manutenzione") motivi.push("barca in manutenzione");
    if (p.boat.stato === "non_disponibile") motivi.push("barca non disponibile");
    if (p.attivita.some((a) => a.stato === "da_fare")) motivi.push("attività da fare");
    if (!p.contratto?.firmatoAt) motivi.push("contratto da firmare");
    if (t.vedeImporti !== false) {
      const totale = p.addebiti.reduce((s, a) => s + a.importoCent, 0);
      const incassato = p.payments.filter((x) => x.stato === "pagato").reduce((s, x) => s + x.totaleCent, 0);
      if (totale - incassato > 0) motivi.push("conto da saldare");
    }
    return { colore: bloccata ? "rosso" : motivi.length ? "giallo" : "verde", motivi };
  }

  // Stato per la griglia "a battaglia navale": in sosta · da fare · in mare · bloccata.
  // "In mare" significa presenza della barca fuori: l'ultimo movimento effettivo
  // (fino alla data mostrata) è un'uscita senza rientro; il posto resta assegnato.
  function statoGriglia(p: Perm) {
    const ultimo = p.movimenti.find((m) => {
      if (m.tipo !== "uscita" && m.tipo !== "rientro") return false;
      if (!m.effettivoAt) return false;
      return new Date(m.effettivoAt) <= fine;
    });
    const inMare = ultimo?.tipo === "uscita";
    const bloccata = p.boat.stato === "manutenzione" || p.boat.stato === "non_disponibile";
    const attivitaDaFare = p.attivita.filter((a) => a.stato === "da_fare" || a.stato === "in_corso").length;
    const stato = bloccata ? "bloccata" : inMare ? "in_mare" : attivitaDaFare > 0 ? "da_fare" : "in_sosta";
    return { statoGriglia: stato, inMare, attivitaDaFare };
  }

  const perPosto = new Map(assegnazioni.map((a) => [a.postoId, a.permanenza]));

  const areeOut = aree.map((a) => ({
    id: a.id,
    nome: a.nome,
    righe: a.righe,
    colonne: a.colonne,
    posti: a.posti.map((posto) => {
      const perm = perPosto.get(posto.id) ?? null;
      return {
        id: posto.id,
        riga: posto.riga,
        colonna: posto.colonna,
        codice: posto.codice,
        bloccato: posto.bloccato,
        permanenza: perm
          ? {
              id: perm.id,
              boatId: perm.boatId,
              boatNome: perm.boat.nome,
              boatStato: perm.boat.stato,
              proprietario: perm.boat.proprietario?.nome ?? null,
              telefono: perm.boat.proprietario?.telefono ?? null,
              tipo: perm.tipo,
              finePrevistaAt: perm.finePrevistaAt,
              ...semaforo(perm),
              ...statoGriglia(perm),
            }
          : null,
      };
    }),
  }));

  const posti = areeOut.flatMap((a) => a.posti);
  const riepilogo = {
    totale: posti.length,
    liberi: posti.filter((p) => !p.permanenza && !p.bloccato).length,
    occupati: posti.filter((p) => p.permanenza).length,
    nonUsabili: posti.filter((p) => p.bloccato).length,
    daSistemare: posti.filter((p) => p.permanenza?.colore === "giallo").length,
    bloccate: posti.filter((p) => p.permanenza?.colore === "rosso").length,
  };

  return ok({ aree: areeOut, riepilogo });
}
