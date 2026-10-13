import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { profiloOperativoLimitato, requireOrmeggio } from "@/modules/ormeggio/accesso";
import { postoNelQuadro } from "@/modules/ormeggio/regole";
import { oggi } from "@/modules/piattaforma/date";
import { vistaGiornoSoste } from "@/modules/ormeggio/periodi";
import { riepilogoConto } from "@/modules/ormeggio/conto";

// Griglia ormeggio per una data: posti + permanenza presente a quella data.
// La posizione NON si legge da Permanenza.postoId (che è solo il posto corrente):
// si ricostruisce dalle assegnazioni con validità temporale, così una data passata
// mostra il posto realmente occupato allora, anche dopo spostamenti o chiusure.
export async function GET(req: Request) {
  const t = await requireOrmeggio(req);
  if ("error" in t) return t.error;

  const dataStr = new URL(req.url).searchParams.get("data");
  const limitato = profiloOperativoLimitato(t);
  if (limitato && dataStr && dataStr < oggi()) return fail("Il tuo profilo non accede allo storico", 403);
  const vista = vistaGiornoSoste(dataStr);
  if (!vista) return fail("Data non valida", 422);
  const { fino } = vista;

  const [aree, assegnazioni] = await Promise.all([
    prisma.area.findMany({
      where: { tenantId: t.tenantId, archiviata: false },
      orderBy: [{ ordine: "asc" }, { createdAt: "asc" }],
      include: { posti: { orderBy: [{ riga: "asc" }, { colonna: "asc" }] } },
    }),
    prisma.assegnazionePosto.findMany({
      where: {
        tenantId: t.tenantId,
        ...vista.occupazione,
      },
      include: {
        posto: { include: { area: true } },
        permanenza: {
          include: {
            boat: { include: { proprietario: { select: { nome: true, telefono: true } } } },
            attivita: { select: { id: true, stato: true, tipo: true, dataPrevista: true, addetto: { select: { nome: true } } }, orderBy: [{ dataPrevista: "asc" }, { createdAt: "asc" }] },
            addebiti: { select: { importoCent: true, stato: true } },
            payments: { where: { tenantId: t.tenantId }, select: { stato: true, totaleCent: true, rimborsoCent: true, tipo: true, condizioniSnapshot: true, refunds: { where: { tenantId: t.tenantId }, select: { stato: true, importoCent: true } } } },
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
    const segnalazioni: { tipo: "attivita" | "contratto" | "conto"; descrizione: string; dettagli?: string[] }[] = [];
    const bloccata = p.boat.stato === "manutenzione" || p.boat.stato === "non_disponibile";
    if (p.boat.stato === "manutenzione") motivi.push("barca in manutenzione");
    if (p.boat.stato === "non_disponibile") motivi.push("barca non disponibile");
    const lavori = p.attivita.filter((a) => a.stato === "da_fare" || a.stato === "in_corso");
    if (lavori.length) { motivi.push("attività da completare"); segnalazioni.push({ tipo: "attivita", descrizione: `${lavori.length} attività da completare`, dettagli: lavori.map((a) => `${a.tipo} · ${a.stato === "in_corso" ? "in corso" : "da fare"}`) }); }
    if (!p.contratto?.firmatoAt) { motivi.push("contratto da firmare"); segnalazioni.push({ tipo: "contratto", descrizione: p.contratto ? "Contratto in attesa di firma" : "Contratto da generare e firmare" }); }
    if (t.vedeImporti !== false) {
      if (riepilogoConto(p.addebiti, p.payments).residuoCent > 0) { motivi.push("conto da saldare"); segnalazioni.push({ tipo: "conto", descrizione: "Conto da saldare" }); }
    }
    return { colore: bloccata ? "rosso" : motivi.length ? "giallo" : "verde", motivi, segnalazioni };
  }

  // Stato per la griglia "a battaglia navale": in sosta · da fare · in mare · bloccata.
  // "In mare" significa presenza della barca fuori: l'ultimo movimento effettivo
  // (fino alla data mostrata) è un'uscita senza rientro; il posto resta assegnato.
  function statoGriglia(p: Perm) {
    const ultimo = p.movimenti.find((m) => {
      if (m.tipo !== "uscita" && m.tipo !== "rientro") return false;
      if (!m.effettivoAt) return false;
      return new Date(m.effettivoAt) <= fino;
    });
    const inMare = ultimo?.tipo === "uscita";
    const bloccata = p.boat.stato === "manutenzione" || p.boat.stato === "non_disponibile";
    const attivitaAperte = p.attivita.filter((a) => a.stato === "da_fare" || a.stato === "in_corso");
    const attivitaDaFare = attivitaAperte.length;
    const stato = bloccata ? "bloccata" : inMare ? "in_mare" : attivitaDaFare > 0 ? "da_fare" : "in_sosta";
    return { statoGriglia: stato, inMare, attivitaDaFare, attivitaAperte };
  }

  const perPosto = new Map(assegnazioni.map((a) => [a.postoId, a.permanenza]));

  const areeOut = aree.map((a) => ({
    id: a.id,
    nome: a.nome,
    revisione: a.revisione,
    righe: a.righe,
    colonne: a.colonne,
    posti: a.posti.filter((posto) => postoNelQuadro({ ...posto, area: a })).map((posto) => {
      const perm = perPosto.get(posto.id) ?? null;
      return {
        id: posto.id,
        revisione: posto.revisione,
        riga: posto.riga,
        colonna: posto.colonna,
        codice: posto.codice,
        bloccato: posto.bloccato,
        permanenza: perm
          ? {
              id: perm.id,
              revisione: perm.revisione,
              boatRevisione: perm.boat.revisione,
              boatId: perm.boatId,
              boatNome: perm.boat.nome,
              boatStato: perm.boat.stato,
              boatTipo: perm.boat.tipo,
              boatTipoCodice: perm.boat.tipoCodice,
              proprietario: limitato ? null : perm.boat.proprietario?.nome ?? null,
              telefono: limitato ? null : perm.boat.proprietario?.telefono ?? null,
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

  const visibili = new Set(assegnazioni.filter((a) => postoNelQuadro(a.posto)).map((a) => a.permanenzaId));
  const fuoriGriglia = [...new Map(assegnazioni.filter((a) => !postoNelQuadro(a.posto) && !visibili.has(a.permanenzaId)).map((a) => [a.permanenzaId, {
    id: a.permanenzaId, boatNome: a.permanenza.boat.nome,
    proprietario: limitato ? null : a.permanenza.boat.proprietario?.nome ?? null,
    areaNome: a.posto.area.nome, postoCodice: a.posto.codice,
    motivo: a.posto.area.archiviata ? "Area rimossa" : "Posto rimosso dalla griglia",
  }])).values()];
  return ok({ aree: areeOut, riepilogo, fuoriGriglia });
}
