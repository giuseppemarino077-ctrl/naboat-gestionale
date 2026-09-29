"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { copiaTesto } from "@/lib/browser";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";

const euro = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const dt = (v: string | null) => (v ? new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const codice = (b: any) => `NB-${new Date(b.startAt).getFullYear()}-${String(b.id).slice(0, 6).toUpperCase()}`;

const STATO: Record<string, { l: string; c: string }> = {
  da_confermare: { l: "Da confermare", c: "bg-[#fff0cc] text-[#9a6406]" },
  prenotata: { l: "Confermata", c: "bg-[#e8f1fb] text-[#145c72]" },
  in_mare: { l: "In navigazione", c: "bg-[#d8f3ea] text-[#177469]" },
  rientrata: { l: "Completata", c: "bg-[#e8ecec] text-[#5d696b]" },
  no_show: { l: "Non presentato", c: "bg-[#fdeeea] text-coral" },
  cancellata: { l: "Annullata", c: "bg-[#fdeeea] text-coral" },
};

function waLink(tel: string | null | undefined, testo: string) {
  const n = (tel ?? "").replace(/\D/g, "");
  if (!n) return null;
  return `https://wa.me/${n.startsWith("39") ? n : `39${n}`}?text=${encodeURIComponent(testo)}`;
}

export default function PrenotazionePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [b, setB] = useState<any>(null);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkContratto, setLinkContratto] = useState("");
  const [linkPagamento, setLinkPagamento] = useState("");
  const [conflitto, setConflitto] = useState(false);

  const load = () => {
    if (!id) return;
    fetch(`/api/v1/bookings/${id}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((j) => { setB(j); setErr(""); }).catch(() => setErr("Prenotazione non trovata."));
  };
  useEffect(load, [id]);
  // Un altro operatore può cambiare stato o skipper: il dettaglio si riallinea da solo.
  useAggiornamenti(load, ["prenotazioni"]);
  useEffect(() => { fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {}); }, []);

  const azione = async (okMsg: string, url: string, method: string, body?: any) => {
    setBusy(true); setErr(""); setConflitto(false);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409) { setConflitto(true); return null; }
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setMsg(okMsg); load();
    // Elenco, calendario e Oggi si riallineano subito.
    segnalaCambiamento("prenotazioni");
    return j;
  };
  // Conflitto: si rileggono i dati (non ci sono campi digitati da perdere qui).
  const ricaricaDopoConflitto = () => { setConflitto(false); setErr(""); load(); setMsg("Dati aggiornati."); };

  const avvia = async () => {
    const carb = prompt("Carburante alla partenza in % (vuoto = non indicato):", "100");
    if (carb === null) return;
    await azione("Noleggio avviato.", `/api/v1/bookings/${id}/checkin`, "POST", { carburantePct: carb.trim() === "" ? null : Number(carb) });
  };
  const completa = async () => {
    const carb = prompt("Carburante al rientro in %:", "");
    if (carb === null) return;
    const danni = prompt("Danni in euro (vuoto = nessuno):", "");
    if (danni === null) return;
    await azione("Noleggio completato.", `/api/v1/bookings/${id}/checkout`, "POST", { carburantePct: carb.trim() === "" ? null : Number(carb), danniEuro: danni.trim() || null });
  };
  const annulla = async () => { if (confirm("Annullare la prenotazione?")) await azione("Prenotazione annullata.", `/api/v1/bookings/${id}`, "DELETE"); };
  // Si invia la versione letta: se nel frattempo un altro utente ha salvato, il server
  // risponde 409 e si mostra il conflitto senza applicare la modifica.
  const cambiaStato = async (stato: string, okMsg: string) => azione(okMsg, `/api/v1/bookings/${id}`, "PATCH", { stato, updatedAt: b?.updatedAt });
  const assegnaSkipper = async (skipperId: string) => azione("Skipper aggiornato.", `/api/v1/bookings/${id}`, "PATCH", { skipperId: skipperId || null, updatedAt: b?.updatedAt });
  const contratto = async () => { const j = await azione("Link contratto generato.", `/api/v1/bookings/${id}/contratto`, "POST"); if (j?.url) { setLinkContratto(j.url); await copiaTesto(j.url); } };
  const generaLinkPagamento = async () => { const j = await azione("Link di pagamento generato.", "/api/v1/payments/checkout", "POST", { bookingId: id }); if (j?.url) { setLinkPagamento(j.url); await copiaTesto(j.url); } };

  if (err && !b) return <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-4 text-sm font-semibold text-coral">{err} <Link className="font-bold text-ocean" href="/gestionale/prenotazioni">← Prenotazioni</Link></p>;
  if (!b) return <p className="p-4 text-sm text-muted">Caricamento…</p>;

  const st = STATO[b.stato] ?? { l: b.stato, c: "badge-block" };
  const pagati = (b.payments ?? []).filter((p: any) => p.stato === "pagato" || p.stato === "rimborsato_parziale" || p.stato === "rimborsato");
  const pagatoCent = pagati.reduce((s: number, p: any) => s + p.totaleCent, 0);
  const rimborsatoCent = pagati.reduce((s: number, p: any) => s + p.rimborsoCent, 0);
  const feeNaboatCent = pagati.reduce((s: number, p: any) => s + p.feeNaboatCent, 0);
  const feeProviderCent = pagati.reduce((s: number, p: any) => s + p.feeProviderCent, 0);
  const nettoOperatore = pagati.reduce((s: number, p: any) => s + Math.max(0, p.importoCent - p.rimborsoCent), 0) - feeNaboatCent - feeProviderCent;

  const eventi = [
    b.createdAt && { t: "Prenotazione creata", d: b.createdAt, i: "＋" },
    b.contrattoFirmatoAt && { t: "Contratto firmato", d: b.contrattoFirmatoAt, i: "✎" },
    ...(b.payments ?? []).filter((p: any) => p.paidAt).map((p: any) => ({ t: `Pagamento confermato (${p.metodo ?? p.provider})`, d: p.paidAt, i: "€" })),
    b.checkinAt && { t: "Noleggio avviato", d: b.checkinAt, i: "⛵" },
    b.checkoutAt && { t: "Noleggio completato", d: b.checkoutAt, i: "⚓" },
    b.stato === "cancellata" && { t: "Prenotazione annullata", d: b.updatedAt ?? b.createdAt, i: "✕" },
    ...((b.storico ?? []) as any[]).filter((s) => typeof s.azione === "string" && s.azione.startsWith("booking.stato.")).map((s) => ({
      t: `Stato: ${String(s.azione).replace("booking.stato.", "")}${s.autore?.nome || s.autore?.email ? ` · ${s.autore.nome ?? s.autore.email}` : ""}`,
      d: s.createdAt,
      i: "↻",
    })),
  ].filter(Boolean).sort((a: any, z: any) => +new Date(a.d) - +new Date(z.d));

  return (
    <div className="grid gap-5">
      <Link className="text-sm font-bold text-ocean" href="/gestionale/prenotazioni">← Prenotazioni</Link>

      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="rounded-2xl border border-[#bfe6dc] bg-[#eafaf5] p-3 text-sm font-semibold text-[#177469]">{msg}</p>}
      {conflitto && (
        <div className="rounded-2xl border border-gold/50 bg-[#fff7e6] p-3 text-sm">
          <p className="font-semibold text-[#9a6406]">Questa prenotazione è stata modificata da un altro utente: ricarica per vedere le novità.</p>
          <button className="btn-soft mt-2" disabled={busy} onClick={ricaricaDopoConflitto}>Ricarica i dati</button>
        </div>
      )}

      <div className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold">{codice(b)}</span>
              <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + st.c}>{st.l}</span>
              <span className={b.origineCanale === "naboat" ? "badge-ready" : "badge-block"}>{b.origineCanale === "naboat" ? "NaBoat" : "Diretta"}</span>
            </div>
            <p className="mt-1 text-sm text-muted">{b.clienteNome ?? "cliente"} · {b.boat?.nome ?? "barca"}</p>
            <p className="text-sm text-muted">{new Date(b.startAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · {new Date(b.startAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}–{new Date(b.endAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {b.stato === "da_confermare" && <button className="btn-primary" disabled={busy} onClick={() => cambiaStato("prenotata", "Richiesta confermata.")}>✓ Conferma richiesta</button>}
            {b.stato === "da_confermare" && <button className="btn-soft" disabled={busy} onClick={() => cambiaStato("cancellata", "Richiesta rifiutata.")}>Rifiuta</button>}
            {b.stato === "prenotata" && <button className="btn-primary" disabled={busy} onClick={avvia}>⛵ Avvia noleggio</button>}
            {b.stato === "in_mare" && <button className="btn-primary" disabled={busy} onClick={completa}>⚓ Completa noleggio</button>}
            {b.stato === "prenotata" && <button className="btn-soft" disabled={busy} onClick={() => cambiaStato("no_show", "Segnato come non presentato.")}>Cliente non presentato</button>}
            {b.stato !== "cancellata" && b.stato !== "rientrata" && b.stato !== "no_show" && <button className="btn-soft" disabled={busy} onClick={annulla}>Annulla</button>}
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        {/* Colonna principale */}
        <div className="grid gap-5">
          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Cliente</h2>
            <p className="mt-1 text-lg font-bold">{b.customer?.nome ?? b.clienteNome ?? "—"}</p>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-muted">
              <span>☎ {b.customer?.telefono ?? b.telefono ?? "—"}</span>
              <span>✉ {b.customer?.email ?? "—"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {b.telefono && <a className="btn-soft" href={`tel:${b.telefono}`}>Chiama</a>}
              {b.telefono && <a className="btn-soft" href={waLink(b.telefono, `Ciao ${b.clienteNome ?? "cliente"}, `) ?? "#"} target="_blank" rel="noreferrer">WhatsApp</a>}
              {b.telefono && <button className="btn-soft" onClick={() => copiaTesto(b.telefono)}>Copia telefono</button>}
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Barca e viaggio</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-[160px_1fr]">
              {b.boat?.fotoCopertina && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.boat.fotoCopertina} alt={b.boat.nome} className="h-28 w-full rounded-2xl object-cover sm:w-40" />
              )}
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted">Barca</p><b>{b.boat?.nome ?? "—"}</b></div>
                <div><p className="text-xs text-muted">Tipo</p><b>{b.boat?.tipo ?? "—"}</b></div>
                <div><p className="text-xs text-muted">Capienza</p><b>{b.boat?.capienza ?? "—"}</b></div>
                <div><p className="text-xs text-muted">Passeggeri</p><b>{b.passeggeri}</b></div>
                <div><p className="text-xs text-muted">Destinazione</p><b>{b.destinazione ?? "—"}</b></div>
                <div><p className="text-xs text-muted">Formula</p><b>{b.formula ?? "—"}</b></div>
                <div><p className="text-xs text-muted">Patente</p><b>{b.patenteOk ? "ok" : b.boat?.patenteRichiesta ? "da verificare" : "non richiesta"}</b></div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Skipper</h2>
            {b.skipper ? (
              <p className="mt-1 text-sm">{b.skipper.nome}{b.skipper.telefono ? ` · ${b.skipper.telefono}` : ""}</p>
            ) : b.boat?.patenteRichiesta && !b.patenteOk ? (
              <p className="mt-1 rounded-2xl border border-gold/50 bg-[#fff7e6] p-3 text-sm font-semibold text-[#9a6406]">Serve uno skipper (o la patente del cliente). Assegnalo qui.</p>
            ) : (
              <p className="mt-1 text-sm text-muted">Nessuno skipper assegnato.</p>
            )}
            <select className="mt-3 rounded-2xl border border-line p-3 text-sm" value={b.skipper?.id ?? ""} onChange={(e) => assegnaSkipper(e.target.value)} disabled={busy}>
              <option value="">Nessuno · non serve</option>
              {skippers.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
            </select>
          </section>

          {b.extras?.length > 0 && (
            <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-lg">Extra</h2>
              <ul className="mt-2 grid gap-1 text-sm">
                {b.extras.map((x: any) => <li key={x.extra.id} className="flex justify-between border-b border-line/60 py-1 last:border-0"><span>{x.extra.nome}</span><b>{euro(x.extra.prezzo != null ? Math.round(x.extra.prezzo * 100) : null)}</b></li>)}
              </ul>
            </section>
          )}

          {b.note && (
            <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
              <h2 className="text-lg">Note interne</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{b.note}</p>
            </section>
          )}

          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Contratto</h2>
            <p className="mt-1 text-sm text-muted">{b.contrattoFirmatoAt ? `Firmato il ${dt(b.contrattoFirmatoAt)}${b.contrattoFirmaNome ? ` da ${b.contrattoFirmaNome}` : ""}.` : "Non ancora firmato."}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn-soft" disabled={busy} onClick={contratto}>Genera link contratto</button>
              {linkContratto && <a className="btn-soft" href={linkContratto} target="_blank" rel="noreferrer">Apri link</a>}
              <button className="btn-soft" disabled={busy || !b.prezzoCent} onClick={generaLinkPagamento}>Link pagamento</button>
              {linkPagamento && <a className="btn-soft" href={linkPagamento} target="_blank" rel="noreferrer">Apri link</a>}
            </div>
          </section>
        </div>

        {/* Colonna finanziaria */}
        <div className="grid content-start gap-5">
          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Riepilogo</h2>
            <dl className="mt-3 grid gap-2 text-sm">
              <div className="flex justify-between"><dt className="text-muted">Prezzo noleggio</dt><dd className="font-semibold">{euro(b.prezzoCent)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Incassato</dt><dd className="font-semibold">{euro(pagatoCent)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Rimborsato</dt><dd>{euro(rimborsatoCent)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Commissione NaBoat</dt><dd>-{euro(feeNaboatCent)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted">Commissione fornitore</dt><dd>-{euro(feeProviderCent)}</dd></div>
              <div className="mt-1 flex justify-between border-t border-line pt-2 text-base"><dt className="font-bold">Importo operatore</dt><dd className="font-bold text-ocean">{euro(nettoOperatore)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-muted">{b.stato === "rientrata" ? "Noleggio completato." : pagatoCent > 0 ? "Pagamento ricevuto." : "In attesa di pagamento."}</p>
          </section>

          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Storico</h2>
            <ol className="mt-3 grid gap-3 text-sm">
              {eventi.map((e: any, i: number) => (
                <li key={i} className="flex gap-3">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foam text-ocean">{e.i}</span>
                  <span><b className="block font-semibold">{e.t}</b><span className="text-xs text-muted">{dt(e.d)}</span></span>
                </li>
              ))}
              {eventi.length === 0 && <li className="text-muted">Nessun evento.</li>}
            </ol>
          </section>

          <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
            <h2 className="text-lg">Incassi</h2>
            <ul className="mt-2 grid gap-2 text-sm">
              {(b.payments ?? []).map((p: any) => (
                <li key={p.id} className="flex items-center justify-between border-b border-line/60 py-1 last:border-0">
                  <span>{p.metodo ?? p.provider} · {p.tipo}</span>
                  <span className="flex items-center gap-2"><b>{euro(p.totaleCent)}</b><span className={p.stato === "pagato" ? "badge-ready" : "badge-pending"}>{p.stato.replace("_", " ")}</span></span>
                </li>
              ))}
              {(b.payments ?? []).length === 0 && <li className="text-muted">Nessun incasso registrato.</li>}
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
