import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireImporti } from "@/lib/ormeggio";
import { generaPdf, type PdfRiga } from "@/lib/pdf";

// Riepilogo del conto in PDF, da scaricare e condividere con il proprietario.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await requireImporti(req);
  if ("error" in t) return t.error;
  const { id } = await params;
  const p = await prisma.permanenza.findFirst({
    where: { id, tenantId: t.tenantId },
    include: {
      boat: { include: { proprietario: true } },
      posto: { include: { area: true } },
      tenant: true,
      addebiti: { orderBy: { data: "asc" } },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!p) return fail("Permanenza non trovata", 404);

  const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
  const d = (x?: Date | null) => (x ? new Date(x).toLocaleDateString("it-IT") : "—");
  const rows: PdfRiga[] = [];
  rows.push({ testo: p.tenant.nome, grassetto: true, spazioPrima: 4 });
  if (p.tenant.indirizzoPartenza) rows.push({ testo: p.tenant.indirizzoPartenza });
  rows.push({ testo: "" });
  rows.push({ testo: `Proprietario: ${p.boat.proprietario?.nome ?? "—"}${p.boat.proprietario?.telefono ? `  ·  ${p.boat.proprietario.telefono}` : ""}` });
  rows.push({ testo: `Barca: ${p.boat.nome}${p.boat.tipo ? ` (${p.boat.tipo})` : ""}` });
  rows.push({ testo: `Posto: ${p.posto.codice}  ·  ${p.posto.area.nome}` });
  rows.push({ testo: `Tipo: ${p.tipo === "rimessaggio_custodia" ? "Rimessaggio (custodia)" : "Ormeggio (custodia)"}` });
  rows.push({ testo: `Inizio: ${d(p.inizioAt)}   —   Fine prevista: ${p.finePrevistaAt ? d(p.finePrevistaAt) : "indeterminata"}` });
  rows.push({ testo: "" });
  rows.push({ testo: "ADDEBITI", grassetto: true, spazioPrima: 6 });
  for (const a of p.addebiti) rows.push({ testo: `${d(a.data)}   ${a.descrizione}   —   ${euro(a.importoCent)}` });
  const totaleAddebiti = p.addebiti.reduce((s, a) => s + a.importoCent, 0);
  rows.push({ testo: `Totale addebitato: ${euro(totaleAddebiti)}`, grassetto: true });
  rows.push({ testo: "" });
  rows.push({ testo: "INCASSI", grassetto: true, spazioPrima: 6 });
  if (p.payments.length === 0) rows.push({ testo: "Nessun incasso registrato." });
  for (const x of p.payments) rows.push({ testo: `${d(x.paidAt ?? x.createdAt)}   ${x.metodo ?? x.provider}   —   ${euro(x.totaleCent)}${x.stato !== "pagato" ? ` (${x.stato})` : ""}` });
  const incassato = p.payments.filter((x) => x.stato === "pagato").reduce((s, x) => s + x.totaleCent, 0);
  rows.push({ testo: `Totale incassato: ${euro(incassato)}`, grassetto: true });
  rows.push({ testo: "" });
  rows.push({ testo: `RESIDUO DA PAGARE: ${euro(Math.max(0, totaleAddebiti - incassato))}`, grassetto: true, spazioPrima: 6 });
  rows.push({ testo: "" });
  rows.push({ testo: `Documento generato il ${new Date().toLocaleString("it-IT", { dateStyle: "short", timeStyle: "short" })}` });

  const pdf = generaPdf(`Riepilogo conto — posto ${p.posto.codice}`, rows);
  const body = new ArrayBuffer(pdf.byteLength);
  new Uint8Array(body).set(pdf);
  return new Response(body, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="riepilogo-${p.posto.codice}.pdf"`,
    },
  });
}
