"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Giorno, oggi, aData, daData, giornoDi, oreDi, istante, inizioGiorno, fineGiorno,
  aggiungiGiorni, lunediDi, giorniTra, GIORNI_BREVI,
} from "@/lib/calendario";
import { uuidSicuro, copiaTesto } from "@/lib/browser";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { Icona } from "@/components/ui/Icona";
import { useConferma } from "@/components/ui/Dialogo";

type Cal = { boats: any[]; bookings: any[]; blocks: any[] };
type Vista = "giorno" | "settimana" | "mese" | "agenda";
type Sel =
  | { modo: "nuovo"; boatId: string; giorno: Giorno }
  | { modo: "prenotazione"; id: string }
  | { modo: "blocco"; id: string }
  | null;

const euro = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const codice = (b: any) => `NB-${giornoDi(b.startAt).slice(0, 4)}-${String(b.id).slice(0, 6).toUpperCase()}`;
// Minuti dalla mezzanotte civile di Roma, indipendenti dal fuso del browser.
const minutiRoma = (iso: string) => { const [hh, mm] = oreDi(iso).split(":").map(Number); return hh * 60 + mm; };
const waLink = (tel: string | null | undefined, testo: string) => {
  const n = (tel ?? "").replace(/\D/g, "");
  return n ? `https://wa.me/${n.startsWith("39") ? n : `39${n}`}?text=${encodeURIComponent(testo)}` : null;
};
// Un noleggio su più giorni mostra anche la data di rientro, distinta dalla partenza.
const piuGiorni = (k: any) => giornoDi(k.startAt) !== giornoDi(k.endAt);
const fineBreve = (iso: string) => aData(giornoDi(iso)).toLocaleDateString("it-IT", { day: "numeric", month: "short" });

function coloreEvento(b: any) {
  if (b.stato === "cancellata" || b.stato === "no_show") return "border-[#f6c9be] bg-[#fdeeea] text-coral";
  if (b.stato === "rientrata") return "border-[#d3dadb] bg-[#eceff0] text-[#5d696b]";
  if (b.stato === "in_mare") return "border-[#8fd3c2] bg-[#d8f3ea] text-[#14554c]";
  if (b.stato === "da_confermare") return "border-[#f0d59a] bg-[#fff0cc] text-[#9a6406]";
  return "border-[#a9e0d0] bg-[#e7f8f1] text-[#177469]";
}

