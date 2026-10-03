import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import {
  CONDIZIONI_NOLEGGIO,
  condizioniDaTesto,
  improntaContratto,
  ipRichiesta,
  snapshotNoleggio,
  type SnapshotNoleggio,
} from "@/lib/contratti";

// C03: validità del link di firma. Vale per i contratti emessi da questa versione;
// i contratti storici (senza contrattoCreatoAt) restano consultabili senza scadenza.
const TOKEN_GG = 60;

// Risposte con dati personali: mai memorizzabili da proxy o browser.
function okNoStore(data: unknown, status = 200) {
  const res = NextResponse.json(data, { status });
  res.headers.set("Cache-Control", "private, no-store");
  return res;
}

// Contratto di noleggio: pagina pubblica accessibile solo con il token della prenotazione.
// La lettura rende la versione congelata (snapshot), mai i dati correnti modificabili.
const SELECT_CONTRATTO = {
  id: true,
  tenantId: true,
  clienteNome: true,
  passeggeri: true,
  startAt: true,
  endAt: true,
  destinazione: true,
  formula: true,
  patenteOk: true,
  prezzoCent: true,
  cauzioneCent: true,
  contrattoToken: true,
  contrattoTesto: true,
  contrattoFirmatoAt: true,
  contrattoFirmaNome: true,
  contrattoVersione: true,
  contrattoHash: true,
  contrattoSnapshot: true,
  contrattoCreatoAt: true,
  contrattoTokenExpires: true,
  contrattoTokenVersione: true,
  stato: true,
  boat: { select: { nome: true, tipo: true, capienza: true, potenzaCv: true, patenteRichiesta: true } },
  skipper: { select: { nome: true } },
  tenant: { select: { nome: true, indirizzoPartenza: true, telefonoContatto: true, logoUrl: true, status: true } },
} satisfies Prisma.BookingSelect;

async function daToken(token: string) {
  if (!token || token.length < 16) return null;
  return prisma.booking.findUnique({ where: { contrattoToken: token }, select: SELECT_CONTRATTO });
}

type PrenotazioneContratto = NonNullable<Awaited<ReturnType<typeof daToken>>>;

// Scadenza del link: il campo esplicito se presente, altrimenti la politica sui
// contratti emessi (creazione + finestra). I contratti storici non scadono.
function scadenzaToken(b: { contrattoTokenExpires: Date | null; contrattoCreatoAt: Date | null }): Date | null {
  if (b.contrattoTokenExpires) return b.contrattoTokenExpires;
  if (b.contrattoCreatoAt) return new Date(b.contrattoCreatoAt.getTime() + TOKEN_GG * 86400000);
  return null;
}

function tokenScaduto(b: { contrattoTokenExpires: Date | null; contrattoCreatoAt: Date | null }): boolean {
  const s = scadenzaToken(b);
  return !!s && s.getTime() < Date.now();
}

// Riallinea i metadati del token senza toccare il documento congelato: registra la
// scadenza e la revisione corrente autorizzata dal link. La firma resta comunque
// vincolata a contrattoVersione/hash (C01): qui si tiene solo lo stato del token.
async function allineaToken(b: PrenotazioneContratto) {
  if (!b.contrattoCreatoAt) return;
  const expires = b.contrattoTokenExpires ?? scadenzaToken(b)!;
  if (b.contrattoTokenExpires && b.contrattoTokenVersione === b.contrattoVersione) return;
  await prisma.booking.updateMany({
    where: { id: b.id, contrattoToken: b.contrattoToken },
    data: { contrattoTokenExpires: expires, contrattoTokenVersione: b.contrattoVersione },
  });
}

