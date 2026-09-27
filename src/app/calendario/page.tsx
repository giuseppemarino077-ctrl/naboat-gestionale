"use client";
import { useEffect, useMemo, useState } from "react";

type Cal = { boats: any[]; bookings: any[]; blocks: any[] };
type Sel = { boatId: string; giorno: string; booking?: any; block?: any } | null;

const isoDay = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayOf = (v: string) => isoDay(new Date(v));
// Costruzione orari a prova di browser (Safari non accetta "YYYY-MM-DDTHH:mm" senza secondi).
function istante(giorno: string, ora: string) {
  const [y, m, d] = giorno.split("-").map(Number);
  const [hh, mm] = ora.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0, 0, 0);
}
const inizioGiorno = (giorno: string) => istante(giorno, "00:00");
const fineGiorno = (giorno: string) => { const d = istante(giorno, "00:00"); d.setHours(23, 59, 59, 999); return d; };
const hhmm = (v: string) => new Date(v).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const euro = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const rif = (id: string) => `NB-${id.slice(0, 8).toUpperCase()}`;

const STATO_CELL: Record<string, string> = {
  prenotata: "border-[#f0d59a] bg-[#fff0cc] text-[#9a6406]",
  in_mare: "border-[#a9e0d0] bg-[#d8f3ea] text-[#177469]",
  rientrata: "border-[#d3dadb] bg-[#e8ecec] text-[#5d696b]",
};

function waLink(tel: string | null | undefined, testo: string) {
  const n = (tel ?? "").replace(/\D/g, "");
  if (!n) return null;
  const num = n.startsWith("39") ? n : `39${n}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(testo)}`;
}

