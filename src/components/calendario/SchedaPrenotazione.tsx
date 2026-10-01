"use client";
import { useState } from "react";
import Link from "next/link";
import { aData, istante, oreDi } from "@/lib/calendario";
import { etichettaOfferta, etichettaPatente, etichettaStato, linkWhatsApp, testoRiepilogo, type PlanningBoat, type PlanningBooking, type PlanningOfferta } from "@/lib/planning";
import { useConferma } from "@/components/ui/Dialogo";

const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

export default function SchedaPrenotazione({
  pren, boat, giorno, oggi, skippers, porti, offerte, azienda, busy, puòImporti, puoGestire, onAzione, onRicarica,
}: {
  pren: PlanningBooking;
  boat: PlanningBoat;
  giorno: string;
  oggi: string;
  skippers: { id: string; nome: string; telefono?: string | null }[];
  porti: { id: string; nome: string }[];
  offerte: PlanningOfferta[];
  azienda: string;
  busy: boolean;
  puòImporti: boolean;
  puoGestire: boolean;
  onAzione: (metodo: string, url: string, body?: any) => Promise<{ ok: boolean; j: any }>;
  onRicarica: (esito: string) => Promise<boolean>;
}) {
  const conferma = useConferma();
  const [esito, setEsito] = useState<{ tipo: "ok" | "err"; testo: string } | null>(null);

  const tel = pren.telefono;
  const wa = linkWhatsApp(tel, testoRiepilogo({
    cliente: pren.clienteNome ?? "cliente", azienda: azienda || "l'azienda", barca: boat.nome,
    giorno: giorno, dalle: oreDi(pren.startAt), alle: oreDi(pren.endAt), passeggeri: pren.passeggeri,
  }));

  const esegui = async (metodo: string, url: string, body?: any, esitoOk = "Prenotazione aggiornata.") => {
    setEsito(null);
    const r = await onAzione(metodo, url, body);
    if (r.ok) { setEsito({ tipo: "ok", testo: esitoOk }); await onRicarica(esitoOk); }
    else setEsito({ tipo: "err", testo: r.j?.error ?? "Operazione non riuscita." });
    return r.ok;
  };

  const partenza = () => esegui("POST", `/api/v1/bookings/${pren.id}/checkin`, { note: null }, "Partenza registrata: l'impegno è completato.");
  const rientro = () => esegui("POST", `/api/v1/bookings/${pren.id}/checkout`, { danniEuro: null, note: null }, "Rientro registrato: la barca risulta rientrata.");
  const annulla = async () => {
    const ok = await conferma.chiedi({ titolo: "Eliminare questa prenotazione e rendere nuovamente libera la barca?", messaggio: "La prenotazione viene annullata (nessun dato storico viene cancellato) e la barca torna disponibile.", confermaLabel: "Elimina prenotazione", pericoloso: true });
    if (ok) await esegui("DELETE", `/api/v1/bookings/${pren.id}?updatedAt=${encodeURIComponent(pren.updatedAt)}`, undefined, "Prenotazione annullata.");
  };

  const conclusa = pren.stato === "rientrata";
  const cancellata = pren.stato === "cancellata";
  const inMare = pren.stato === "in_mare";
  const puoRiprogrammare = pren.stato === "prenotata" && pren.origineCanale !== "naboat" && !pren.contrattoFirmatoAt;
  const puoAnnullare = puoGestire && ["da_confermare", "prenotata", "in_mare"].includes(pren.stato);

  return (
    <article className={"rounded-2xl border p-4 " + (cancellata ? "border-danger-line bg-danger-soft" : inMare ? "border-info-line bg-info-soft" : conclusa ? "border-line bg-sand" : "border-ok-line bg-ok-soft")}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-muted">Prenotazione · {etichettaStato(pren.stato)}</p>
          <h3 className="mt-1 font-display text-lg font-semibold text-ink">{pren.clienteNome ?? "Cliente"}</h3>
        </div>
        <span className="rounded-full bg-white/80 px-2.5 py-1 text-[10px] font-bold text-ink">{etichettaStato(pren.stato)}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div><dt className="text-xs text-muted">Inizio</dt><dd className="mt-0.5 font-semibold">{oreDi(pren.startAt)}{aData(giorno) ? "" : ""}</dd></div>
        <div><dt className="text-xs text-muted">Fine</dt><dd className="mt-0.5 font-semibold">{oreDi(pren.endAt)}</dd></div>
        {pren.destinazione && <div><dt className="text-xs text-muted">Destinazione</dt><dd className="mt-0.5 truncate font-semibold">{pren.destinazione}</dd></div>}
        <div><dt className="text-xs text-muted">Passeggeri</dt><dd className="mt-0.5 font-semibold">{pren.passeggeri}</dd></div>
        {pren.offertaId && <div><dt className="text-xs text-muted">Modalità</dt><dd className="mt-0.5 font-semibold">{etichettaOfferta(offerte.find((o) => o.id === pren.offertaId)?.codice ?? "")}</dd></div>}
        {boat.patenteRichiesta && <div><dt className="text-xs text-muted">Patente cliente</dt><dd className={"mt-0.5 font-semibold " + (pren.patenteRisposta === "NO" ? "text-danger" : pren.patenteRisposta ? "" : "text-warn")}>{etichettaPatente(pren, boat)}</dd></div>}
        <div><dt className="text-xs text-muted">Skipper</dt><dd className={"mt-0.5 font-semibold " + (pren.skipperStato === "UNASSIGNED" ? "text-warn" : "")}>{pren.skipper?.nome ?? (pren.skipperStato === "UNASSIGNED" ? "Da assegnare" : "Nessuno")}</dd></div>
        {puòImporti && pren.prezzoCent != null && <div><dt className="text-xs text-muted">Prezzo</dt><dd className="mt-0.5 font-semibold">{(pren.prezzoCent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}</dd></div>}
      </dl>

      {pren.note && <p className="mt-3 rounded-xl bg-white/70 p-3 text-sm text-ink/85">{pren.note}</p>}

      {esito && <p role={esito.tipo === "ok" ? "status" : "alert"} className={"mt-3 rounded-xl p-3 text-sm font-medium " + (esito.tipo === "ok" ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger")}>{esito.testo}</p>}

      {(wa || puoGestire) && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {wa ? (
            <a href={wa} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center rounded-xl bg-[#1FA855] px-4 text-sm font-semibold text-white hover:bg-[#188A47]">Invia riepilogo WhatsApp</a>
          ) : (
            <p className="flex min-h-11 items-center justify-center rounded-xl bg-white/70 px-4 text-center text-xs text-muted">Telefono mancante: modifica il cliente per aggiungerlo.</p>
          )}
          {giorno === oggi && pren.stato === "prenotata" && (
            <button type="button" disabled={busy} onClick={partenza} className="min-h-11 rounded-xl bg-ok px-4 text-sm font-semibold text-white hover:brightness-110">✓ Segna come partita</button>
          )}
          {giorno === oggi && inMare && (
            <button type="button" disabled={busy} onClick={rientro} className="min-h-11 rounded-xl bg-info px-4 text-sm font-semibold text-white hover:brightness-110">✓ Segna come rientrata</button>
          )}
        </div>
      )}

      <div className="mt-4 space-y-3 border-t border-black/10 pt-4">
        {!conclusa && !cancellata && (
          <details className="rounded-xl bg-white/80 p-3">
            <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-ocean">{pren.skipper?.nome || pren.skipperStato === "UNASSIGNED" ? "Gestisci skipper" : "Aggiungi skipper"}</summary>
            <FormSkipper pren={pren} boat={boat} skippers={skippers} busy={busy} onSalva={(body) => esegui("PATCH", `/api/v1/bookings/${pren.id}`, { ...body, updatedAt: pren.updatedAt }, "Skipper aggiornato.")} />
          </details>
        )}

        {pren.customerId && (
          <details className="rounded-xl bg-white/80 p-3">
            <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-ocean">Modifica cliente</summary>
            <FormCliente pren={pren} busy={busy} onSalva={(body) => esegui("PATCH", `/api/v1/customers/${pren.customerId}`, body, "Anagrafica aggiornata.")} />
          </details>
        )}

        {puoRiprogrammare && (
          <details className="rounded-xl bg-white/80 p-3">
            <summary className="cursor-pointer px-1 py-1 text-sm font-semibold text-ocean">Cambia barca, giorno o orario</summary>
            <FormRiprogramma pren={pren} boat={boat} giorno={giorno} offerte={offerte} porti={porti} skippers={skippers} busy={busy} onSalva={(body) => esegui("POST", `/api/v1/bookings/${pren.id}/riprogramma`, body, "Prenotazione riprogrammata.")} />
          </details>
        )}

        <Link href={`/gestionale/prenotazioni/${pren.id}`} className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ink hover:bg-foam">Apri la scheda completa</Link>

        {puoAnnullare && (
          <button type="button" disabled={busy} onClick={annulla} className="min-h-11 w-full rounded-xl border border-danger-line bg-danger-soft px-4 text-sm font-semibold text-danger hover:bg-[#fbe0d8]">Elimina prenotazione</button>
        )}
      </div>
      {conferma.dialogo}
    </article>
  );
}

function FormSkipper({
  pren, boat, skippers, busy, onSalva,
}: {
  pren: PlanningBooking;
  boat: PlanningBoat;
  skippers: { id: string; nome: string; telefono?: string | null }[];
  busy: boolean;
  onSalva: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [scelta, setScelta] = useState(pren.skipperId ? `EXISTING:${pren.skipperId}` : pren.skipperStato === "UNASSIGNED" ? "UNASSIGNED" : "NONE");
  const [nota, setNota] = useState(pren.skipperNote ?? "");
  const [nuovo, setNuovo] = useState({ nome: "", telefono: "", note: "" });

  const salva = async () => {
    const body: Record<string, unknown> = { skipperNote: nota || null };
    if (scelta === "NEW") body.nuovoSkipper = { nome: nuovo.nome, telefono: nuovo.telefono || null, note: nuovo.note || null };
    else if (scelta.startsWith("EXISTING:")) { body.skipperId = scelta.slice("EXISTING:".length); body.skipperStato = "ASSIGNED"; }
    else if (scelta === "UNASSIGNED") { body.skipperId = null; body.skipperStato = "UNASSIGNED"; }
    else { body.skipperId = null; body.skipperStato = "NONE"; }
    await onSalva(body);
  };

  return (
    <div className="mt-3 grid gap-3">
      <label className="grid gap-2 text-sm font-semibold">Skipper
        <select value={scelta} onChange={(e) => setScelta(e.target.value)} className={campo}>
          <option value="NONE">Nessuno · non serve</option>
          <option value="UNASSIGNED">Da assegnare</option>
          {skippers.map((s) => <option key={s.id} value={`EXISTING:${s.id}`}>{s.nome}{s.telefono ? ` · ${s.telefono}` : ""}</option>)}
          <option value="NEW">+ Aggiungi uno skipper</option>
        </select>
      </label>
      {boat.patenteRichiesta && pren.patenteRisposta === "NO" && <p className="rounded-xl bg-danger-soft p-3 text-xs text-danger">Il cliente non ha la patente: serve uno skipper assegnato (non «Da assegnare»).</p>}
      {scelta === "NEW" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <input placeholder="Nome skipper" value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} className={campo} />
          <input placeholder="Telefono" value={nuovo.telefono} onChange={(e) => setNuovo({ ...nuovo, telefono: e.target.value })} className={campo} />
          <input placeholder="Nota (facoltativa)" value={nuovo.note} onChange={(e) => setNuovo({ ...nuovo, note: e.target.value })} className={campo + " sm:col-span-2"} />
        </div>
      )}
      <input placeholder="Nota skipper (facoltativa)" value={nota} onChange={(e) => setNota(e.target.value)} className={campo} />
      <button type="button" disabled={busy} onClick={salva} className="min-h-11 rounded-xl bg-ocean px-4 text-sm font-semibold text-white disabled:opacity-50">Salva skipper</button>
    </div>
  );
}

function FormCliente({ pren, busy, onSalva }: { pren: PlanningBooking; busy: boolean; onSalva: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [nome, setNome] = useState(pren.clienteNome ?? "");
  const [telefono, setTelefono] = useState(pren.telefono ?? "");
  const [email, setEmail] = useState(pren.email ?? "");
  const [note, setNote] = useState("");

  const salva = async () => {
    const body: Record<string, unknown> = { nome, telefono: telefono || null, email: email || null, note: note || undefined };
    // Le note cliente sono separate dalle note prenotazione: qui si aggiorna l'anagrafica.
    await onSalva(body);
  };

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Nome<input value={nome} onChange={(e) => setNome(e.target.value)} minLength={2} maxLength={160} className={campo} /></label>
      <label className="grid gap-1 text-sm">Telefono<input value={telefono} onChange={(e) => setTelefono(e.target.value)} maxLength={40} className={campo} /></label>
      <label className="grid gap-1 text-sm">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={320} className={campo} /></label>
      <label className="grid gap-1 text-sm">Note cliente<textarea rows={2} maxLength={5000} value={note} onChange={(e) => setNote(e.target.value)} className={campo + " py-2"} /></label>
      <button type="button" disabled={busy} onClick={salva} className="min-h-11 rounded-xl bg-ocean px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Salva anagrafica</button>
    </div>
  );
}

function FormRiprogramma({
  pren, boat, giorno, offerte, porti, skippers, busy, onSalva,
}: {
  pren: PlanningBooking; boat: PlanningBoat; giorno: string;
  offerte: PlanningOfferta[]; porti: { id: string; nome: string }[]; skippers: { id: string; nome: string }[];
  busy: boolean;
  onSalva: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const [inizioData, setInizioData] = useState(giorno);
  const [inizioOra, setInizioOra] = useState(oreDi(pren.startAt));
  const [fineData, setFineData] = useState(giorno);
  const [fineOra, setFineOra] = useState(oreDi(pren.endAt));
  const [passeggeri, setPasseggeri] = useState(pren.passeggeri);
  const [offertaId, setOffertaId] = useState(pren.offertaId ?? "");
  const [portoId, setPortoId] = useState(pren.portoId ?? "");
  const [skipperId, setSkipperId] = useState(pren.skipperId ?? "");
  const [motivo, setMotivo] = useState("");
  const [errore, setErrore] = useState("");

  const salva = async () => {
    setErrore("");
    if (motivo.trim().length < 3) { setErrore("Indica il motivo della riprogrammazione."); return; }
    const start = istante(inizioData, inizioOra);
    const end = istante(fineData, fineOra);
    if (!(start < end)) { setErrore("Orari incoerenti."); return; }
    await onSalva({
      boatId: boat.id, startAt: start.toISOString(), endAt: end.toISOString(), passeggeri,
      offertaId: offertaId || null, portoId: portoId || null, skipperId: skipperId || null,
      motivo: motivo.trim(), updatedAt: pren.updatedAt,
    });
  };

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {errore && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger sm:col-span-2">{errore}</p>}
      <label className="grid gap-1 text-xs font-semibold">Data partenza<input type="date" value={inizioData} onChange={(e) => setInizioData(e.target.value)} className={campo} /></label>
      <label className="grid gap-1 text-xs font-semibold">Ora partenza<input type="time" value={inizioOra} onChange={(e) => setInizioOra(e.target.value)} className={campo} /></label>
      <label className="grid gap-1 text-xs font-semibold">Data rientro<input type="date" value={fineData} onChange={(e) => setFineData(e.target.value)} className={campo} /></label>
      <label className="grid gap-1 text-xs font-semibold">Ora rientro<input type="time" value={fineOra} onChange={(e) => setFineOra(e.target.value)} className={campo} /></label>
      <label className="grid gap-1 text-xs font-semibold">Passeggeri<input type="number" min={1} value={passeggeri} onChange={(e) => setPasseggeri(Number(e.target.value))} className={campo} /></label>
      {offerte.length > 0 && <label className="grid gap-1 text-xs font-semibold">Modalità<select value={offertaId} onChange={(e) => setOffertaId(e.target.value)} className={campo}><option value="">Predefinita</option>{offerte.map((o) => <option key={o.id} value={o.id}>{etichettaOfferta(o.codice)}</option>)}</select></label>}
      {porti.length > 0 && <label className="grid gap-1 text-xs font-semibold">Sede<select value={portoId} onChange={(e) => setPortoId(e.target.value)} className={campo}><option value="">Predefinita</option>{porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></label>}
      <label className="grid gap-1 text-xs font-semibold">Skipper<select value={skipperId} onChange={(e) => setSkipperId(e.target.value)} className={campo}><option value="">Nessuno</option>{skippers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold sm:col-span-2">Motivo *<input value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} className={campo} /></label>
      <p className="text-xs text-muted sm:col-span-2">La prenotazione originale viene annullata e ne viene creata una nuova collegata, in un'unica operazione.</p>
      <button type="button" disabled={busy} onClick={salva} className="min-h-11 rounded-xl bg-ocean px-4 text-sm font-semibold text-white disabled:opacity-50 sm:col-span-2">Riprogramma</button>
    </div>
  );
}
