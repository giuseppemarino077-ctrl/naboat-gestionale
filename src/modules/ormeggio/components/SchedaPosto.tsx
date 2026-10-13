"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { Icona } from "@/components/ui/Icona";
import { telefonoWhatsApp } from "@/lib/telefono";
import { aggiungiGiorni, FUSO, giornoDi, oggi } from "@/modules/piattaforma/date";
import type { AttivitaQuadro, Perm } from "./tipi-griglia";

export type TabPosto = "scheda" | "attivita" | "conto";
export type DettaglioPosto = {
  id: string;
  inizioAt: string;
  finePrevistaAt: string | null;
  note: string | null;
  contratto: { firmatoAt: string | null } | null;
  attivita: (AttivitaQuadro & { quantita: number | null; unita: string | null })[];
  addebiti: { id: string; descrizione: string; importoCent: number; incassatoCent: number; residuoCent: number }[];
  payments: { id: string; stato: string; totaleCent: number }[];
  conto: { totaleAddebitiCent: number; incassatoCent: number; residuoCent: number } | null;
};

const euro = (cent: number) => (cent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataBreve = (valore: string) => new Date(valore).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric", timeZone: FUSO });

function DataAttivita({ valore, completata = false }: { valore: string | null; completata?: boolean }) {
  if (!valore) return <span>Data da definire</span>;
  const giorno = giornoDi(valore);
  const adesso = oggi();
  const prefisso = completata ? "Prevista" : giorno === adesso ? "Oggi" : giorno === aggiungiGiorni(adesso, 1) ? "Domani" : giorno < adesso ? "In ritardo" : "Prevista";
  return <time dateTime={valore} className={!completata && giorno < adesso ? "font-semibold" : ""}>{prefisso} · {dataBreve(valore)}</time>;
}

function StatoAttivita({ stato }: { stato: string }) {
  return <span className={`shrink-0 rounded-full px-2 py-1 text-[11px] font-bold ${stato === "completato" ? "bg-[#d8f3ea] text-[#177469]" : stato === "in_corso" ? "bg-deep text-white" : "bg-[#ffe4a3] text-[#855304]"}`}>
    {stato === "completato" ? "Completato" : stato === "in_corso" ? "In corso" : "Da fare"}
  </span>;
}

export function SchedaPosto({ permanenza, posto, dettaglio, errore, onRiprova, tab, onTab, vedeImporti, onChiudi, children }: {
  permanenza: Perm;
  posto: { codice: string; areaNome: string } | null;
  dettaglio: DettaglioPosto | null;
  errore: string;
  onRiprova: () => void;
  tab: TabPosto;
  onTab: (tab: TabPosto) => void;
  vedeImporti: boolean;
  onChiudi: () => void;
  children: ReactNode;
}) {
  const base = `/gestionale/ormeggio/permanenza/${permanenza.id}`;
  const whatsapp = telefonoWhatsApp(permanenza.telefono);
  const lavori = permanenza.attivitaAperte;
  const tabVisibile = tab === "conto" && !vedeImporti ? "scheda" : tab;
  const linkAttivita = (id: string) => `${base}?tab=attivita#attivita-${id}`;

  return <section aria-label={`Scheda ${permanenza.boatNome}`} className="grid min-w-0 gap-4">
    <div className="rounded-2xl bg-gradient-to-br from-deep to-ocean p-4 text-white shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold"><Icona nome="pin" className="h-3.5 w-3.5 shrink-0" />{posto ? `Posto ${posto.codice}` : "Posto selezionato"}</span>
        <button type="button" onClick={onChiudi} className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/25 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white" aria-label="Chiudi"><Icona nome="chiudi" className="h-4 w-4" /></button>
      </div>
      <h2 className="break-words text-xl leading-tight text-white">{permanenza.boatNome}</h2>
      <p className="mt-1 break-words text-xs text-white/75">{[permanenza.boatTipo, posto?.areaNome].filter(Boolean).join(" · ")}</p>
      <div className="mt-3 border-t border-white/20 pt-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/60">Proprietario</p>
        <p className="mt-0.5 break-words text-sm font-semibold">{permanenza.proprietario ?? "Proprietario non indicato"}</p>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold"><Icona nome={permanenza.inMare ? "barca" : "ancora"} className="h-3.5 w-3.5" />{permanenza.inMare ? "In mare · posto assegnato" : "Presente al posto"}</p>
    </div>

    {lavori.length > 0 && <section aria-label="Attività da completare" className="rounded-2xl border border-[#f0d59a] bg-gradient-to-br from-[#fff5dc] to-[#ffedbf] p-3.5 text-[#855304] shadow-[0_6px_20px_-10px_rgba(154,100,6,0.55)]">
      <div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-[#ffe4a3]"><Icona nome="checklist" className="h-4 w-4" /></span><h3 className="min-w-0 flex-1 text-sm font-bold">Attività da completare</h3><span className="rounded-full bg-white/80 px-2 py-1 text-xs font-bold">{lavori.length}</span></div>
      <p className="mb-3 mt-2 text-xs">{permanenza.statoGriglia === "da_fare" ? "La barca è gialla per questi lavori." : "Lavori aperti per questa barca."}</p>
      <ul className="grid max-h-64 gap-2 overflow-y-auto">
        {lavori.map((a) => <li key={a.id}><Link href={linkAttivita(a.id)} data-attivita-aperta={a.id} className="group block rounded-xl border border-[#efdba9] bg-white/85 p-3 transition hover:-translate-y-0.5 hover:bg-white hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#9a6406] motion-reduce:transform-none">
          <div className="flex flex-wrap items-start justify-between gap-1.5"><span className="min-w-0 flex-[1_1_120px] break-words text-sm font-bold">{a.tipo}</span><StatoAttivita stato={a.stato} /></div>
          <p className="mt-1.5 flex items-start gap-1.5 text-xs"><Icona nome="calendario" className="mt-0.5 h-3.5 w-3.5 shrink-0" /><DataAttivita valore={a.dataPrevista} /></p>
          {a.addetto && <p className="mt-1 break-words text-xs">Addetto: {a.addetto.nome ?? "Assegnato"}</p>}
          <span className="mt-2 inline-flex items-center gap-1 text-xs font-bold">Apri attività <Icona nome="freccia-destra" className="h-3 w-3 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" /></span>
        </Link></li>)}
      </ul>
    </section>}

    <div className="grid grid-flow-col auto-cols-fr gap-1 rounded-xl border border-line bg-foam/60 p-1" aria-label="Sezioni della scheda">
      {(["scheda", "attivita", "conto"] as const).filter((voce) => voce !== "conto" || vedeImporti).map((voce) => <button key={voce} type="button" aria-pressed={tabVisibile === voce} onClick={() => onTab(voce)} className={`rounded-lg px-2 py-2.5 text-xs font-bold transition ${tabVisibile === voce ? "bg-white text-deep shadow-sm" : "text-muted hover:bg-white/70 hover:text-ocean"}`}>{voce === "attivita" ? "Attività" : voce === "conto" ? "Conto" : "Scheda"}</button>)}
    </div>

    {errore ? <Avviso tono="errore" azione={<button type="button" className="btn-soft" onClick={onRiprova}>Riprova</button>}>{errore}</Avviso> : !dettaglio ? <p role="status" className="rounded-xl bg-foam/50 p-3 text-sm text-muted">Carico la scheda…</p> : null}

    {dettaglio && tabVisibile === "scheda" && <div className="grid gap-3 text-sm">
      <section className="rounded-2xl border border-line p-3.5" aria-label="Permanenza"><h3 className="mb-3 flex items-center gap-2 text-xs font-bold text-deep"><Icona nome="calendario" className="h-4 w-4 text-ocean" />Permanenza</h3><dl className="grid grid-cols-2 gap-3"><div><dt className="text-xs text-muted">Ingresso</dt><dd className="mt-1 font-semibold">{dataBreve(dettaglio.inizioAt)}</dd></div><div><dt className="text-xs text-muted">Fine prevista</dt><dd className="mt-1 font-semibold">{dettaglio.finePrevistaAt ? dataBreve(dettaglio.finePrevistaAt) : "Indeterminata"}</dd></div></dl></section>
      {vedeImporti ? <Link href={`${base}?tab=scheda&documenti=1`} className="flex items-center gap-3 rounded-2xl border border-line p-3.5 transition hover:border-ocean hover:bg-foam/40"><Icona nome="documento" className="h-5 w-5 shrink-0 text-ocean" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-muted">Contratto</span><span className="mt-1 block font-semibold">{dettaglio.contratto?.firmatoAt ? "Firmato" : "Da firmare"}</span></span><Icona nome="freccia-destra" className="h-4 w-4 shrink-0 text-ocean" /></Link> : <div className="rounded-2xl border border-line p-3.5"><p className="text-xs text-muted">Contratto</p><p className="mt-1 font-semibold">Personale autorizzato</p></div>}
      {vedeImporti && dettaglio.conto && <Link href={`${base}?tab=conto`} className="flex items-center gap-3 rounded-2xl border border-line bg-foam/50 p-3.5 transition hover:border-ocean"><Icona nome="portafoglio" className="h-5 w-5 shrink-0 text-ocean" /><span className="min-w-0 flex-1"><span className="block text-xs font-semibold text-muted">Residuo da saldare</span><span className="mt-1 block break-words text-xl font-bold text-deep">{euro(dettaglio.conto.residuoCent)}</span></span><Icona nome="freccia-destra" className="h-4 w-4 shrink-0 text-ocean" /></Link>}
      {dettaglio.note && <details className="rounded-2xl border border-line p-3.5"><summary className="cursor-pointer font-semibold text-deep">Note della permanenza</summary><p className="mt-2 whitespace-pre-wrap break-words text-muted">{dettaglio.note}</p></details>}
      {permanenza.telefono && <section aria-label="Contatti del proprietario" className="rounded-2xl border border-line p-3.5"><p className="mb-2 break-words text-xs font-semibold text-muted">{permanenza.telefono}</p><div className="grid grid-cols-2 gap-2"><a className="btn-soft inline-flex justify-center gap-1.5 !px-2" href={`tel:${permanenza.telefono.replace(/[^\d+]/g, "")}`}><Icona nome="telefono" className="h-4 w-4" />Chiama</a>{whatsapp ? <a className="btn-soft inline-flex justify-center gap-1.5 !px-2" href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer"><Icona nome="chat" className="h-4 w-4" />WhatsApp</a> : <button type="button" className="btn-soft inline-flex justify-center gap-1.5 !px-2" disabled title="Verifica il numero di telefono del proprietario"><Icona nome="chat" className="h-4 w-4" />WhatsApp</button>}</div>{!whatsapp && <p className="mt-2 text-xs text-muted">Verifica il numero in anagrafica per aprire WhatsApp.</p>}</section>}
    </div>}

    {dettaglio && tabVisibile === "attivita" && <div className="grid gap-2 text-sm">
      {!dettaglio.attivita.length && <p className="rounded-xl bg-foam/50 p-3 text-muted">Nessuna attività registrata.</p>}
      {dettaglio.attivita.map((a) => <Link key={a.id} href={linkAttivita(a.id)} className="rounded-xl border border-line p-3 transition hover:border-ocean hover:bg-foam/40"><div className="flex flex-wrap items-start gap-2"><span className="min-w-0 flex-[1_1_120px] break-words font-semibold">{a.tipo}</span><StatoAttivita stato={a.stato} /></div>{a.quantita != null && <p className="mt-1 break-words text-xs text-muted">Quantità: {a.quantita.toLocaleString("it-IT")}{a.unita ? ` ${a.unita}` : ""}</p>}<p className="mt-2 text-xs text-muted"><DataAttivita valore={a.dataPrevista} completata={a.stato === "completato"} /></p></Link>)}
    </div>}

    {dettaglio && tabVisibile === "conto" && vedeImporti && <div className="grid gap-3 text-sm">
      {dettaglio.conto && <dl className="grid grid-cols-3 gap-1.5 text-center text-xs">{[["Totale", dettaglio.conto.totaleAddebitiCent], ["Pagato", dettaglio.conto.incassatoCent], ["Da pagare", dettaglio.conto.residuoCent]].map(([nome, cent]) => <div key={nome} className="min-w-0 rounded-xl bg-foam/70 p-2"><dt className="text-muted">{nome}</dt><dd className="mt-1 break-words font-bold text-deep">{euro(Number(cent))}</dd></div>)}</dl>}
      <section aria-label="Da pagare" className="grid gap-2"><h3 className="font-bold">Da pagare</h3>
        {dettaglio.addebiti.filter((a) => a.residuoCent > 0).map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"><span className="min-w-0 flex-[1_1_120px] break-words">{a.descrizione}{a.incassatoCent > 0 && <span className="block text-xs text-muted">Pagato {euro(a.incassatoCent)} · Rimane {euro(a.residuoCent)}</span>}</span><span className="font-semibold">{euro(a.importoCent)}</span></div>)}
        {!dettaglio.addebiti.some((a) => a.residuoCent > 0) && <p className="text-muted">Nessuna voce da pagare.</p>}
      </section>
      <section aria-label="Pagato" className="grid gap-2"><h3 className="font-bold">Pagato</h3>
        {dettaglio.addebiti.filter((a) => a.residuoCent === 0).map((a) => <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"><span className="min-w-0 flex-[1_1_120px] break-words">{a.descrizione}{a.importoCent <= 0 && <span className="block text-xs text-muted">Non dovuto</span>}</span><span className="font-semibold">{euro(a.importoCent)}</span></div>)}
        {!dettaglio.addebiti.some((a) => a.residuoCent === 0) && <p className="text-muted">Nessuna voce saldata.</p>}
        <details open={!dettaglio.addebiti.some((a) => a.residuoCent === 0)}><summary className="cursor-pointer text-xs font-semibold">Dettaglio pagamenti</summary><div className="mt-2 grid gap-2">
          {dettaglio.payments.map((p) => <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-line p-3 text-muted"><span>Pagamento · {p.stato.replaceAll("_", " ")}</span><span className="font-semibold">{euro(p.totaleCent)}</span></div>)}
          {!dettaglio.payments.length && <p className="text-muted">Nessun pagamento registrato.</p>}
        </div></details>
      </section>
      <Link className="btn-soft text-center" href={`${base}?tab=conto`}>Gestisci il conto →</Link>
    </div>}

    <div className="grid gap-2 border-t border-line pt-3">
      <Link className="btn-primary inline-flex items-center justify-center gap-1.5" href={`${base}?tab=attivita&nuova=1`}><Icona nome="piu" className="h-4 w-4" /> Aggiungi attività</Link>
      <Link className="btn-soft text-center" href={base}>Apri scheda completa →</Link>
      {children}
    </div>
  </section>;
}
