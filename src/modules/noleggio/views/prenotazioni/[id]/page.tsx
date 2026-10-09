"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { copiaTesto } from "@/lib/browser";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { useUtente } from "@/components/Utente";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { ErroreRecuperabile } from "@/components/ui/ErroreRecuperabile";
import { Icona, type NomeIcona } from "@/components/ui/Icona";
import { useConferma } from "@/components/ui/Dialogo";
import { useModulo } from "@/components/ui/ModuloDialogo";

const euro = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const dt = (v: string | null) => (v ? new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
const codice = (b: any) => `NB-${new Date(b.startAt).getFullYear()}-${String(b.id).slice(0, 6).toUpperCase()}`;
const dataOra = (v: string, conAnno = false) =>
  new Date(v).toLocaleString("it-IT", { day: "2-digit", month: "short", ...(conAnno ? { year: "numeric" as const } : {}), hour: "2-digit", minute: "2-digit" });
const stessoGiorno = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

const STATO: Record<string, { l: string; c: string }> = {
  da_confermare: { l: "Da confermare", c: "bg-warn-soft text-warn" },
  prenotata: { l: "Confermata", c: "bg-info-soft text-info" },
  in_mare: { l: "In navigazione", c: "bg-ok-soft text-ok" },
  rientrata: { l: "Completata", c: "bg-[#e8ecec] text-[#5d696b]" },
  no_show: { l: "Non presentato", c: "bg-danger-soft text-danger" },
  cancellata: { l: "Annullata", c: "bg-danger-soft text-danger" },
};

type Scheda = "dettagli" | "pagamenti" | "documenti" | "storico";

function waLink(tel: string | null | undefined, testo: string) {
  const n = (tel ?? "").replace(/\D/g, "");
  if (!n) return null;
  return `https://wa.me/${n.startsWith("39") ? n : `39${n}`}?text=${encodeURIComponent(testo)}`;
}

export default function PrenotazionePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const utente = useUtente({ redirect: true });
  const [b, setB] = useState<any>(null);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [linkContratto, setLinkContratto] = useState("");
  const [linkPagamento, setLinkPagamento] = useState("");
  const [conflitto, setConflitto] = useState(false);
  const [scheda, setScheda] = useState<Scheda>("dettagli");
  const [pagamentiBarca, setPagamentiBarca] = useState<{ abilitati: boolean; motivo: string | null } | null>(null);
  const conferma = useConferma();
  const modulo = useModulo();

  const load = () => {
    if (!id) return;
    fetch(`/api/v1/bookings/${id}`).then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((j) => {
      setB(j);
      setErr("");
      const boatId = j?.boatId ?? j?.boat?.id;
      if (boatId) fetch(`/api/v1/payments/abilitazione?boatId=${boatId}`).then((x) => (x.ok ? x.json() : null)).then((p) => p && setPagamentiBarca({ abilitati: p.abilitati, motivo: p.motivo })).catch(() => {});
    }).catch(() => setErr("Prenotazione non trovata."));
  };
  useEffect(load, [id]);
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
    segnalaCambiamento("prenotazioni");
    return j;
  };
  const ricaricaDopoConflitto = () => { setConflitto(false); setErr(""); load(); setMsg("Dati aggiornati."); };

  const avvia = async () => {
    const v = await modulo.apri("Registra partenza", [
      { nome: "note", etichetta: "Note del check-in", tipo: "textarea", placeholder: "Dotazioni, stato generale…" },
    ], { confermaLabel: "Avvia noleggio" });
    if (!v) return;
    await azione("Noleggio avviato.", `/api/v1/bookings/${id}/checkin`, "POST", { note: v.note || null });
  };
  const completa = async () => {
    const v = await modulo.apri("Registra rientro", [
      { nome: "danni", etichetta: "Danni (€)", placeholder: "Vuoto = nessun danno" },
      { nome: "note", etichetta: "Note del rientro", tipo: "textarea" },
    ], { confermaLabel: "Completa noleggio" });
    if (!v) return;
    await azione("Noleggio completato.", `/api/v1/bookings/${id}/checkout`, "POST", { danniEuro: v.danni.trim() || null, note: v.note || null });
  };
  const annulla = async () => {
    const ok = await conferma.chiedi({
      titolo: "Annullare la prenotazione?",
      messaggio: "La barca torna disponibile per quelle date e il cliente non riceverà più promemoria.",
      dettaglio: "L'operazione non si può annullare dalla pagina.",
      confermaLabel: "Annulla prenotazione",
      pericoloso: true,
    });
    if (ok) await azione("Prenotazione annullata.", `/api/v1/bookings/${id}`, "DELETE");
  };
  const cambiaStato = async (stato: string, okMsg: string) => azione(okMsg, `/api/v1/bookings/${id}`, "PATCH", { stato, updatedAt: b?.updatedAt });
  const assegnaSkipper = async (skipperId: string) => azione("Skipper aggiornato.", `/api/v1/bookings/${id}`, "PATCH", { skipperId: skipperId || null, updatedAt: b?.updatedAt });
  const contratto = async () => { const j = await azione("Link contratto generato.", `/api/v1/bookings/${id}/contratto`, "POST"); if (j?.url) { setLinkContratto(j.url); await copiaTesto(j.url); } };
  const generaLinkPagamento = async () => { const j = await azione("Link di pagamento generato.", "/api/v1/payments/checkout", "POST", { bookingId: id }); if (j?.url) { setLinkPagamento(j.url); await copiaTesto(j.url); } };

  if (err && !b) return <ErroreRecuperabile titolo="Prenotazione non disponibile" messaggio={err} onRiprova={load} collega={{ href: "/gestionale/prenotazioni", label: "← Prenotazioni" }} />;
  if (!b) return <Caricamento testo="Carico la prenotazione…" />;

  const puoImporti = (utente?.role === "owner" || utente?.role === "operatore" || utente?.role === "superadmin") && utente?.vedeImporti !== false;
  const st = STATO[b.stato] ?? { l: b.stato, c: "badge-block" };
  const pagati = (b.payments ?? []).filter((p: any) => p.stato === "pagato" || p.stato === "rimborsato_parziale" || p.stato === "rimborsato");
  const pagatoCent = pagati.reduce((s: number, p: any) => s + p.totaleCent, 0);
  const rimborsatoCent = pagati.reduce((s: number, p: any) => s + p.rimborsoCent, 0);
  const feeNaboatCent = pagati.reduce((s: number, p: any) => s + p.feeNaboatCent, 0);
  const feeProviderCent = pagati.reduce((s: number, p: any) => s + p.feeProviderCent, 0);
  const nettoOperatore = pagati.reduce((s: number, p: any) => s + Math.max(0, p.importoCent - p.rimborsoCent), 0) - feeNaboatCent - feeProviderCent;

  const eventi = [
    b.createdAt && { t: "Prenotazione creata", d: b.createdAt, i: "piu" as NomeIcona },
    b.contrattoFirmatoAt && { t: "Contratto firmato", d: b.contrattoFirmatoAt, i: "matita" as NomeIcona },
    ...(b.payments ?? []).filter((p: any) => p.paidAt).map((p: any) => ({ t: `Pagamento confermato (${p.metodo ?? p.provider})`, d: p.paidAt, i: "euro" as NomeIcona })),
    b.checkinAt && { t: "Noleggio avviato", d: b.checkinAt, i: "barca" as NomeIcona },
    b.checkoutAt && { t: "Noleggio completato", d: b.checkoutAt, i: "ancora" as NomeIcona },
    b.stato === "cancellata" && { t: "Prenotazione annullata", d: b.updatedAt ?? b.createdAt, i: "chiudi" as NomeIcona },
    ...((b.storico ?? []) as any[]).filter((s) => typeof s.azione === "string" && s.azione.startsWith("booking.stato.")).map((s) => ({
      t: `Stato: ${String(s.azione).replace("booking.stato.", "")}${s.autore?.nome || s.autore?.email ? ` · ${s.autore.nome ?? s.autore.email}` : ""}`,
      d: s.createdAt,
      i: "registro" as NomeIcona,
    })),
  ].filter(Boolean).sort((a: any, z: any) => +new Date(a.d) - +new Date(z.d));

  const azionePrimaria =
    b.stato === "da_confermare" ? { label: "Conferma richiesta", icona: "check" as NomeIcona, onClick: () => cambiaStato("prenotata", "Richiesta confermata.") }
    : b.stato === "prenotata" ? { label: "Avvia noleggio", icona: "barca" as NomeIcona, onClick: avvia }
    : b.stato === "in_mare" ? { label: "Completa noleggio", icona: "ancora" as NomeIcona, onClick: completa }
    : null;

  const schede: { id: Scheda; label: string; icona: NomeIcona }[] = [
    { id: "dettagli", label: "Dettagli", icona: "info" },
    { id: "pagamenti", label: "Pagamenti", icona: "euro" },
    { id: "documenti", label: "Documenti", icona: "documento" },
    { id: "storico", label: "Storico", icona: "registro" },
  ];

  return (
    <div className="grid gap-5">
      <Link className="text-sm font-bold text-ocean" href="/gestionale/prenotazioni">← Prenotazioni</Link>

      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      {conflitto && (
        <Avviso tono="attenzione" azione={<button className="btn-soft" disabled={busy} onClick={ricaricaDopoConflitto}>Ricarica</button>}>
          Questa prenotazione è stata modificata da un altro utente: ricarica per vedere le novità.
        </Avviso>
      )}

      <header className="card overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-display text-lg font-bold">{codice(b)}</span>
              <span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + st.c}>{st.l}</span>
              <span className={b.origineCanale === "naboat" ? "badge-ready" : "badge-block"}>{b.origineCanale === "naboat" ? "NaBoat" : "Diretta"}</span>
            </div>
            <h1 className="mt-1 font-display text-2xl font-bold">{b.boat?.nome ?? "Barca"}</h1>
            <p className="text-sm text-muted">{b.customer?.nome ?? b.clienteNome ?? "Cliente"}</p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 text-sm text-muted">
              <span className="flex items-center gap-1.5">
                <Icona nome="calendario" className="h-4 w-4" />
                Dal <b className="text-ink">{dataOra(b.startAt, true)}</b>
              </span>
              <span aria-hidden>→</span>
              <span className="flex items-center gap-1.5">
                al <b className="text-ink">{dataOra(b.endAt, !stessoGiorno(b.startAt, b.endAt))}</b>
              </span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {azionePrimaria && (
              <button className="btn-primary" disabled={busy} onClick={azionePrimaria.onClick}>
                <Icona nome={azionePrimaria.icona} className="mr-1.5 h-4 w-4" />
                {azioniLabel(azionePrimaria.label, busy)}
              </button>
            )}
            {b.stato === "da_confermare" && (
              <button className="btn-soft" disabled={busy} onClick={() => cambiaStato("cancellata", "Richiesta rifiutata.")}>Rifiuta</button>
            )}
            {b.stato === "prenotata" && (
              <button className="btn-soft" disabled={busy} onClick={() => cambiaStato("no_show", "Segnato come non presentato.")}>Cliente non presentato</button>
            )}
            {b.stato !== "cancellata" && b.stato !== "rientrata" && b.stato !== "no_show" && (
              <button className="btn-ghost text-danger" disabled={busy} onClick={annulla}>Annulla</button>
            )}
          </div>
        </div>

        <div className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4">
          <Fatto icona="barca" etichetta="Barca" valore={b.boat?.nome ?? "—"} />
          <Fatto icona="utente" etichetta="Cliente" valore={b.customer?.nome ?? b.clienteNome ?? "—"} />
          <Fatto icona="orologio" etichetta="Uscita" valore={dataOra(b.startAt)} />
          <Fatto icona="check" etichetta="Stato" valore={st.l} />
        </div>
      </header>

      <div
        role="tablist"
        aria-label="Sezioni della prenotazione"
        className="flex flex-wrap gap-1 rounded-full border border-line bg-white p-1 shadow-sm"
        onKeyDown={(e) => {
          const i = schede.findIndex((s) => s.id === scheda);
          let dest: Scheda | null = null;
          if (e.key === "ArrowRight") dest = schede[(i + 1) % schede.length].id;
          else if (e.key === "ArrowLeft") dest = schede[(i - 1 + schede.length) % schede.length].id;
          else if (e.key === "Home") dest = schede[0].id;
          else if (e.key === "End") dest = schede[schede.length - 1].id;
          if (dest) {
            e.preventDefault();
            setScheda(dest);
            document.getElementById(`tab-${dest}`)?.focus();
          }
        }}
      >
        {schede.map((s) => (
          <button
            key={s.id}
            role="tab"
            id={`tab-${s.id}`}
            aria-selected={scheda === s.id}
            aria-controls={`pannello-${s.id}`}
            tabIndex={scheda === s.id ? 0 : -1}
            onClick={() => setScheda(s.id)}
            className={
              "flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold transition " +
              (scheda === s.id ? "bg-signature text-deep" : "text-ocean hover:bg-foam")
            }
          >
            <Icona nome={s.icona} className="h-4 w-4" />
            {s.label}
          </button>
        ))}
      </div>

      {scheda === "dettagli" && (
        <div role="tabpanel" id="pannello-dettagli" aria-labelledby="tab-dettagli" className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-lg font-bold">Cliente</h2>
            <p className="mt-1 text-lg font-bold">{b.customer?.nome ?? b.clienteNome ?? "—"}</p>
            <div className="mt-2 grid gap-1 text-sm text-muted">
              <span className="flex items-center gap-1.5"><Icona nome="telefono" className="h-4 w-4" /> {b.customer?.telefono ?? b.telefono ?? "—"}</span>
              <span className="flex items-center gap-1.5"><Icona nome="mail" className="h-4 w-4" /> {b.customer?.email ?? "—"}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {b.telefono && <a className="btn-soft" href={`tel:${b.telefono}`}>Chiama</a>}
              {b.telefono && <a className="btn-soft" href={waLink(b.telefono, `Ciao ${b.clienteNome ?? "cliente"}, `) ?? "#"} target="_blank" rel="noreferrer">WhatsApp</a>}
              {b.telefono && <button className="btn-soft" onClick={() => copiaTesto(b.telefono)}>Copia telefono</button>}
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-lg font-bold">Barca e viaggio</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-[140px_1fr]">
              {b.boat?.fotoCopertina && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={b.boat.fotoCopertina} alt={b.boat.nome} className="h-28 w-full rounded-2xl object-cover sm:w-36" />
              )}
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <Cella etichetta="Tipo" valore={b.boat?.tipo ?? "—"} />
                <Cella etichetta="Capienza" valore={String(b.boat?.capienza ?? "—")} />
                <Cella etichetta="Passeggeri" valore={String(b.passeggeri)} />
                <Cella etichetta="Destinazione" valore={b.destinazione ?? "—"} />
                <Cella etichetta="Formula" valore={b.formula ?? "—"} />
                <Cella etichetta="Patente" valore={b.patenteOk ? "ok" : b.boat?.patenteRichiesta ? "da verificare" : "non richiesta"} />
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-display text-lg font-bold">Skipper</h2>
            {b.skipper ? (
              <p className="mt-1 text-sm">{b.skipper.nome}{b.skipper.telefono ? ` · ${b.skipper.telefono}` : ""}</p>
            ) : b.boat?.patenteRichiesta && !b.patenteOk ? (
              <p className="mt-1 rounded-2xl border border-warn-line bg-warn-soft p-3 text-sm font-semibold text-warn">Serve uno skipper (o la patente del cliente). Assegnalo qui.</p>
            ) : (
              <p className="mt-1 text-sm text-muted">Nessuno skipper assegnato.</p>
            )}
            <label className="mt-3 grid gap-1 text-sm font-semibold">
              Assegna skipper
              <select className="campo" value={b.skipper?.id ?? ""} onChange={(e) => assegnaSkipper(e.target.value)} disabled={busy}>
                <option value="">Nessuno · non serve</option>
                {skippers.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
              </select>
            </label>
          </section>

          {b.extras?.length > 0 && (
            <section className="card p-5">
              <h2 className="font-display text-lg font-bold">Extra</h2>
              <ul className="mt-2 grid gap-1 text-sm">
                {b.extras.map((x: any) => <li key={x.extra.id} className="flex justify-between border-b border-line/60 py-1 last:border-0"><span>{x.extra.nome}</span>{puoImporti ? <b>{euro(x.extra.prezzo != null ? Math.round(x.extra.prezzo * 100) : null)}</b> : null}</li>)}
              </ul>
            </section>
          )}

          {b.note && (
            <section className="card p-5">
              <h2 className="font-display text-lg font-bold">Note interne</h2>
              <p className="mt-1 whitespace-pre-wrap text-sm">{b.note}</p>
            </section>
          )}
        </div>
      )}

      {scheda === "pagamenti" && (
        <div role="tabpanel" id="pannello-pagamenti" aria-labelledby="tab-pagamenti" className="grid gap-5 lg:grid-cols-2">
          {puoImporti ? (
            <>
              <section className="card p-5">
                <h2 className="font-display text-lg font-bold">Riepilogo</h2>
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

              <section className="card p-5">
                <h2 className="font-display text-lg font-bold">Incassi</h2>
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
            </>
          ) : (
            <Avviso tono="info" className="lg:col-span-2">Il tuo ruolo non prevede la consultazione di importi e incassi.</Avviso>
          )}
        </div>
      )}

      {scheda === "documenti" && (
        <div role="tabpanel" id="pannello-documenti" aria-labelledby="tab-documenti" className="grid gap-5 lg:grid-cols-2">
          <section className="card p-5">
            <h2 className="font-display text-lg font-bold">Contratto</h2>
            <p className="mt-1 text-sm text-muted">{b.contrattoFirmatoAt ? `Firmato il ${dt(b.contrattoFirmatoAt)}${b.contrattoFirmaNome ? ` da ${b.contrattoFirmaNome}` : ""}.` : "Non ancora firmato."}</p>
            {puoImporti ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link className="btn-primary" href={`/gestionale/prenotazioni/${id}/contratto`}>Apri e modifica contratto</Link>
                <button className="btn-soft" disabled={busy} onClick={contratto}>Genera link contratto</button>
                {linkContratto && <a className="btn-soft" href={linkContratto} target="_blank" rel="noreferrer">Apri link</a>}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted">La generazione del link è riservata a titolare e operatori.</p>
            )}
          </section>
          {puoImporti && pagamentiBarca?.abilitati && (
            <section className="card p-5">
              <h2 className="font-display text-lg font-bold">Link di pagamento</h2>
              <p className="mt-1 text-sm text-muted">{b.prezzoCent ? "Genera e invia al cliente il link per pagare con carta." : "Imposta prima il prezzo del noleggio."}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn-primary" disabled={busy || !b.prezzoCent} onClick={generaLinkPagamento}>Link pagamento</button>
                {linkPagamento && <a className="btn-soft" href={linkPagamento} target="_blank" rel="noreferrer">Apri link</a>}
              </div>
            </section>
          )}
          {puoImporti && pagamentiBarca && !pagamentiBarca.abilitati && (
            <section className="card p-5">
              <h2 className="font-display text-lg font-bold">Pagamenti online</h2>
              <p className="mt-1 text-sm text-muted">{pagamentiBarca.motivo ?? "Non disponibili per questa barca."} Storico incassi e registrazioni manuali restano consultabili.</p>
            </section>
          )}
        </div>
      )}

      {scheda === "storico" && (
        <section role="tabpanel" id="pannello-storico" aria-labelledby="tab-storico" className="card p-5">
          <h2 className="font-display text-lg font-bold">Storico</h2>
          <ol className="mt-3 grid gap-3 text-sm">
            {eventi.map((e: any, i: number) => (
              <li key={i} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-foam text-ocean"><Icona nome={e.i} className="h-4 w-4" /></span>
                <span><b className="block font-semibold">{e.t}</b><span className="text-xs text-muted">{dt(e.d)}</span></span>
              </li>
            ))}
            {eventi.length === 0 && <li className="text-muted">Nessun evento.</li>}
          </ol>
        </section>
      )}
      {conferma.dialogo}
      {modulo.dialogo}
    </div>
  );
}

function azioniLabel(label: string, busy: boolean) {
  if (!busy) return label;
  return "Attendi…";
}

function Fatto({ icona, etichetta, valore }: { icona: NomeIcona; etichetta: string; valore: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl bg-[#f7faf9] px-3 py-2">
      <Icona nome={icona} className="h-4 w-4 text-ocean" />
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted">{etichetta}</p>
        <p className="truncate text-sm font-semibold">{valore}</p>
      </div>
    </div>
  );
}

function Cella({ etichetta, valore }: { etichetta: string; valore: string }) {
  return (
    <div><p className="text-xs text-muted">{etichetta}</p><b>{valore}</b></div>
  );
}
