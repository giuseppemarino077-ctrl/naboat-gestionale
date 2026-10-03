import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { condizioniDaTesto, snapshotNoleggio, type SnapshotNoleggio } from "@/lib/contratti";
import { generaPdf, type PdfRiga } from "@/lib/pdf";
import { requireAzienda } from "@/lib/tenant";

const euro = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const quando = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "long", timeStyle: "short" });

const isSnapshot = (v: unknown): v is SnapshotNoleggio =>
  !!v && typeof v === "object" && (v as { schema?: unknown }).schema === "noleggio/v1";

// PDF del contratto: usa la versione congelata se presente, altrimenti i dati
// correnti della prenotazione (compreso il testo personalizzato).
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;

  const b = await prisma.booking.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { select: { nome: true, tipo: true, capienza: true, potenzaCv: true, patenteRichiesta: true } },
      skipper: { select: { nome: true } },
      tenant: { select: { nome: true, indirizzoPartenza: true, telefonoContatto: true, logoUrl: true, citta: true } },
    },
  });
  if (!b) return fail("Prenotazione non trovata", 404);

  const s: SnapshotNoleggio = isSnapshot(b.contrattoSnapshot)
    ? b.contrattoSnapshot
    : snapshotNoleggio({
        azienda: { nome: b.tenant.nome, logo: b.tenant.logoUrl, puntoPartenza: b.tenant.indirizzoPartenza, telefono: b.tenant.telefonoContatto },
        cliente: b.clienteNome,
        passeggeri: b.passeggeri,
        inizioAt: b.startAt,
        fineAt: b.endAt,
        destinazione: b.destinazione,
        formula: b.formula,
        barca: { nome: b.boat.nome, tipo: b.boat.tipo, capienza: b.boat.capienza, potenzaCv: b.boat.potenzaCv, patenteRichiesta: b.boat.patenteRichiesta },
        skipper: b.skipper?.nome ?? null,
        patenteOk: b.patenteOk,
        prezzoCent: b.prezzoCent,
        cauzioneCent: b.cauzioneCent,
        condizioni: condizioniDaTesto(b.contrattoTesto),
      });

  const luogoData = `${b.tenant.citta ?? s.azienda.puntoPartenza ?? ""}`.trim();

  const righe: PdfRiga[] = [
    { testo: s.azienda.nome, grassetto: true, dimensione: 13 },
    ...(s.azienda.puntoPartenza ? [{ testo: s.azienda.puntoPartenza, dimensione: 10 }] : []),
    ...(s.azienda.telefono ? [{ testo: `Tel. ${s.azienda.telefono}`, dimensione: 10 }] : []),

    { testo: "", separatore: true, spazioPrima: 8 },
    { testo: "DATI DEL NOLEGGIO", grassetto: true, dimensione: 11, spazioPrima: 4 },
    { testo: `Cliente: ${s.cliente ?? "—"}`, spazioPrima: 8 },
    { testo: `Passeggeri: ${s.passeggeri}` },
    { testo: `Periodo: dal ${quando(s.periodo.inizioAt)} al ${quando(s.periodo.fineAt)}` },
    { testo: `Imbarcazione: ${s.barca.nome}${s.barca.tipo ? ` (${s.barca.tipo})` : ""}` },
    ...(s.barca.capienza != null ? [{ testo: `Capienza: ${s.barca.capienza} persone` }] : []),
    ...(s.barca.potenzaCv != null ? [{ testo: `Potenza: ${s.barca.potenzaCv} CV` }] : []),
    ...(s.destinazione ? [{ testo: `Destinazione: ${s.destinazione}` }] : []),
    ...(s.formula ? [{ testo: `Formula: ${s.formula}` }] : []),
    ...(s.skipper ? [{ testo: `Skipper: ${s.skipper}` }] : []),
    { testo: `Prezzo noleggio: ${euro(s.importi.prezzoCent)}` },
    ...(s.importi.cauzioneCent != null ? [{ testo: `Cauzione: ${euro(s.importi.cauzioneCent)}` }] : []),

    { testo: "", separatore: true, spazioPrima: 10 },
    { testo: "CONDIZIONI", grassetto: true, dimensione: 11, spazioPrima: 4 },
    ...s.condizioni.map((c) => ({ testo: c, dimensione: 10 })),

    { testo: "", separatore: true, spazioPrima: 12 },
    ...(b.contrattoFirmatoAt
      ? [{ testo: `Firmato digitalmente da ${b.contrattoFirmaNome ?? "cliente"} il ${quando(b.contrattoFirmatoAt.toISOString())}.`, spazioPrima: 4 }]
      : [
          { testo: `Luogo e data: ${luogoData || "____________________"}, ${new Date().toLocaleDateString("it-IT", { timeZone: "Europe/Rome" })}`, spazioPrima: 4 },
          { testo: "", spazioPrima: 26 },
          { testo: "Firma del cliente: ________________________________", dimensione: 10 },
          { testo: "", spazioPrima: 20 },
          { testo: "Firma del noleggiatore: ____________________________", dimensione: 10 },
        ]),
  ];

  const pdf = generaPdf("CONTRATTO DI NOLEGGIO", righe);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="contratto-${b.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