function snapshotDaLive(b: PrenotazioneContratto, adesso = new Date()): SnapshotNoleggio {
  return snapshotNoleggio(
    {
      azienda: {
        nome: b.tenant.nome,
        logo: b.tenant.logoUrl,
        puntoPartenza: b.tenant.indirizzoPartenza,
        telefono: b.tenant.telefonoContatto,
      },
      cliente: b.clienteNome,
      passeggeri: b.passeggeri,
      inizioAt: b.startAt,
      fineAt: b.endAt,
      destinazione: b.destinazione,
      formula: b.formula,
      barca: {
        nome: b.boat.nome,
        tipo: b.boat.tipo,
        capienza: b.boat.capienza,
        potenzaCv: b.boat.potenzaCv,
        patenteRichiesta: b.boat.patenteRichiesta,
      },
      skipper: b.skipper?.nome ?? null,
      patenteOk: b.patenteOk,
      prezzoCent: b.prezzoCent,
      cauzioneCent: b.cauzioneCent,
      condizioni: condizioniDaTesto(b.contrattoTesto),
    },
    adesso
  );
}

const isSnapshot = (v: unknown): v is SnapshotNoleggio =>
  !!v && typeof v === "object" && (v as { schema?: unknown }).schema === "noleggio/v1";

// Dati mostrati al cliente, presi esclusivamente dallo snapshot congelato.
function rendi(s: SnapshotNoleggio) {
  return {
    azienda: s.azienda.nome,
    logo: s.azienda.logo,
    puntoPartenza: s.azienda.puntoPartenza,
    telefono: s.azienda.telefono,
    cliente: s.cliente,
    passeggeri: s.passeggeri,
    inizioAt: s.periodo.inizioAt,
    fineAt: s.periodo.fineAt,
    destinazione: s.destinazione,
    formula: s.formula,
    barca: s.barca,
    skipper: s.skipper,
    patenteOk: s.patenteOk,
    prezzoCent: s.importi.prezzoCent,
    cauzioneCent: s.importi.cauzioneCent,
    condizioni: s.condizioni,
  };
}

// Documento firmato prima dell'introduzione dell'impronta: si documentano i limiti
// (nessun hash retroattivo) e si evita di riscrivere la storia.
function rendiLegacy(b: PrenotazioneContratto) {
  return {
    azienda: b.tenant.nome,
    logo: b.tenant.logoUrl,
    puntoPartenza: b.tenant.indirizzoPartenza,
    telefono: b.tenant.telefonoContatto,
    cliente: b.clienteNome,
    passeggeri: b.passeggeri,
    inizioAt: b.startAt,
    fineAt: b.endAt,
    destinazione: b.destinazione,
    formula: b.formula,
    barca: {
      nome: b.boat.nome,
      tipo: b.boat.tipo,
      capienza: b.boat.capienza,
      potenzaCv: b.boat.potenzaCv,
      patenteRichiesta: b.boat.patenteRichiesta,
    },
    skipper: b.skipper?.nome ?? null,
    patenteOk: b.patenteOk,
    prezzoCent: b.prezzoCent,
    cauzioneCent: b.cauzioneCent,
    condizioni: condizioniDaTesto(b.contrattoTesto) ?? CONDIZIONI_NOLEGGIO,
  };
}

