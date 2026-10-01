import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireAzienda } from "@/lib/tenant";
import type { Prisma } from "@prisma/client";

// Duplicazione barca: copia la configurazione riutilizzabile (tecnica, modalità,
// dotazioni con note, extra con override, tariffe) su una NUOVA unità operativa
// disponibile. Non copia identità fisica, foto, prenotazioni, storico, pubblicazione
// né eventuali richieste di eliminazione. Tutto in una transazione.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const src = await prisma.boat.findFirst({ where: { id, tenantId: t.tenantId } });
  if (!src) return fail("Barca non trovata", 404);

  const copy = await prisma.$transaction(async (tx) => {
    const nuova = await tx.boat.create({
      data: {
        // Whitelist dei campi riutilizzabili. Nessun ID/matricola/identificativo fisico.
        tenantId: t.tenantId,
        nome: `${src.nome} (copia)`,
        tipo: src.tipo,
        capienza: src.capienza,
        potenzaCv: src.potenzaCv,
        patenteRichiesta: src.patenteRichiesta,
        codiceInterno: null, // il codice interno è univoco: non si duplica
        uso: src.uso,
        stato: "disponibile", // nuova unità operativa disponibile
        lat: src.lat,
        lon: src.lon,
        portoId: src.portoId,
        modelloId: src.modelloId,
        descrizione: src.descrizione,
        lunghezzaM: src.lunghezzaM,
        cabine: src.cabine,
        carburante: src.carburante,
        cauzioneCent: src.cauzioneCent,
        etaMinima: src.etaMinima,
      },
    });

    // specs JSON: si copiano solo le chiavi configurabili note, non l'intero record.
    const specs = (src.specs ?? null) as Record<string, unknown> | null;
    if (specs && typeof specs === "object") {
      const CHIAVI = ["dotazioni_extra", "allestimento", "motore", "note_tecniche", "colore", "anno"];
      const filtrato: Record<string, unknown> = {};
      for (const k of CHIAVI) if (k in specs) filtrato[k] = specs[k];
      if (Object.keys(filtrato).length) await tx.boat.update({ where: { id: nuova.id }, data: { specs: filtrato as Prisma.InputJsonValue } });
    }

    // Modalità di utilizzo e settaggio.
    const offerte = await tx.boatOfferta.findMany({ where: { boatId: src.id, tenantId: t.tenantId } });
    for (const o of offerte) {
      await tx.boatOfferta.create({
        data: { tenantId: t.tenantId, boatId: nuova.id, codice: o.codice, attiva: o.attiva, skipperModo: o.skipperModo, guidaAutonoma: o.guidaAutonoma, etaMinima: o.etaMinima, noteLimiti: o.noteLimiti, noteRequisiti: o.noteRequisiti },
      });
    }

    // Dotazioni con note (solo associazioni strutturate; le stringhe legacy restano sulla copia
    // solo se non sono già nel catalogo, per non perdere voci personalizzate).
    const dot = await tx.boatDotazione.findMany({ where: { boatId: src.id, tenantId: t.tenantId } });
    for (const d of dot) {
      await tx.boatDotazione.create({ data: { tenantId: t.tenantId, boatId: nuova.id, dotazioneId: d.dotazioneId, nota: d.nota } });
    }

    // Extra associati con override personalizzati.
    const extra = await tx.extraBarca.findMany({ where: { boatId: src.id, tenantId: t.tenantId } });
    for (const e of extra) {
      await tx.extraBarca.create({ data: { tenantId: t.tenantId, boatId: nuova.id, extraId: e.extraId, prezzoCent: e.prezzoCent, quantitaMax: e.quantitaMax } });
    }

    // Piani/prezzi collegati alla barca (senza copiare importi di contratti firmati).
    const tariffe = await tx.tariffa.findMany({ where: { boatId: src.id, tenantId: t.tenantId } });
    for (const tariffa of tariffe) {
      await tx.tariffa.create({ data: { tenantId: t.tenantId, boatId: nuova.id, tipo: tariffa.tipo, stagione: tariffa.stagione, prezzoCent: tariffa.prezzoCent, nomePiano: tariffa.nomePiano, durataOre: tariffa.durataOre, attivo: tariffa.attivo } });
    }

    await tx.auditLog.create({ data: { tenantId: t.tenantId, actorId: t.userId, azione: "boat.duplicata", entita: "Boat", entitaId: nuova.id, dettagli: JSON.stringify({ originale: src.id }) } });
    return nuova;
  });

  return ok(copy, 201);
}