export default function CalendarioPage() {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Cal | null>(null);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sel, setSel] = useState<Sel>(null);

  // Form stato (crea / sposta / cliente / blocco)
  const [crea, setCrea] = useState({ dalle: "09:00", alle: "17:00", passeggeri: 1, formula: "", clienteNome: "", telefono: "", email: "", destinazione: "", patenteOk: false, skipperId: "", note: "", prezzoEuro: "" });
  const [blocco, setBlocco] = useState({ motivo: "" });
  const [sposta, setSposta] = useState({ boatId: "", giorno: "", dalle: "", alle: "" });
  const [cliente, setCliente] = useState({ clienteNome: "", telefono: "" });
  const [sezCrea, setSezCrea] = useState(false);
  const [sezBlocco, setSezBlocco] = useState(false);
  const [sezSposta, setSezSposta] = useState(false);
  const [sezCliente, setSezCliente] = useState(false);
  const [busy, setBusy] = useState(false);

  const monday = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + offset * 7);
    return d;
  }, [offset]);
  const days = useMemo(() => [...Array(14)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; }), [monday]);
  const oggi = isoDay(new Date());

  const load = () => {
    const from = new Date(days[0]); from.setHours(0, 0, 0, 0);
    const to = new Date(days[days.length - 1]); to.setHours(23, 59, 59, 999);
    fetch(`/api/v1/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (j && Array.isArray(j.boats)) { setData(j); setErr(""); } else setErr("Serve login con azienda attiva."); })
      .catch(() => setErr("Serve login con azienda attiva."));
    fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
  };
  useEffect(load, [offset]);
  useEffect(() => { fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => setMe(j.user)).catch(() => {}); }, []);

  const chiama = async (url: string, method: string, body?: any) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    return j;
  };

  const apriCella = (boatId: string, d: Date) => {
    const g = isoDay(d);
    const booking = (data?.bookings ?? []).find((k) => k.boatId === boatId && dayOf(k.startAt) === g);
    const block = (data?.blocks ?? []).find((x) => x.boatId === boatId && dayOf(x.startAt) <= g && dayOf(x.endAt) >= g);
    const barca = data?.boats.find((b) => b.id === boatId);
    setMsg(""); setErr("");
    setSel({ boatId, giorno: g, booking, block });
    setSezCrea(false); setSezBlocco(false); setSezSposta(false); setSezCliente(false);
    setBlocco({ motivo: "" });
    if (booking) {
      setSposta({ boatId, giorno: g, dalle: hhmm(booking.startAt), alle: hhmm(booking.endAt) });
      setCliente({ clienteNome: booking.clienteNome ?? "", telefono: booking.telefono ?? "" });
    } else {
      setCrea({ dalle: "09:00", alle: "17:00", passeggeri: 1, formula: "", clienteNome: "", telefono: "", email: "", destinazione: "", patenteOk: false, skipperId: "", note: "", prezzoEuro: "" });
      proponiPrezzo(boatId, g, "09:00", "17:00", barca?.patenteRichiesta);
    }
  };

  const proponiPrezzo = async (boatId: string, giorno: string, dalle: string, alle: string, _patente?: boolean) => {
    const ore = (Number(alle.slice(0, 2)) + Number(alle.slice(3)) / 60) - (Number(dalle.slice(0, 2)) + Number(dalle.slice(3)) / 60);
    const tipo = ore <= 5 ? "mezza_giornata" : "giornata";
    const r = await fetch(`/api/v1/tariffe?boatId=${boatId}&data=${giorno}&tipo=${tipo}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.prezzoCent) setCrea((cur) => ({ ...cur, prezzoEuro: (j.prezzoCent / 100).toFixed(2).replace(".", ",") }));
  };

  const creaPrenotazione = async () => {
    if (!sel) return;
    if (!crea.clienteNome.trim() || crea.telefono.trim().length < 4) { setErr("Indica nome cliente e telefono."); return; }
    const start = istante(sel.giorno, crea.dalle);
    const end = istante(sel.giorno, crea.alle);
    if (!(start < end)) { setErr("L'orario di rientro deve essere dopo la partenza."); return; }
    const body = {
      boatId: sel.boatId,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      clienteNome: crea.clienteNome.trim(), telefono: crea.telefono.trim(), email: crea.email || undefined,
      passeggeri: Number(crea.passeggeri), destinazione: crea.destinazione || undefined,
      formula: crea.formula || undefined, note: crea.note || undefined,
      patenteOk: crea.patenteOk, skipperId: crea.skipperId || undefined,
      idempotencyKey: crypto.randomUUID(),
    };
    setBusy(true);
    const j = await chiama("/api/v1/bookings", "POST", body);
    if (j?.id) {
      if (crea.prezzoEuro.trim()) await chiama(`/api/v1/bookings/${j.id}`, "PATCH", { prezzoEuro: crea.prezzoEuro });
      setMsg("Prenotazione creata."); setSel(null);
    }
    setBusy(false);
  };

  const rendiNonDisponibile = async () => {
    if (!sel) return;
    setBusy(true);
    const j = await chiama("/api/v1/blocks", "POST", { boatId: sel.boatId, startAt: inizioGiorno(sel.giorno).toISOString(), endAt: fineGiorno(sel.giorno).toISOString(), motivo: blocco.motivo || undefined });
    if (j) { setMsg("Giornata resa non disponibile."); setSel(null); }
    setBusy(false);
  };

  const rimuoviBlocco = async (id: string) => {
    if (!confirm("Rimuovere il blocco?")) return;
    await chiama(`/api/v1/blocks/${id}`, "DELETE", {});
    setSel(null);
  };

  const segnaPartita = async (b: any) => { if (await chiama(`/api/v1/bookings/${b.id}/checkin`, "POST", { note: null })) { setMsg("Uscita segnata."); setSel(null); } };
  const segnaRientro = async (b: any) => { if (await chiama(`/api/v1/bookings/${b.id}/checkout`, "POST", { note: null })) { setMsg("Rientro segnato."); setSel(null); } };
  const eliminaPren = async (b: any) => { if (confirm("Eliminare la prenotazione?") && await chiama(`/api/v1/bookings/${b.id}`, "DELETE")) { setMsg("Prenotazione eliminata."); setSel(null); } };
  const salvaSposta = async () => {
    if (!sel?.booking) return;
    const start = istante(sposta.giorno, sposta.dalle);
    const end = istante(sposta.giorno, sposta.alle);
    if (!(start < end)) { setErr("Orari incoerenti."); return; }
    setBusy(true);
    const j = await chiama(`/api/v1/bookings/${sel.booking.id}`, "PATCH", { boatId: sposta.boatId, startAt: start.toISOString(), endAt: end.toISOString() });
    if (j) { setMsg("Prenotazione spostata."); setSel(null); }
    setBusy(false);
  };
  const salvaCliente = async () => {
    if (!sel?.booking) return;
    const j = await chiama(`/api/v1/bookings/${sel.booking.id}`, "PATCH", { clienteNome: cliente.clienteNome, telefono: cliente.telefono });
    if (j) { setMsg("Cliente aggiornato."); setSel(null); }
  };
  const contratto = async (b: any) => { const r = await chiama(`/api/v1/bookings/${b.id}/contratto`, "POST"); if (r?.url) { await navigator.clipboard.writeText(r.url).catch(() => {}); setMsg("Link contratto copiato."); } };
  const whatsapp = (b: any, testo: string) => {
    const l = waLink(b.telefono, testo);
    if (!l) { setErr("Il cliente non ha un telefono salvato."); return; }
    window.open(l, "_blank");
  };

  // Cruscotto di oggi
  const oggiBookings = (data?.bookings ?? []).filter((k) => dayOf(k.startAt) === oggi);
  const oggiBlocchi = (data?.blocks ?? []).filter((x) => dayOf(x.startAt) <= oggi && dayOf(x.endAt) >= oggi);
  const prossima = [...oggiBookings].sort((a, b) => +new Date(a.startAt) - +new Date(b.startAt)).find((k) => k.stato === "prenotata");
  const senzaTelefono = oggiBookings.filter((k) => !k.telefono).length;
  const daSistemare = oggiBookings.filter((k) => !k.contrattoFirmatoAt && k.stato !== "rientrata").length;

  const barcaSel = data?.boats.find((b) => b.id === sel?.boatId);
  const telAzienda = me?.tenantNome ?? "l'azienda";
  const testoPromemoria = (b: any) => `Ciao ${b.clienteNome ?? "cliente"}, ti ricordiamo la tua uscita con ${telAzienda} il ${new Date(b.startAt).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} alle ${hhmm(b.startAt)}. A presto!`;
  const testoLibero = (b: any) => `Ciao ${b.clienteNome ?? "cliente"}, `;

  return (
    <div className="grid gap-4">
      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="rounded-2xl border border-[#bfe6dc] bg-[#eafaf5] p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {/* Cruscotto operativo */}
      <div className="rounded-3xl bg-gradient-to-br from-[#3a2418] to-[#2a1408] p-5 text-white shadow-lg">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[#f3cba6]">Cruscotto operativo · oggi</p>
            <h1 className="mt-1 text-2xl">{new Date().toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</h1>
            <p className="mt-1 text-sm text-white/70">{oggiBookings.length === 0 ? "Nessun movimento programmato: la giornata è libera." : `${oggiBookings.length} prenotazioni in programma.`}</p>
          </div>
          <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
            {prossima ? <>Prossima partenza <b>{hhmm(prossima.startAt)}</b> · {prossima.boat?.nome}</> : "Agenda libera"}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { n: "Prenotazioni", v: oggiBookings.length },
            { n: "Barche bloccate", v: oggiBlocchi.length },
            { n: "Clienti", v: oggiBookings.length },
            { n: "Senza telefono", v: senzaTelefono },
          ].map((k) => (
            <div key={k.n} className="rounded-2xl bg-white/10 px-3 py-2">
              <p className="text-[10px] uppercase tracking-widest text-white/60">{k.n}</p>
              <p className="font-display text-2xl">{k.v}</p>
            </div>
          ))}
        </div>
        <p className="mt-3 text-sm">{daSistemare === 0 ? "✓ Nessuna criticità operativa" : `⚠ ${daSistemare} prenotazioni con contratto da firmare`}</p>
      </div>

      {/* Legenda + navigazione */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fff0cc] ring-1 ring-[#f0d59a]" /> Prenotata</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#d8f3ea] ring-1 ring-[#a9e0d0]" /> In mare</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#e8ecec] ring-1 ring-[#d3dadb]" /> Rientrata</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fdeeea] ring-1 ring-[#f6c9be]" /> Blocco</span>
          <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-white ring-1 ring-line" /> Libera</span>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-soft" onClick={() => setOffset(offset - 1)}>‹</button>
          <strong className="text-sm">{days[0].toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – {days[days.length - 1].toLocaleDateString("it-IT", { day: "numeric", month: "short" })}</strong>
          <button className="btn-soft" onClick={() => setOffset(offset + 1)}>›</button>
          <button className="btn-soft" onClick={() => setOffset(0)}>Oggi</button>
        </div>
      </div>

      {/* Griglia */}
      <div className="card overflow-x-auto">
        <div className="min-w-[980px]">
          <div className="grid" style={{ gridTemplateColumns: `180px repeat(${days.length}, minmax(64px,1fr))` }}>
            <div className="sticky left-0 z-10 border-b border-line bg-white px-3 py-2 text-xs font-bold text-muted">IMBARCAZIONE</div>
            {days.map((d) => {
              const isOggi = isoDay(d) === oggi;
              return (
                <div key={+d} className={"border-b border-l border-line px-1 py-2 text-center text-[11px] " + (isOggi ? "bg-[#fff0cc] font-bold text-[#9a6406]" : "text-muted")}>
                  {d.toLocaleDateString("it-IT", { weekday: "short" })}<br /><b>{d.getDate()}</b>
                </div>
              );
            })}

            {(data?.boats ?? []).map((bt: any) => (
              <div key={bt.id} className="contents">
                <div className="sticky left-0 z-10 border-b border-line bg-white px-3 py-3 text-sm">
                  <p className="font-bold">{bt.nome}</p>
                  <p className="text-xs text-muted">{bt.capienza} posti{bt.patenteRichiesta ? " · patente" : ""}</p>
                  <span className={bt.stato === "manutenzione" ? "badge-block" : bt.stato === "non_disponibile" ? "badge-pending" : "badge-ready"}>{bt.stato.replace("_", " ")}</span>
                </div>
                {days.map((d) => {
                  const g = isoDay(d);
                  const bks = (data?.bookings ?? []).filter((k) => k.boatId === bt.id && dayOf(k.startAt) === g);
                  const blk = (data?.blocks ?? []).find((x) => x.boatId === bt.id && dayOf(x.startAt) <= g && dayOf(x.endAt) >= g);
                  return (
                    <button
                      key={bt.id + g}
                      onClick={() => apriCella(bt.id, d)}
                      className={"min-h-[74px] border-b border-l border-line p-1 text-left align-top transition hover:bg-foam " + (isoDay(d) === oggi ? "bg-[#fffaf2]" : "")}
                    >
                      {bks.map((k) => (
                        <span key={k.id} className={"mb-1 block rounded-xl border px-2 py-1 text-[11px] font-semibold " + (STATO_CELL[k.stato] ?? "border-line bg-white")}>
                          {hhmm(k.startAt)} {k.clienteNome}
                        </span>
                      ))}
                      {blk && <span className="mb-1 block rounded-xl border border-[#f6c9be] bg-[#fdeeea] px-2 py-1 text-[11px] font-semibold text-coral">Blocco{blk.motivo ? `: ${blk.motivo}` : ""}</span>}
                      {bks.length === 0 && !blk && <span className="text-[11px] text-muted">Libera</span>}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {data && data.boats.length === 0 && (
        <div className="card grid place-items-center gap-2 p-8 text-center">
          <p className="font-semibold">Nessuna barca in flotta.</p>
          <p className="text-sm text-muted">Aggiungi le barche per popolare il calendario.</p>
          <a className="btn-primary" href="/flotta">Vai a Flotta</a>
        </div>
      )}

      {/* Modale cella */}
      {sel && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4" onClick={() => setSel(null)}>
          <div className="my-6 w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-ocean">Planning flotta</p>
                <h2 className="text-2xl">{barcaSel?.nome}</h2>
                <p className="text-sm text-muted">{new Date(sel.giorno + "T12:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-[#faf6f2] text-muted" onClick={() => setSel(null)}>✕</button>
            </div>

            {err && <p className="mt-4 rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}

            {sel.booking ? (
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-[#a9e0d0] bg-[#eafaf5] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-widest text-[#177469]">Prenotazione</span>
                    <span className={sel.booking.stato === "in_mare" ? "badge-ready" : sel.booking.stato === "rientrata" ? "badge-block" : "badge-pending"}>{sel.booking.stato.replace("_", " ")}</span>
                  </div>
                  <p className="mt-1 text-lg font-extrabold">{sel.booking.clienteNome ?? "cliente"}</p>
                  <p className="text-xs text-muted">{rif(sel.booking.id)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    <div><p className="text-xs text-muted">Inizio</p><b>{hhmm(sel.booking.startAt)}</b></div>
                    <div><p className="text-xs text-muted">Fine</p><b>{hhmm(sel.booking.endAt)}</b></div>
                    <div><p className="text-xs text-muted">Passeggeri</p><b>{sel.booking.passeggeri}</b></div>
                    <div><p className="text-xs text-muted">Prezzo</p><b>{euro(sel.booking.prezzoCent)}</b></div>
                    <div><p className="text-xs text-muted">Skipper</p><b>{skippers.find((s) => s.id === sel.booking.skipperId)?.nome ?? "nessuno"}</b></div>
                    <div><p className="text-xs text-muted">Patente cliente</p><b>{sel.booking.patenteOk ? "ok" : barcaSel?.patenteRichiesta ? "da verificare" : "non richiesta"}</b></div>
                  </div>
                  {sel.booking.note && <p className="mt-2 text-sm text-muted">{sel.booking.note}</p>}
                </div>

                <button className="w-full rounded-2xl bg-[#25D366] px-4 py-3 font-bold text-white" onClick={() => whatsapp(sel.booking, testoPromemoria(sel.booking))}>✆ Invia riepilogo WhatsApp</button>
                <button className="w-full rounded-2xl border border-line px-4 py-3 font-bold text-ocean" onClick={() => whatsapp(sel.booking, testoLibero(sel.booking))}>✎ Scrivi su WhatsApp</button>

                {sel.booking.stato === "prenotata" && <button className="w-full rounded-2xl bg-[#177469] px-4 py-3 font-bold text-white" onClick={() => segnaPartita(sel.booking)}>✓ Segna come partita</button>}
                {sel.booking.stato === "in_mare" && <button className="w-full rounded-2xl bg-ocean px-4 py-3 font-bold text-white" onClick={() => segnaRientro(sel.booking)}>⚓ Segna rientro</button>}
                <button className="w-full rounded-2xl border border-line px-4 py-3 font-bold text-ocean" onClick={() => contratto(sel.booking)}>Contratto: genera link</button>

                <div className="rounded-2xl border border-line">
                  <button className="flex w-full items-center justify-between px-4 py-3 font-bold text-ocean" onClick={() => setSezSposta(!sezSposta)}>Cambia barca, giorno o orario <span>{sezSposta ? "▾" : "▸"}</span></button>
                  {sezSposta && (
                    <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-2">
                      <select className="rounded-2xl border border-line p-3" value={sposta.boatId} onChange={(e) => setSposta({ ...sposta, boatId: e.target.value })}>
                        {(data?.boats ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.nome}</option>)}
                      </select>
                      <input className="rounded-2xl border border-line p-3" type="date" value={sposta.giorno} onChange={(e) => setSposta({ ...sposta, giorno: e.target.value })} />
                      <input className="rounded-2xl border border-line p-3" type="time" value={sposta.dalle} onChange={(e) => setSposta({ ...sposta, dalle: e.target.value })} />
                      <input className="rounded-2xl border border-line p-3" type="time" value={sposta.alle} onChange={(e) => setSposta({ ...sposta, alle: e.target.value })} />
                      <button className="btn-primary sm:col-span-2" onClick={salvaSposta}>Salva spostamento</button>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-line">
                  <button className="flex w-full items-center justify-between px-4 py-3 font-bold text-ocean" onClick={() => setSezCliente(!sezCliente)}>Modifica cliente <span>{sezCliente ? "▾" : "▸"}</span></button>
                  {sezCliente && (
                    <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-2">
                      <input className="rounded-2xl border border-line p-3" placeholder="Nome cliente" value={cliente.clienteNome} onChange={(e) => setCliente({ ...cliente, clienteNome: e.target.value })} />
                      <input className="rounded-2xl border border-line p-3" placeholder="Telefono" value={cliente.telefono} onChange={(e) => setCliente({ ...cliente, telefono: e.target.value })} />
                      <button className="btn-primary sm:col-span-2" onClick={salvaCliente}>Salva cliente</button>
                    </div>
                  )}
                </div>

                <button className="w-full rounded-2xl border border-coral/40 px-4 py-3 font-bold text-coral" onClick={() => eliminaPren(sel.booking)}>Elimina prenotazione</button>
                <button className="w-full rounded-2xl bg-[#3a2418] px-4 py-3 font-bold text-white" onClick={() => setSel(null)}>Chiudi</button>
              </div>
            ) : sel.block ? (
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-[#f6c9be] bg-[#fdeeea] p-4">
                  <p className="text-xs font-semibold uppercase tracking-widest text-coral">Non disponibile</p>
                  <p className="mt-1 font-bold">{barcaSel?.nome} non è disponibile in questa giornata.</p>
                  {sel.block.motivo && <p className="text-sm text-muted">Motivo: {sel.block.motivo}</p>}
                </div>
                <button className="w-full rounded-2xl border border-line px-4 py-3 font-bold text-ocean" onClick={() => rimuoviBlocco(sel.block.id)}>Rimuovi blocco</button>
                <button className="w-full rounded-2xl bg-[#3a2418] px-4 py-3 font-bold text-white" onClick={() => setSel(null)}>Chiudi</button>
              </div>
            ) : (
              <div className="mt-5 grid gap-4">
                <div className="rounded-2xl border border-[#a9e0d0] bg-[#eafaf5] p-4">
                  <p className="font-bold text-[#177469]">Barca libera per l'intera giornata</p>
                  <p className="text-sm text-muted">Crea qui la prenotazione oppure rendi la barca non disponibile per questa giornata.</p>
                </div>

                <div className="rounded-2xl border border-line">
                  <button className="flex w-full items-center justify-between px-4 py-3 font-bold text-ocean" onClick={() => setSezCrea(!sezCrea)}>＋ Crea prenotazione <span>{sezCrea ? "▾" : "▸"}</span></button>
                  {sezCrea && (
                    <div className="grid gap-3 border-t border-line p-4 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">Partenza *<input className="rounded-2xl border border-line p-3" type="time" value={crea.dalle} onChange={(e) => setCrea({ ...crea, dalle: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Rientro *<input className="rounded-2xl border border-line p-3" type="time" value={crea.alle} onChange={(e) => setCrea({ ...crea, alle: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Passeggeri *<input className="rounded-2xl border border-line p-3" type="number" min={1} value={crea.passeggeri} onChange={(e) => setCrea({ ...crea, passeggeri: Number(e.target.value) })} /></label>
                      <label className="grid gap-1 text-sm">Formula<input className="rounded-2xl border border-line p-3" placeholder="facoltativa" value={crea.formula} onChange={(e) => setCrea({ ...crea, formula: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Nome cliente *<input className="rounded-2xl border border-line p-3" value={crea.clienteNome} onChange={(e) => setCrea({ ...crea, clienteNome: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Telefono *<input className="rounded-2xl border border-line p-3" value={crea.telefono} onChange={(e) => setCrea({ ...crea, telefono: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Email<input className="rounded-2xl border border-line p-3" type="email" value={crea.email} onChange={(e) => setCrea({ ...crea, email: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Destinazione<input className="rounded-2xl border border-line p-3" value={crea.destinazione} onChange={(e) => setCrea({ ...crea, destinazione: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Skipper
                        <select className="rounded-2xl border border-line p-3" value={crea.skipperId} onChange={(e) => setCrea({ ...crea, skipperId: e.target.value })}>
                          <option value="">Nessuno · non serve</option>
                          {skippers.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
                        </select>
                      </label>
                      <label className="grid gap-1 text-sm">Prezzo €<input className="rounded-2xl border border-line p-3" value={crea.prezzoEuro} onChange={(e) => setCrea({ ...crea, prezzoEuro: e.target.value })} placeholder="dal listino" /></label>
                      {barcaSel?.patenteRichiesta ? (
                        <div className="grid gap-2 rounded-2xl border border-gold/50 bg-[#fff7e6] p-3 text-sm sm:col-span-2">
                          <p className="font-semibold text-[#9a6406]">Questa barca richiede la patente nautica.</p>
                          <p className="text-muted">Spunta che il cliente è patentato, oppure assegna uno skipper.</p>
                          <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={crea.patenteOk} onChange={(e) => setCrea({ ...crea, patenteOk: e.target.checked })} /> Il cliente ha la patente nautica</label>
                        </div>
                      ) : (
                        <p className="rounded-2xl border border-[#a9e0d0] bg-[#eafaf5] p-3 text-sm text-[#177469] sm:col-span-2">Per questa barca la patente nautica non è richiesta.</p>
                      )}
                      <label className="grid gap-1 text-sm sm:col-span-2">Nota<input className="rounded-2xl border border-line p-3" value={crea.note} onChange={(e) => setCrea({ ...crea, note: e.target.value })} placeholder="Itinerario, richieste, promemoria…" /></label>
                      <button className="btn-primary sm:col-span-2 disabled:opacity-50" disabled={busy || (!!barcaSel?.patenteRichiesta && !crea.patenteOk && !crea.skipperId)} onClick={creaPrenotazione}>{busy ? "Creo…" : "Crea prenotazione"}</button>
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-line">
                  <button className="flex w-full items-center justify-between px-4 py-3 font-bold text-ocean" onClick={() => setSezBlocco(!sezBlocco)}>Rendi non disponibile <span>{sezBlocco ? "▾" : "▸"}</span></button>
                  {sezBlocco && (
                    <div className="grid gap-2 border-t border-line p-4">
                      <input className="rounded-2xl border border-line p-3" placeholder="Motivo (es. manutenzione, uso privato…)" value={blocco.motivo} onChange={(e) => setBlocco({ motivo: e.target.value })} />
                      <button className="btn-primary" disabled={busy} onClick={rendiNonDisponibile}>{busy ? "Salvo…" : "Rendi non disponibile"}</button>
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <a className="btn-soft flex-1 text-center" href="/flotta">Gestisci barca</a>
                  <button className="flex-1 rounded-full bg-[#3a2418] px-4 py-2.5 font-bold text-white" onClick={() => setSel(null)}>Chiudi</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