// Per i link generati prima di C01 ma non ancora firmati si congela adesso la
// versione mostrata: da qui in avanti la firma è legata a questa impronta.
async function congelaSeServe(b: PrenotazioneContratto): Promise<PrenotazioneContratto> {
  if (b.contrattoSnapshot || b.contrattoFirmatoAt) return b;
  const snapshot = snapshotDaLive(b);
  const hash = improntaContratto(snapshot);
  const adesso = new Date();
  await prisma.booking.updateMany({
    where: { id: b.id, contrattoHash: null, contrattoFirmatoAt: null },
    data: {
      contrattoSnapshot: snapshot,
      contrattoHash: hash,
      contrattoVersione: b.contrattoVersione ?? 1,
      contrattoCreatoAt: adesso,
      // Il link appena congelato riceve la sua scadenza esplicita.
      contrattoTokenExpires: new Date(adesso.getTime() + TOKEN_GG * 86400000),
      contrattoTokenVersione: b.contrattoVersione ?? 1,
    },
  });
  const ri = await prisma.booking.findUnique({
    where: { id: b.id },
    select: {
      contrattoVersione: true,
      contrattoHash: true,
      contrattoSnapshot: true,
      contrattoCreatoAt: true,
      contrattoTokenExpires: true,
      contrattoTokenVersione: true,
    },
  });
  return {
    ...b,
    contrattoVersione: ri?.contrattoVersione ?? b.contrattoVersione,
    contrattoHash: ri?.contrattoHash ?? null,
    contrattoSnapshot: ri?.contrattoSnapshot ?? null,
    contrattoCreatoAt: ri?.contrattoCreatoAt ?? b.contrattoCreatoAt,
    contrattoTokenExpires: ri?.contrattoTokenExpires ?? b.contrattoTokenExpires,
    contrattoTokenVersione: ri?.contrattoTokenVersione ?? b.contrattoTokenVersione,
  };
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  let b = await daToken(token);
  if (!b) return fail("Link non valido", 404);
  // Scadenza: i contratti storici (senza creazione registrata) restano consultabili.
  if (tokenScaduto(b)) return fail("Link scaduto", 404);
  b = await congelaSeServe(b);
  await allineaToken(b);

  const comune = { firmatoAt: b.contrattoFirmatoAt, firmaNome: b.contrattoFirmaNome };
  if (isSnapshot(b.contrattoSnapshot)) {
    return okNoStore({
      ...rendi(b.contrattoSnapshot),
      ...comune,
      versione: b.contrattoVersione,
      hash: b.contrattoHash,
      legacy: false,
    });
  }
  return okNoStore({ ...rendiLegacy(b), ...comune, versione: null, hash: null, legacy: true });
}

// Firma: il cliente conferma i dati e scrive nome e cognome. È un aggiornamento
// condizionale sulla stessa versione: due firme simultanee non possono divergere.
export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;
  const b = await daToken(token);
  if (!b) return fail("Link non valido", 404);
  if (b.contrattoFirmatoAt) return fail("Contratto già firmato", 422);
  // La firma è un'azione: richiede azienda attiva, prenotazione non annullata e
  // link non scaduto. La lettura resta possibile anche in questi casi.
  if (b.tenant.status !== "active") return fail("Azienda non attiva: firma non disponibile", 422);
  if (b.stato === "cancellata") return fail("Prenotazione annullata: contratto non più firmabile", 422);
  if (tokenScaduto(b)) return fail("Link scaduto: chiedi un nuovo contratto all'azienda", 422);

  const body = await req.json().catch(() => null);
  const nome = String(body?.nome ?? "").trim();
  const accettato = body?.accettato === true;
  if (!accettato) return fail("Devi accettare le condizioni per firmare", 422);
  if (nome.length < 3 || nome.length > 120) return fail("Scrivi nome e cognome completi", 422);

  // La firma vale solo per la versione effettivamente letta.
  if (!isSnapshot(b.contrattoSnapshot)) return fail("Documento non disponibile: ricarica la pagina", 409);
  const versione = Number(body?.versione);
  if (!Number.isInteger(versione) || versione !== b.contrattoVersione)
    return fail("Il documento è cambiato: ricarica la pagina", 409);
  if (typeof body?.hash === "string" && body.hash !== b.contrattoHash)
    return fail("Il documento è cambiato: ricarica la pagina", 409);

  const adesso = new Date();
  const aggiornato = await prisma.booking.updateMany({
    where: { id: b.id, tenantId: b.tenantId, contrattoFirmatoAt: null, contrattoVersione: versione },
    data: { contrattoFirmatoAt: adesso, contrattoFirmaNome: nome, contrattoFirmaIp: ipRichiesta(req) },
  });
  // Nessuna riga aggiornata: la revisione è cambiata o una firma concorrente ha
  // vinto la corsa. In entrambi i casi non si produce una seconda accettazione.
  if (aggiornato.count === 0) return fail("Contratto già firmato o documento cambiato: ricarica la pagina", 409);
  await prisma.auditLog.create({
    data: {
      tenantId: b.tenantId,
      azione: "contratto.firmato",
      entita: "Booking",
      entitaId: b.id,
      dettagli: JSON.stringify({ versione, hash: b.contrattoHash }),
    },
  });
  return okNoStore({ firmatoAt: adesso, firmaNome: nome, versione });
}