export default function CalendarioPage() {
  const [base, setBase] = useState<Giorno>(oggi());
  const [vista, setVista] = useState<Vista>("settimana");
  const [data, setData] = useState<Cal | null>(null);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [fBarca, setFBarca] = useState<string>("");
  const [fPorto, setFPorto] = useState<string>("");
  const [porti, setPorti] = useState<any[]>([]);
  const [fTipo, setFTipo] = useState<"tutti" | "prenotazioni" | "blocchi">("tutti");
  const [sel, setSel] = useState<Sel>(null);
  const [busy, setBusy] = useState(false);
  // Versione letta della prenotazione aperta: serve al PATCH per accorgersi se un
  // altro operatore l'ha modificata nel frattempo (409) senza perdere la bozza.
  const [versione, setVersione] = useState<string | null>(null);
  const [conflitto, setConflitto] = useState(false);
  const conferma = useConferma();

  // form
  const [crea, setCrea] = useState({ inizioData: "", dalle: "09:00", fineData: "", alle: "17:00", passeggeri: 1, formula: "", clienteNome: "", telefono: "", email: "", destinazione: "", patenteOk: false, skipperId: "", note: "", prezzoEuro: "" });
  const [blocco, setBlocco] = useState({ motivo: "" });
  // Inizio e fine hanno data e ora distinte: una prenotazione su più giorni non
  // viene ricondotta allo stesso giorno quando la si modifica.
  const [mod, setMod] = useState({ clienteNome: "", telefono: "", boatId: "", inizioData: "", inizioOra: "", fineData: "", fineOra: "" });
  const [partenza, setPartenza] = useState({ carburante: "100", note: "" });
  const [rientro, setRientro] = useState({ carburante: "", danni: "", note: "" });
  const [linkContratto, setLinkContratto] = useState("");
  const [linkPagamento, setLinkPagamento] = useState("");
  const [sez, setSez] = useState<"crea" | "blocca" | "sposta" | "cliente" | null>("crea");

  const range = useMemo(() => {
    if (vista === "giorno") return { from: inizioGiorno(base).toISOString(), to: fineGiorno(base).toISOString() };
    if (vista === "settimana") {
      const lun = lunediDi(base);
      return { from: inizioGiorno(lun).toISOString(), to: fineGiorno(aggiungiGiorni(lun, 6)).toISOString() };
    }
    if (vista === "mese") {
      const d = aData(base);
      const primo = daData(new Date(d.getFullYear(), d.getMonth(), 1));
      const ultimo = daData(new Date(d.getFullYear(), d.getMonth() + 1, 0));
      return { from: inizioGiorno(primo).toISOString(), to: fineGiorno(ultimo).toISOString() };
    }
    return { from: inizioGiorno(base).toISOString(), to: fineGiorno(aggiungiGiorni(base, 13)).toISOString() };
  }, [vista, base]);

  const ricarica = async () => {
    const j = await fetch(`/api/v1/calendar?from=${range.from}&to=${range.to}`).then((r) => r.json()).catch(() => null);
    if (j && Array.isArray(j.boats)) { setData(j); setErr(""); }
    else setErr("Serve login con azienda attiva.");
    return j;
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { ricarica(); }, [vista, base]);
  // Le altre viste possono cambiare il calendario: ci si riallinea, ma non mentre un
  // pannello è aperto (una bozza in corso non deve essere sovrascritta).
  useAggiornamenti(() => { if (sel) return; return ricarica(); }, ["prenotazioni"]);
  const aggiornaVersione = async (id: string) => {
    const j = await fetch(`/api/v1/bookings/${id}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    setVersione(j?.updatedAt ?? null);
    return j?.updatedAt ?? null;
  };
  useEffect(() => {
    fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
    fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => setMe(j.user)).catch(() => {});
    fetch("/api/v1/porti").then((r) => r.json()).then((j) => Array.isArray(j) && setPorti(j)).catch(() => {});
  }, []);

  const barche = (data?.boats ?? []).filter((b) => (!fBarca || b.id === fBarca) && (!fPorto || b.portoId === fPorto));

  const chiama = async (okMsg: string, url: string, method: string, body?: any, chiudi = false) => {
    setBusy(true); setErr(""); setConflitto(false);
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setMsg(okMsg);
    await ricarica();
    // Le altre viste (Prenotazioni, Oggi, Ormeggio) si riallineano subito.
    segnalaCambiamento("prenotazioni");
    if (chiudi) setSel(null);
    return j;
  };

  const apriNuovo = (boatId: string, giorno: Giorno) => {
    setErr(""); setMsg(""); setLinkContratto(""); setLinkPagamento("");
    setCrea({ inizioData: giorno, dalle: "09:00", fineData: giorno, alle: "17:00", passeggeri: 1, formula: "", clienteNome: "", telefono: "", email: "", destinazione: "", patenteOk: false, skipperId: "", note: "", prezzoEuro: "" });
    setBlocco({ motivo: "" });
    setSez("crea");
    setSel({ modo: "nuovo", boatId, giorno });
    proponiPrezzo(boatId, giorno, "09:00", "17:00");
  };
  const apriPrenotazione = (id: string) => {
    const b = (data?.bookings ?? []).find((x) => x.id === id);
    if (!b) return;
    setErr(""); setMsg(""); setLinkContratto(""); setLinkPagamento(""); setSez("sposta"); setConflitto(false);
    setMod({ clienteNome: b.clienteNome ?? "", telefono: b.telefono ?? "", boatId: b.boatId, inizioData: giornoDi(b.startAt), inizioOra: oreDi(b.startAt), fineData: giornoDi(b.endAt), fineOra: oreDi(b.endAt) });
    setPartenza({ carburante: b.checkinCarburantePct != null ? String(b.checkinCarburantePct) : "100", note: "" });
    setRientro({ carburante: "", danni: "", note: "" });
    setSel({ modo: "prenotazione", id });
    // Il calendario non porta updatedAt nell'elenco: si legge la versione dal dettaglio.
    setVersione(null);
    aggiornaVersione(id);
  };
  const apriBlocco = (id: string) => { setErr(""); setMsg(""); setSel({ modo: "blocco", id }); };

  const proponiPrezzo = async (boatId: string, giorno: Giorno, dalle: string, alle: string) => {
    const ore = (Number(alle.slice(0, 2)) + Number(alle.slice(3)) / 60) - (Number(dalle.slice(0, 2)) + Number(dalle.slice(3)) / 60);
    const tipo = ore <= 5 ? "mezza_giornata" : "giornata";
    const r = await fetch(`/api/v1/tariffe?boatId=${boatId}&data=${giorno}&tipo=${tipo}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.prezzoCent) setCrea((c) => ({ ...c, prezzoEuro: (j.prezzoCent / 100).toFixed(2).replace(".", ",") }));
  };

  const creaPrenotazione = async () => {
    if (sel?.modo !== "nuovo") return;
    if (!crea.clienteNome.trim() || crea.telefono.trim().length < 4) { setErr("Indica nome cliente e telefono."); return; }
    const start = istante(crea.inizioData || sel.giorno, crea.dalle);
    const end = istante(crea.fineData || crea.inizioData || sel.giorno, crea.alle);
    if (!(start < end)) { setErr("Il rientro deve essere dopo la partenza."); return; }
    const j = await chiama("Prenotazione creata.", "/api/v1/bookings", "POST", {
      boatId: sel.boatId, startAt: start.toISOString(), endAt: end.toISOString(),
      clienteNome: crea.clienteNome.trim(), telefono: crea.telefono.trim(), email: crea.email || undefined,
      passeggeri: Number(crea.passeggeri), destinazione: crea.destinazione || undefined, formula: crea.formula || undefined,
      note: crea.note || undefined, patenteOk: crea.patenteOk, skipperId: crea.skipperId || undefined, idempotencyKey: uuidSicuro(),
    });
    if (j?.id) {
      if (crea.prezzoEuro.trim()) await fetch(`/api/v1/bookings/${j.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prezzoEuro: crea.prezzoEuro }) });
      await ricarica();
      apriPrenotazione(j.id);
    }
  };
  const creaBlocco = async () => {
    if (sel?.modo !== "nuovo") return;
    await chiama("Giornata resa non disponibile.", "/api/v1/blocks", "POST", { boatId: sel.boatId, startAt: inizioGiorno(sel.giorno).toISOString(), endAt: fineGiorno(sel.giorno).toISOString(), motivo: blocco.motivo || undefined }, true);
  };
  const rimuoviBlocco = async (id: string) => {
    const ok = await conferma.chiedi({ titolo: "Rendere di nuovo libera la giornata?", messaggio: "Il blocco verrà rimosso e la barca tornerà prenotabile in quelle date.", confermaLabel: "Rimuovi blocco" });
    if (ok) await chiama("Giornata di nuovo libera.", `/api/v1/blocks/${id}`, "DELETE", undefined, true);
  };
  const annullaPren = async (id: string) => {
    const ok = await conferma.chiedi({ titolo: "Annullare la prenotazione?", messaggio: "La barca torna disponibile per quelle date e il cliente non riceverà più promemoria.", confermaLabel: "Annulla prenotazione", pericoloso: true });
    if (ok) await chiama("Prenotazione annullata.", `/api/v1/bookings/${id}`, "DELETE", undefined, true);
  };
  const partenzaOra = async (b: any) => azionePren(b, "Barca segnata in mare.", "checkin", { carburantePct: partenza.carburante === "" ? null : Number(partenza.carburante), note: partenza.note || null });
  const rientroOra = async (b: any) => azionePren(b, "Rientro registrato.", "checkout", { carburantePct: rientro.carburante === "" ? null : Number(rientro.carburante), danniEuro: rientro.danni || null, note: rientro.note || null });
  const azionePren = async (b: any, ok: string, az: string, body: any) => { await chiama(ok, `/api/v1/bookings/${b.id}/${az}`, "POST", body); };
  const salvaMod = async (b: any) => {
    if (!mod.inizioData || !mod.fineData) { setErr("Indica data e ora di inizio e fine."); return; }
    const start = istante(mod.inizioData, mod.inizioOra); const end = istante(mod.fineData, mod.fineOra);
    if (!(start < end)) { setErr("Orari incoerenti."); return; }
    setBusy(true); setErr(""); setMsg(""); setConflitto(false);
    const r = await fetch(`/api/v1/bookings/${b.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      // Si invia la versione letta: se un altro operatore ha salvato nel frattempo, il
      // server risponde 409 e si conserva la bozza.
      body: JSON.stringify({ boatId: mod.boatId, startAt: start.toISOString(), endAt: end.toISOString(), clienteNome: mod.clienteNome, telefono: mod.telefono, ...(versione ? { updatedAt: versione } : {}) }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (r.status === 409) { setConflitto(true); return; }
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setMsg("Prenotazione aggiornata.");
    await ricarica();
    await aggiornaVersione(b.id);
    segnalaCambiamento("prenotazioni");
  };
  // Conflitto: si ricaricano i dati di sfondo senza toccare i campi in modifica, poi
  // si allinea la versione così il prossimo "Salva" riparte da quella corretta.
  const ricaricaDopoConflitto = async () => {
    setConflitto(false); setErr("");
    await ricarica();
    if (sel?.modo === "prenotazione") await aggiornaVersione(sel.id);
    setMsg("Dati aggiornati. I valori che stavi modificando sono rimasti.");
  };
  const contratto = async (b: any) => { const j = await chiama("Link contratto generato.", `/api/v1/bookings/${b.id}/contratto`, "POST"); if (j?.url) { setLinkContratto(j.url); await copiaTesto(j.url); } };
  const pagamento = async (b: any) => { const j = await chiama("Link di pagamento generato.", "/api/v1/payments/checkout", "POST", { bookingId: b.id }); if (j?.url) { setLinkPagamento(j.url); await copiaTesto(j.url); } };
  const whatsapp = (b: any, testo: string) => { const l = waLink(b.telefono, testo); if (!l) { setErr("Il cliente non ha un telefono."); return; } window.open(l, "_blank"); };

  // eventi raggruppati per barca/giorno
  const eventiGiorno = (boatId: string, g: Giorno) => {
    const bks = (data?.bookings ?? []).filter((k) => k.boatId === boatId && giornoDi(k.startAt) === g);
    const blk = (data?.blocks ?? []).find((x) => x.boatId === boatId && giornoDi(x.startAt) <= g && giornoDi(x.endAt) >= g);
    return { bks, blk };
  };

  const nav = (n: number) => {
    if (vista === "mese") { const d = aData(base); setBase(daData(new Date(d.getFullYear(), d.getMonth() + n, 1))); return; }
    setBase((b) => aggiungiGiorni(b, vista === "settimana" ? n * 7 : vista === "agenda" ? n * 14 : n));
  };
  const etichettaRange = vista === "giorno"
    ? aData(base).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    : vista === "settimana"
      ? `${aData(lunediDi(base)).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${aData(aggiungiGiorni(lunediDi(base), 6)).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}`
      : vista === "mese"
        ? aData(base).toLocaleDateString("it-IT", { month: "long", year: "numeric" })
        : `${aData(base).toLocaleDateString("it-IT", { day: "numeric", month: "short" })} – ${aData(aggiungiGiorni(base, 13)).toLocaleDateString("it-IT", { day: "numeric", month: "short" })}`;

  const barcaDi = (id: string) => data?.boats.find((b) => b.id === id);
  const prenSel = sel?.modo === "prenotazione" ? (data?.bookings ?? []).find((b) => b.id === sel.id) : null;
  const blkSel = sel?.modo === "blocco" ? (data?.blocks ?? []).find((b) => b.id === sel.id) : null;

  const ore = Array.from({ length: 24 }, (_, i) => i);

  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      {!data && !err && <Caricamento testo="Carico il calendario…" />}

      {/* Barra strumenti */}
      <div className="flex flex-wrap items-center gap-3 rounded-3xl border border-line bg-white p-3 shadow-sm">
        <div className="inline-flex rounded-full border border-line p-1">
          {(["giorno", "settimana", "mese", "agenda"] as Vista[]).map((v) => (
            <button key={v} className={"rounded-full px-4 py-1.5 text-sm font-bold capitalize " + (vista === v ? "bg-ocean text-white" : "text-ocean hover:bg-foam")} onClick={() => setVista(v)}>{v}</button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <button className="btn-soft" aria-label="Periodo precedente" onClick={() => nav(-1)}><Icona nome="freccia-sinistra" className="h-4 w-4" /></button>
          <button className="btn-soft" onClick={() => setBase(oggi())}>Oggi</button>
          <button className="btn-soft" aria-label="Periodo successivo" onClick={() => nav(1)}><Icona nome="freccia-destra" className="h-4 w-4" /></button>
        </div>
        <strong className="text-sm capitalize">{etichettaRange}</strong>
        <div className="ml-auto flex flex-wrap items-center gap-2 text-sm">
          {porti.length > 0 && (
            <select className="rounded-full border border-line bg-white px-3 py-2" value={fPorto} onChange={(e) => { setFPorto(e.target.value); setFBarca(""); }}>
              <option value="">Tutti i porti</option>
              {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          )}
          <select className="rounded-full border border-line bg-white px-3 py-2" value={fBarca} onChange={(e) => setFBarca(e.target.value)}>
            <option value="">Tutte le barche</option>
            {(data?.boats ?? []).filter((b) => !fPorto || b.portoId === fPorto).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <select className="rounded-full border border-line bg-white px-3 py-2" value={fTipo} onChange={(e) => setFTipo(e.target.value as any)}>
            <option value="tutti">Tutti gli eventi</option>
            <option value="prenotazioni">Solo prenotazioni</option>
            <option value="blocchi">Solo blocchi</option>
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1"><i className="h-3 w-4 rounded bg-[#e7f8f1] ring-1 ring-[#a9e0d0]" /> prenotazione</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-4 rounded bg-[#d8f3ea] ring-1 ring-[#8fd3c2]" /> in navigazione</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-4 rounded bg-[#eceff0] ring-1 ring-[#d3dadb]" /> completata</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-4 rounded bg-[#fdeeea] ring-1 ring-[#f6c9be]" /> blocco</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-4 rounded bg-white ring-1 ring-line" /> libera</span>
      </div>

      {data && data.boats.length === 0 && (
        <div className="card grid place-items-center gap-2 p-8 text-center">
          <p className="font-semibold">Nessuna barca in flotta.</p>
          <Link className="btn-primary" href="/gestionale/flotta">Vai a Flotta</Link>
        </div>
      )}

      {/* VISTA MESE — occupazione dell'intera flotta */}
      {vista === "mese" && (() => {
        const d = aData(base);
        const primo = daData(new Date(d.getFullYear(), d.getMonth(), 1));
        const ultimo = daData(new Date(d.getFullYear(), d.getMonth() + 1, 0));
        const giorni = giorniTra(lunediDi(primo), aggiungiGiorni(lunediDi(ultimo), 6));
        const mese = d.getMonth();
        const totale = barche.length || 1;
        return (
          <div className="card p-4">
            <div className="grid grid-cols-7 gap-1 text-center text-xs font-bold text-muted">
              {GIORNI_BREVI.map((g) => <div key={g} className="py-1">{g}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {giorni.map((g) => {
                const gg = aData(g);
                const fuori = gg.getMonth() !== mese;
                const occupate = barche.filter((bt) => { const e = eventiGiorno(bt.id, g); return e.bks.length > 0 || e.blk; }).length;
                const pct = Math.round((occupate / totale) * 100);
                return (
                  <button
                    key={g}
                    onClick={() => { setBase(g); setVista("giorno"); }}
                    title={`${occupate} barche impegnate`}
                    className={"rounded-2xl border p-2 text-left transition hover:border-ocean " + (fuori ? "opacity-40 " : "") + (g === oggi() ? "border-ocean " : "border-line ") + (occupate ? "bg-foam" : "bg-white")}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">{gg.getDate()}</span>
                      {occupate > 0 && <span className="text-[10px] text-muted">{occupate}/{barche.length}</span>}
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-[#efe9e3]"><div className="h-1.5 rounded-full bg-ocean" style={{ width: `${pct}%` }} /></div>
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs text-muted">Numero di barche impegnate ogni giorno (prenotazioni o blocchi). Clicca un giorno per aprirlo.</p>
          </div>
        );
      })()}

      {/* VISTA GIORNO — timeline oraria multi-barca */}
      {vista === "giorno" && (
        <div className="card overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: "180px repeat(24, minmax(34px,1fr))" }}>
              <div className="sticky left-0 z-10 border-b border-line bg-white px-3 py-2 text-xs font-bold text-muted">IMBARCAZIONE</div>
              {ore.map((h) => <div key={h} className="border-b border-l border-line py-1 text-center text-[10px] text-muted">{String(h).padStart(2, "0")}</div>)}
              {barche.map((bt) => {
                const { bks, blk } = eventiGiorno(bt.id, base);
                return (
                  <div key={bt.id} className="contents">
                    <div className="sticky left-0 z-10 border-b border-line bg-white px-3 py-3 text-sm">
                      <p className="font-bold">{bt.nome}</p>
                      <p className="text-xs text-muted">{bt.capienza} posti</p>
                    </div>
                    <div className="relative h-16 border-b border-l border-line" style={{ gridColumn: "2 / span 24" }}>
                      {ore.map((h) => <div key={h} className="absolute top-0 h-full border-l border-line/50" style={{ left: `calc(${(h / 24) * 100}% )` }} />)}
                      {fTipo !== "blocchi" && bks.map((k) => {
                        const l = (minutiRoma(k.startAt) / 60) / 24 * 100;
                        const w = Math.max(2, ((new Date(k.endAt).getTime() - new Date(k.startAt).getTime()) / 3600000) / 24 * 100);
                        return (
                          <button key={k.id} onClick={() => apriPrenotazione(k.id)} className={"absolute top-2 h-12 overflow-hidden rounded-lg border px-2 py-1 text-left text-[11px] font-semibold hover:brightness-105 " + coloreEvento(k)} style={{ left: `${l}%`, width: `${Math.min(100 - l, w)}%` }}>
                            {oreDi(k.startAt)}–{piuGiorni(k) ? ` ${fineBreve(k.endAt)}` : oreDi(k.endAt)} {k.clienteNome}
                            {k.origineCanale === "naboat" && <span className="ml-1 rounded bg-white/70 px-1 text-[9px]">NaBoat</span>}
                          </button>
                        );
                      })}
                      {fTipo !== "prenotazioni" && blk && (
                        <button onClick={() => apriBlocco(blk.id)} className="absolute top-2 h-12 w-24 overflow-hidden rounded-lg border border-[#f6c9be] bg-[#fdeeea] px-2 py-1 text-left text-[11px] font-semibold text-coral" style={{ left: "0%" }}>
                          Blocco{blk.motivo ? `: ${blk.motivo}` : ""}
                        </button>
                      )}
                      <button className="absolute inset-0 -z-0" title="Clicca per creare" onClick={(ev) => { const rect = (ev.currentTarget as HTMLElement).getBoundingClientRect(); const frac = (ev.clientX - rect.left) / rect.width; const hh = Math.min(23, Math.max(0, Math.floor(frac * 24))); setSez("crea"); setCrea((c) => ({ ...c, dalle: `${String(hh).padStart(2, "0")}:00`, alle: `${String(Math.min(23, hh + 8)).padStart(2, "0")}:00` })); apriNuovo(bt.id, base); }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* VISTA SETTIMANA — griglia barche × giorni */}
      {vista === "settimana" && (
        <div className="card overflow-x-auto">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: `180px repeat(7, minmax(110px,1fr))` }}>
              <div className="sticky left-0 z-10 border-b border-line bg-white px-3 py-2 text-xs font-bold text-muted">IMBARCAZIONE</div>
              {giorniTra(lunediDi(base), aggiungiGiorni(lunediDi(base), 6)).map((g) => (
                <div key={g} className={"border-b border-l border-line px-2 py-2 text-center text-xs " + (g === oggi() ? "bg-[#fff0cc] font-bold text-[#9a6406]" : "text-muted")}>
                  {aData(g).toLocaleDateString("it-IT", { weekday: "short" })}<br /><b>{aData(g).getDate()}</b>
                </div>
              ))}
              {barche.map((bt) => (
                <div key={bt.id} className="contents">
                  <div className="sticky left-0 z-10 border-b border-line bg-white px-3 py-3 text-sm">
                    <p className="font-bold">{bt.nome}</p>
                    <span className={bt.stato === "manutenzione" ? "badge-block" : bt.stato === "non_disponibile" ? "badge-pending" : "badge-ready"}>{bt.stato.replace("_", " ")}</span>
                  </div>
                  {giorniTra(lunediDi(base), aggiungiGiorni(lunediDi(base), 6)).map((g) => {
                    const { bks, blk } = eventiGiorno(bt.id, g);
                    return (
                      <div key={bt.id + g} className={"min-h-[80px] space-y-1 border-b border-l border-line p-1.5 " + (g === oggi() ? "bg-[#fffaf2]" : "")}>
                        {fTipo !== "blocchi" && bks.map((k) => (
                          <button key={k.id} onClick={() => apriPrenotazione(k.id)} className={"block w-full rounded-lg border px-2 py-1 text-left text-[11px] font-semibold hover:brightness-105 " + coloreEvento(k)}>
                            {oreDi(k.startAt)}{piuGiorni(k) ? ` → ${fineBreve(k.endAt)}` : ""} {k.clienteNome}{k.origineCanale === "naboat" ? <span className="ml-1 rounded bg-white/70 px-1 text-[9px]">NaBoat</span> : null}
                          </button>
                        ))}
                        {fTipo !== "prenotazioni" && blk && (
                          <button onClick={() => apriBlocco(blk.id)} className="block w-full rounded-lg border border-[#f6c9be] bg-[#fdeeea] px-2 py-1 text-left text-[11px] font-semibold text-coral">Blocco{blk.motivo ? `: ${blk.motivo}` : ""}</button>
                        )}
                        {bks.length === 0 && !blk && <button onClick={() => apriNuovo(bt.id, g)} className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line py-2 text-[11px] text-muted hover:border-ocean hover:bg-foam"><Icona nome="piu" className="h-3.5 w-3.5" /> libera</button>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* VISTA AGENDA */}
      {vista === "agenda" && (
        <div className="grid gap-3">
          {giorniTra(base, aggiungiGiorni(base, 13)).map((g) => {
            const righe: any[] = [];
            for (const bt of barche) {
              const { bks, blk } = eventiGiorno(bt.id, g);
              if (fTipo !== "blocchi") for (const k of bks) righe.push({ tipo: "p", k, bt });
              if (fTipo !== "prenotazioni" && blk) righe.push({ tipo: "b", k: blk, bt });
            }
            if (righe.length === 0) return null;
            return (
              <div key={g} className="card p-4">
                <p className="text-sm font-bold">{aData(g).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p>
                <div className="mt-2 grid gap-2">
                  {righe.map((r) => (
                    <button key={r.tipo + r.k.id} onClick={() => (r.tipo === "p" ? apriPrenotazione(r.k.id) : apriBlocco(r.k.id))} className={"flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm " + (r.tipo === "p" ? coloreEvento(r.k) : "border-[#f6c9be] bg-[#fdeeea] text-coral")}>
                      <span>{r.tipo === "p" ? `${oreDi(r.k.startAt)}${piuGiorni(r.k) ? ` ${fineBreve(r.k.startAt)}` : ""}–${piuGiorni(r.k) ? `${fineBreve(r.k.endAt)} ` : ""}${oreDi(r.k.endAt)} · ${r.bt.nome} · ${r.k.clienteNome ?? ""}` : `Blocco · ${r.bt.nome}${r.k.motivo ? ` · ${r.k.motivo}` : ""}`}</span>
                      <span className="text-xs">{r.tipo === "p" ? (r.k.origineCanale === "naboat" ? "NaBoat" : "Diretta") : "blocco"}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
          {data && barche.length === 0 && <p className="text-sm text-muted">Nessun evento in questo intervallo.</p>}
        </div>
      )}

      {/* SCHEDA LATERALE */}
      {sel && (
        <div className="fixed inset-0 z-50 bg-black/40" onClick={() => setSel(null)}>
          <div className="absolute right-0 top-0 flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                {sel.modo === "nuovo" && <><p className="text-xs font-semibold uppercase tracking-widest text-ocean">Nuovo</p><h2 className="text-xl">{barcaDi(sel.boatId)?.nome}</h2><p className="text-sm text-muted">{aData(sel.giorno).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p></>}
                {sel.modo === "prenotazione" && prenSel && <><p className="text-xs font-semibold uppercase tracking-widest text-ocean">{codice(prenSel)}</p><h2 className="text-xl">{barcaDi(prenSel.boatId)?.nome}</h2><p className="text-sm text-muted">{aData(giornoDi(prenSel.startAt)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p></>}
                {sel.modo === "blocco" && blkSel && <><p className="text-xs font-semibold uppercase tracking-widest text-coral">Blocco</p><h2 className="text-xl">{barcaDi(blkSel.boatId)?.nome}</h2><p className="text-sm text-muted">{aData(giornoDi(blkSel.startAt)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}</p></>}
              </div>
              <button className="grid h-9 w-9 place-items-center rounded-full bg-[#faf6f2] text-muted" aria-label="Chiudi" onClick={() => setSel(null)}><Icona nome="chiudi" className="h-4 w-4" /></button>
            </div>

            {err && <Avviso tono="errore" className="mt-4">{err}</Avviso>}
            {msg && <Avviso tono="ok" className="mt-4">{msg}</Avviso>}
            {conflitto && (
              <div className="mt-4 rounded-2xl border border-gold/50 bg-[#fff7e6] p-3 text-sm">
                <p className="font-semibold text-[#9a6406]">Questa prenotazione è stata modificata da un altro utente: ricarica per vedere le novità.</p>
                <button className="btn-soft mt-2" disabled={busy} onClick={ricaricaDopoConflitto}>Ricarica i dati (la bozza resta)</button>
              </div>
            )}

            {/* NUOVO */}
            {sel.modo === "nuovo" && (
              <div className="mt-4 grid gap-3">
                <div className="flex gap-2">
                  <button className={"flex-1 rounded-full px-3 py-2 text-sm font-bold " + (sez === "crea" ? "bg-ocean text-white" : "border border-line text-ocean")} onClick={() => setSez("crea")}>Nuova prenotazione</button>
                  <button className={"flex-1 rounded-full px-3 py-2 text-sm font-bold " + (sez === "blocca" ? "bg-deep text-white" : "border border-line text-ocean")} onClick={() => setSez("blocca")}>Rendi non disponibile</button>
                </div>
                {sez === "crea" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-sm">Data partenza<input className="rounded-2xl border border-line p-3" type="date" value={crea.inizioData} onChange={(e) => setCrea({ ...crea, inizioData: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Ora partenza<input className="rounded-2xl border border-line p-3" type="time" value={crea.dalle} onChange={(e) => setCrea({ ...crea, dalle: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Data rientro<input className="rounded-2xl border border-line p-3" type="date" value={crea.fineData} onChange={(e) => setCrea({ ...crea, fineData: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Ora rientro<input className="rounded-2xl border border-line p-3" type="time" value={crea.alle} onChange={(e) => setCrea({ ...crea, alle: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Passeggeri<input className="rounded-2xl border border-line p-3" type="number" min={1} value={crea.passeggeri} onChange={(e) => setCrea({ ...crea, passeggeri: Number(e.target.value) })} /></label>
                    <label className="grid gap-1 text-sm">Formula<input className="rounded-2xl border border-line p-3" value={crea.formula} onChange={(e) => setCrea({ ...crea, formula: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Nome cliente *<input className="rounded-2xl border border-line p-3" value={crea.clienteNome} onChange={(e) => setCrea({ ...crea, clienteNome: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Telefono *<input className="rounded-2xl border border-line p-3" value={crea.telefono} onChange={(e) => setCrea({ ...crea, telefono: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Email<input className="rounded-2xl border border-line p-3" type="email" value={crea.email} onChange={(e) => setCrea({ ...crea, email: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Destinazione<input className="rounded-2xl border border-line p-3" value={crea.destinazione} onChange={(e) => setCrea({ ...crea, destinazione: e.target.value })} /></label>
                    <label className="grid gap-1 text-sm">Skipper<select className="rounded-2xl border border-line p-3" value={crea.skipperId} onChange={(e) => setCrea({ ...crea, skipperId: e.target.value })}><option value="">Nessuno</option>{skippers.map((s) => <option key={s.id} value={s.id}>{s.nome}</option>)}</select></label>
                    <label className="grid gap-1 text-sm">Prezzo €<input className="rounded-2xl border border-line p-3" value={crea.prezzoEuro} onChange={(e) => setCrea({ ...crea, prezzoEuro: e.target.value })} /></label>
                    {barcaDi(sel.boatId)?.patenteRichiesta ? (
                      <label className="flex items-center gap-2 rounded-2xl border border-gold/50 bg-[#fff7e6] p-3 text-sm font-semibold text-[#9a6406] sm:col-span-2"><input type="checkbox" checked={crea.patenteOk} onChange={(e) => setCrea({ ...crea, patenteOk: e.target.checked })} /> Il cliente ha la patente (o assegna uno skipper)</label>
                    ) : (
                      <p className="rounded-2xl border border-[#a9e0d0] bg-[#eafaf5] p-3 text-sm text-[#177469] sm:col-span-2">Patente non richiesta per questa barca.</p>
                    )}
                    <label className="grid gap-1 text-sm sm:col-span-2">Nota<input className="rounded-2xl border border-line p-3" value={crea.note} onChange={(e) => setCrea({ ...crea, note: e.target.value })} /></label>
                    <button className="btn-primary sm:col-span-2 disabled:opacity-50" disabled={busy || (!!barcaDi(sel.boatId)?.patenteRichiesta && !crea.patenteOk && !crea.skipperId)} onClick={creaPrenotazione}>{busy ? "Creo…" : "Crea prenotazione"}</button>
                  </div>
                ) : (
                  <div className="grid gap-2">
                    <input className="rounded-2xl border border-line p-3" placeholder="Motivo (es. manutenzione, uso privato…)" value={blocco.motivo} onChange={(e) => setBlocco({ motivo: e.target.value })} />
                    <button className="btn-primary" disabled={busy} onClick={creaBlocco}>{busy ? "Salvo…" : "Rendi non disponibile"}</button>
                  </div>
                )}
              </div>
            )}

            {/* PRENOTAZIONE */}
            {sel.modo === "prenotazione" && prenSel && (
              <div className="mt-4 grid gap-4">
                <div className="flex items-center gap-2">
                  {["Confermata", "In navigazione", "Completata"].map((s, i) => {
                    const step = prenSel.stato === "in_mare" ? 1 : prenSel.stato === "rientrata" ? 2 : 0;
                    return <span key={s} className={"flex-1 rounded-full px-2 py-1 text-center text-xs font-bold " + (i <= step ? "bg-ocean text-white" : "bg-[#faf6f2] text-muted")}>{s}</span>;
                  })}
                </div>
                <div className="rounded-2xl border border-[#a9e0d0] bg-[#eafaf5] p-4 text-sm">
                  <p className="text-lg font-extrabold">{prenSel.clienteNome ?? "cliente"}</p>
                  <p className="text-xs text-muted">{prenSel.telefono ?? "—"} · {prenSel.passeggeri} pax · {euro(prenSel.prezzoCent)}</p>
                  <p className="mt-1 text-xs text-muted">{oreDi(prenSel.startAt)}–{oreDi(prenSel.endAt)} · {prenSel.origineCanale === "naboat" ? "NaBoat" : "Diretta"} · contratto {prenSel.contrattoFirmatoAt ? "firmato" : "da firmare"} · cauzione {String(prenSel.cauzioneStato).replace("_", " ")}</p>
                  {prenSel.note && <p className="mt-1 text-xs">{prenSel.note}</p>}
                </div>

                <Link className="btn-soft w-full text-center" href={`/gestionale/prenotazioni/${prenSel.id}`}>Apri prenotazione →</Link>
                <div className="grid gap-2 sm:grid-cols-2">
                  <button className="rounded-2xl bg-[#25D366] px-4 py-3 font-bold text-white" onClick={() => whatsapp(prenSel, `Ciao ${prenSel.clienteNome ?? "cliente"}, ti ricordiamo l'uscita con ${me?.tenantNome ?? "l'azienda"} il ${aData(giornoDi(prenSel.startAt)).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} alle ${oreDi(prenSel.startAt)}. A presto!`)}>✆ WhatsApp</button>
                  <button className="btn-soft" onClick={() => contratto(prenSel)}>Contratto</button>
                </div>
                {linkContratto && <p className="break-all rounded-2xl bg-[#faf6f2] p-3 text-xs"><a className="font-bold text-ocean" href={linkContratto} target="_blank" rel="noreferrer">{linkContratto}</a></p>}
                {linkPagamento && <p className="break-all rounded-2xl bg-[#faf6f2] p-3 text-xs"><a className="font-bold text-ocean" href={linkPagamento} target="_blank" rel="noreferrer">{linkPagamento}</a></p>}

                {prenSel.stato === "prenotata" && (
                  <div className="rounded-2xl border border-line p-4">
                    <p className="font-bold text-ocean">Registra partenza</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <label className="grid gap-1 text-sm">Carburante %<input className="rounded-2xl border border-line p-3" type="number" min={0} max={100} value={partenza.carburante} onChange={(e) => setPartenza({ ...partenza, carburante: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Note<input className="rounded-2xl border border-line p-3" value={partenza.note} onChange={(e) => setPartenza({ ...partenza, note: e.target.value })} /></label>
                    </div>
                    <button className="btn-primary mt-2 flex w-full items-center justify-center gap-1.5" disabled={busy} onClick={() => partenzaOra(prenSel)}><Icona nome="barca" className="h-4 w-4" /> Barca partita</button>
                  </div>
                )}
                {prenSel.stato === "in_mare" && (
                  <div className="rounded-2xl border border-line p-4">
                    <p className="font-bold text-ocean">Registra rientro</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-3">
                      <label className="grid gap-1 text-sm">Carburante %<input className="rounded-2xl border border-line p-3" type="number" min={0} max={100} value={rientro.carburante} onChange={(e) => setRientro({ ...rientro, carburante: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Danni €<input className="rounded-2xl border border-line p-3" value={rientro.danni} onChange={(e) => setRientro({ ...rientro, danni: e.target.value })} /></label>
                      <label className="grid gap-1 text-sm">Note<input className="rounded-2xl border border-line p-3" value={rientro.note} onChange={(e) => setRientro({ ...rientro, note: e.target.value })} /></label>
                    </div>
                    <button className="btn-primary mt-2 flex w-full items-center justify-center gap-1.5" disabled={busy} onClick={() => rientroOra(prenSel)}><Icona nome="ancora" className="h-4 w-4" /> Barca rientrata</button>
                  </div>
                )}
                <button className="btn-soft" disabled={busy || !prenSel.prezzoCent} onClick={() => pagamento(prenSel)}>{prenSel.prezzoCent ? "Link pagamento" : "Imposta il prezzo per il pagamento"}</button>

                <div className="rounded-2xl border border-line p-4">
                  <p className="font-bold text-ocean">Modifica</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <select className="rounded-2xl border border-line p-3" value={mod.boatId} onChange={(e) => setMod({ ...mod, boatId: e.target.value })}>{(data?.boats ?? []).map((x) => <option key={x.id} value={x.id}>{x.nome}</option>)}</select>
                    <label className="grid gap-1 text-xs font-semibold text-deep">Data inizio<input className="rounded-2xl border border-line p-3 text-sm" type="date" value={mod.inizioData} onChange={(e) => setMod({ ...mod, inizioData: e.target.value })} /></label>
                    <label className="grid gap-1 text-xs font-semibold text-deep">Ora inizio<input className="rounded-2xl border border-line p-3 text-sm" type="time" value={mod.inizioOra} onChange={(e) => setMod({ ...mod, inizioOra: e.target.value })} /></label>
                    <label className="grid gap-1 text-xs font-semibold text-deep">Data fine<input className="rounded-2xl border border-line p-3 text-sm" type="date" value={mod.fineData} onChange={(e) => setMod({ ...mod, fineData: e.target.value })} /></label>
                    <label className="grid gap-1 text-xs font-semibold text-deep">Ora fine<input className="rounded-2xl border border-line p-3 text-sm" type="time" value={mod.fineOra} onChange={(e) => setMod({ ...mod, fineOra: e.target.value })} /></label>
                    <input className="rounded-2xl border border-line p-3" placeholder="Nome cliente" value={mod.clienteNome} onChange={(e) => setMod({ ...mod, clienteNome: e.target.value })} />
                    <input className="rounded-2xl border border-line p-3" placeholder="Telefono" value={mod.telefono} onChange={(e) => setMod({ ...mod, telefono: e.target.value })} />
                    <button className="btn-primary sm:col-span-2" disabled={busy} onClick={() => salvaMod(prenSel)}>Salva modifiche</button>
                  </div>
                </div>

                <button className="rounded-2xl border border-coral/40 px-4 py-3 font-bold text-coral" disabled={busy} onClick={() => annullaPren(prenSel.id)}>Annulla prenotazione</button>
              </div>
            )}

            {/* BLOCCO */}
            {sel.modo === "blocco" && blkSel && (
              <div className="mt-4 grid gap-4">
                <div className="rounded-2xl border border-[#f6c9be] bg-[#fdeeea] p-4 text-sm">
                  <p className="font-bold text-coral">Giornata non disponibile</p>
                  {blkSel.motivo && <p className="text-muted">Motivo: {blkSel.motivo}</p>}
                </div>
                <button className="btn-soft w-full" disabled={busy} onClick={() => rimuoviBlocco(blkSel.id)}>Rendi di nuovo libera</button>
              </div>
            )}
          </div>
        </div>
      )}
      {conferma.dialogo}
    </div>
  );
}
