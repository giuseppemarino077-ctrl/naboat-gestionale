// Outbox delle notifiche (C02).
// L'evento applicativo viene accodato in "Notifica"; la consegna è un passo
// separato, con retry e deduplicazione. Un guasto SMTP non perde il messaggio e
// non annulla l'operazione già salvata. Senza SMTP la riga resta "da_inviare".
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { sendMail, statoPosta } from "@/lib/mailer";

// Numero massimo di tentativi di consegna prima di dichiarare l'errore.
export const MAX_TENTATIVI = 5;

export type DatiNotifica = {
  tenantId?: string | null;
  evento: string;
  destinatario: string;
  oggetto: string;
  testo: string;
  html?: string | null;
  // Chiave di deduplicazione: una sola notifica per evento. Se già presente,
  // non se ne crea una seconda e si riusa quella.
  dedupKey?: string | null;
};

type Db = Prisma.TransactionClient;

// Accoda la notifica (idempotente su dedupKey). Accetta il client di transazione,
// così l'evento può essere salvato insieme all'operazione che lo genera.
export async function accodaNotifica(dati: DatiNotifica, db: Db = prisma): Promise<{ id: string } | null> {
  const destinatario = (dati.destinatario ?? "").trim();
  if (!destinatario) return null;

  if (dati.dedupKey) {
    const esistente = await db.notifica.findUnique({ where: { dedupKey: dati.dedupKey }, select: { id: true } });
    if (esistente) return esistente;
  }

  try {
    return await db.notifica.create({
      data: {
        tenantId: dati.tenantId ?? null,
        evento: dati.evento,
        destinatario,
        oggetto: dati.oggetto,
        testo: dati.testo,
        html: dati.html ?? null,
        dedupKey: dati.dedupKey ?? null,
      },
      select: { id: true },
    });
  } catch (e) {
    // Corsa su dedupKey: la notifica è stata creata da un'altra richiesta.
    if (dati.dedupKey) {
      const esistente = await db.notifica.findUnique({ where: { dedupKey: dati.dedupKey }, select: { id: true } });
      if (esistente) return esistente;
    }
    throw e;
  }
}

export type EsitoConsegna = "inviata" | "rinviata" | "errore" | "assente";

// Tenta la consegna di una singola notifica. Se la posta non è configurata la
// riga resta "da_inviare" (non si consumano tentativi): il registro la mostra.
export async function consegnaNotifica(id: string): Promise<EsitoConsegna> {
  const n = await prisma.notifica.findUnique({ where: { id } });
  if (!n) return "assente";
  if (n.stato === "inviata") return "inviata";

  const posta = statoPosta();
  if (!posta.abilitato) {
    // Solo il motivo, nessun tentativo consumato: la notifica resta in coda.
    await prisma.notifica.update({
      where: { id },
      data: { errore: posta.motivo ?? "Invio non disponibile", ultimoTentativoAt: new Date() },
    });
    return "rinviata";
  }

  const esito = await sendMail(n.destinatario, n.oggetto, n.testo, n.html ?? undefined);
  const tentativi = n.tentativi + 1;
  if (esito.sent) {
    await prisma.notifica.update({
      where: { id },
      data: { stato: "inviata", inviataAt: new Date(), tentativi, errore: null, ultimoTentativoAt: new Date() },
    });
    return "inviata";
  }

  // Errore di invio reale: si ritenta finché non si esauriscono i tentativi.
  const stato = tentativi >= MAX_TENTATIVI ? "errore" : "da_inviare";
  await prisma.notifica.update({
    where: { id },
    data: { stato, tentativi, errore: esito.errore ?? "Invio non riuscito", ultimoTentativoAt: new Date() },
  });
  return stato === "errore" ? "errore" : "rinviata";
}

export type EsitoConsegne = {
  inviate: number;
  rinviate: number;
  errori: number;
  configurato: boolean;
  motivo: string | null;
};

// Consegna le notifiche in coda (o un sottoinsieme). Usata subito dopo l'evento
// e dal cron/pannello per i tentativi successivi.
export async function consegnaNotifiche(opts: { ids?: string[]; limite?: number } = {}): Promise<EsitoConsegne> {
  const posta = statoPosta();
  const esiti: EsitoConsegne = { inviate: 0, rinviate: 0, errori: 0, configurato: posta.abilitato, motivo: posta.motivo };

  const lista = await prisma.notifica.findMany({
    where: opts.ids?.length ? { id: { in: opts.ids } } : { stato: "da_inviare", tentativi: { lt: MAX_TENTATIVI } },
    orderBy: { creatoAt: "asc" },
    take: Math.min(Math.max(opts.limite ?? 50, 1), 200),
    select: { id: true },
  });

  for (const n of lista) {
    const r = await consegnaNotifica(n.id);
    if (r === "inviata") esiti.inviate++;
    else if (r === "errore") esiti.errori++;
    else if (r === "rinviata") esiti.rinviate++;
  }
  return esiti;
}

// Accoda e tenta subito la consegna best effort (fuori da una transazione).
// Restituisce l'id accodato.
export async function accodaEProva(dati: DatiNotifica): Promise<string | null> {
  const n = await accodaNotifica(dati);
  if (!n) return null;
  await consegnaNotifiche({ ids: [n.id] }).catch(() => {});
  return n.id;
}
