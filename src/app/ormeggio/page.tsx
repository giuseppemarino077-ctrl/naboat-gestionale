"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";

type Stato = "in_sosta" | "da_fare" | "in_mare" | "bloccata";
type Perm = {
  id: string;
  boatId: string;
  boatNome: string;
  boatStato: string;
  proprietario: string | null;
  telefono: string | null;
  tipo: string;
  finePrevistaAt: string | null;
  colore: "verde" | "giallo" | "rosso";
  motivi: string[];
  statoGriglia: Stato;
  inMare: boolean;
  attivitaDaFare: number;
};
type Posto = { id: string; riga: number; colonna: number; codice: string; bloccato: boolean; permanenza: Perm | null };
type Area = { id: string; nome: string; righe: number; colonne: number; posti: Posto[] };
type Griglia = {
  aree: Area[];
  riepilogo: { totale: number; liberi: number; occupati: number; nonUsabili: number; daSistemare: number; bloccate: number };
};

const oggi = () => new Date().toISOString().slice(0, 10);
const lettera = (r: number) => String.fromCharCode(64 + r);
const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataBreve = (v: string | null) => (v ? new Date(v).toLocaleDateString("it-IT", { day: "numeric", month: "short" }) : "—");

// Colori di stato: restano quelli del portale (verde = a posto, ambra = da fare,
// arancio = in mare, corallo = bloccata). Forme e palette invariate.
const STILE: Record<Stato, string> = {
  in_sosta: "border-[#a9e0d0] bg-[#d8f3ea] text-[#177469]",
  da_fare: "border-[#f0d59a] bg-[#fff0cc] text-[#9a6406]",
  in_mare: "border-[#fdba74] bg-[#ffe8d5] text-deep",
  bloccata: "border-[#f6c9be] bg-[#fdeeea] text-coral",
};
const FILL: Record<Stato, string> = {
  in_sosta: "#177469",
  da_fare: "#b7791f",
  in_mare: "#c2410c",
  bloccata: "#e8755b",
};
const NOME_STATO: Record<Stato, string> = {
  in_sosta: "In sosta",
  da_fare: "Da fare",
  in_mare: "In mare: posto assegnato",
  bloccata: "Bloccata / manutenzione",
};

function SagomaBarca({ stato }: { stato: Stato }) {
  return (
    <svg viewBox="0 0 24 44" className="h-10 w-auto" aria-hidden>
      <path
        d="M12 1.5c5.2 6.3 8 14 8 22.2 0 8.6-3.6 15.8-8 18.8-4.4-3-8-10.2-8-18.8C4 15.5 6.8 7.8 12 1.5Z"
        fill={FILL[stato]}
      />
      <path
        d="M12 9c2.5 4.5 3.8 9.4 3.8 14.7 0 4.4-1.4 8.5-3.8 11.3-2.4-2.8-3.8-6.9-3.8-11.3C8.2 18.4 9.5 13.5 12 9Z"
        fill="#ffffff"
        opacity="0.35"
      />
    </svg>
  );
}

export default function OrmeggioPage() {
  const [griglia, setGriglia] = useState<Griglia | null>(null);
  const [data, setData] = useState(oggi());
  const [ricerca, setRicerca] = useState("");
  const [areaId, setAreaId] = useState("");
  const [vista, setVista] = useState<"griglia" | "elenco">("griglia");
  const [configura, setConfigura] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [postoScelto, setPostoScelto] = useState<Posto | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [dettaglio, setDettaglio] = useState<any>(null);
  const [tab, setTab] = useState<"scheda" | "attivita" | "conto">("scheda");
  const [move, setMove] = useState({ aperto: false, postoId: "", decorrenza: "" });
  const [vedeImporti, setVedeImporti] = useState(true);
  const [proprietari, setProprietari] = useState<any[]>([]);
  const [barche, setBarche] = useState<any[]>([]);
  const [nuovaArea, setNuovaArea] = useState({ nome: "", righe: 4, colonne: 6 });
  const [form, setForm] = useState({
    propMode: "esistente", proprietarioId: "", propNome: "", propTelefono: "",
    barcaMode: "esistente", boatId: "", barcaNome: "", barcaTipo: "",
    tipo: "ormeggio_custodia", corrispettivoEuro: "", inizioAt: oggi(), finePrevistaAt: "", note: "",
  });

  const carica = async () => {
    const r = await fetch(`/api/v1/ormeggio/griglia?data=${data}`);
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setGriglia(j); setErr("");
  };
  useEffect(() => { carica(); }, [data]);
  // Un'altra postazione può assegnare/spostare una barca: ci si riallinea, ma non
  // mentre un modulo con una bozza è aperto (assegnazione o spostamento).
  useAggiornamenti(() => { if (postoScelto || move.aperto) return; return carica(); }, ["ormeggio"]);
  useEffect(() => {
    fetch("/api/v1/ormeggio/proprietari").then((r) => r.json()).then((j) => Array.isArray(j) && setProprietari(j)).catch(() => {});
    fetch("/api/v1/boats?uso=custodia").then((r) => r.json()).then((j) => Array.isArray(j) && setBarche(j)).catch(() => {});
    fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => { if (j?.user?.vedeImporti === false) setVedeImporti(false); }).catch(() => {});
  }, []);

  const chiama = async (url: string, method: string, body?: any) => {
    setErr(""); setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    await carica();
    segnalaCambiamento("ormeggio");
    return j;
  };

  const aree = griglia?.aree ?? [];
  const areaSelezionata: Area | undefined = aree.find((a) => a.id === areaId) ?? aree[0];
  useEffect(() => { if (!areaId && aree[0]) setAreaId(aree[0].id); }, [griglia]);

  const tuttiPosti = useMemo(() => aree.flatMap((a) => a.posti.map((p) => ({ ...p, areaNome: a.nome }))), [aree]);
  const sel: Perm | null = useMemo(() => tuttiPosti.find((p) => p.permanenza?.id === selId)?.permanenza ?? null, [tuttiPosti, selId]);

  useEffect(() => {
    if (!selId) { setDettaglio(null); return; }
    let vivo = true;
    fetch(`/api/v1/ormeggio/permanenze/${selId}`).then((r) => r.json()).then((j) => vivo && setDettaglio(j)).catch(() => {});
    return () => { vivo = false; };
  }, [selId]);
  useEffect(() => { if (selId && dettaglio?.id !== selId) setDettaglio(null); }, [selId]);

  const q = ricerca.trim().toLowerCase();
  const corrisponde = (posto: Posto) =>
    !q || posto.codice.toLowerCase().includes(q) || (posto.permanenza?.boatNome ?? "").toLowerCase().includes(q) || (posto.permanenza?.proprietario ?? "").toLowerCase().includes(q);

  const toggleBlocco = (posto: Posto) => chiama(`/api/v1/ormeggio/posti/${posto.id}`, "PATCH", { bloccato: !posto.bloccato }).then(() => setMsg(posto.bloccato ? "Posto riabilitato." : "Posto segnato come non utilizzabile."));

  const creaArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const j = await chiama("/api/v1/ormeggio/aree", "POST", { nome: nuovaArea.nome, righe: Number(nuovaArea.righe), colonne: Number(nuovaArea.colonne) });
    if (j) { setMsg("Area creata."); setNuovaArea({ nome: "", righe: 4, colonne: 6 }); }
  };

  const assegna = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postoScelto) return;
    const body: any = {
      postoId: postoScelto.id, tipo: form.tipo, inizioAt: form.inizioAt, finePrevistaAt: form.finePrevistaAt || null,
      corrispettivoCent: form.corrispettivoEuro ? Math.round(Number(form.corrispettivoEuro.replace(",", ".")) * 100) : null,
      note: form.note || null,
    };
    if (form.propMode === "esistente") body.proprietarioId = form.proprietarioId;
    else body.nuovoProprietario = { nome: form.propNome, telefono: form.propTelefono || null };
    if (form.barcaMode === "esistente") body.boatId = form.boatId;
    else body.nuovaBarca = { nome: form.barcaNome, tipo: form.barcaTipo || null };
    const r = await fetch("/api/v1/ormeggio/permanenze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setMsg(`Barca assegnata al posto ${postoScelto.codice}.`);
    setPostoScelto(null);
    carica();
    segnalaCambiamento("ormeggio");
  };

  const sposta = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sel || !move.postoId) return;
    const body: any = { azione: "sposta", postoId: move.postoId };
    if (move.decorrenza) body.decorrenza = new Date(move.decorrenza).toISOString();
    const j = await chiama(`/api/v1/ormeggio/permanenze/${sel.id}`, "PATCH", body);
    if (j) { setMsg("Barca spostata."); setMove({ aperto: false, postoId: "", decorrenza: "" }); }
  };

  const r = griglia?.riepilogo;

  const corpoPannello = sel ? (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Posto selezionato</p>
          <h2 className="truncate text-xl">{sel.boatNome}</h2>
          <p className="truncate text-sm text-muted">{sel.proprietario ?? "Proprietario non indicato"}</p>
          <p className="mt-1 text-xs text-muted">
            {sel.inMare ? "In mare" : "Presente"}
            {sel.attivitaDaFare > 0 ? ` · ${sel.attivitaDaFare} attività da fare` : ""}
          </p>
        </div>
        <button onClick={() => setSelId(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#faf6f2] text-muted" title="Chiudi">✕</button>
      </div>

      <div className="mt-3 inline-flex w-fit rounded-full border border-line bg-white p-1">
        {(["scheda", "attivita", "conto"] as const).filter((t) => t !== "conto" || vedeImporti).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={"rounded-full px-3 py-1.5 text-xs font-bold capitalize " + (tab === t ? "bg-ocean text-white" : "text-ocean")}>
            {t === "attivita" ? "Attività" : t === "conto" ? "Conto" : "Scheda"}
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-2 text-sm">
        {tab === "scheda" && (
          <div className="grid gap-2">
            <div className="card-soft p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Permanenza</p>
              <p className="mt-1 font-semibold">{dettaglio ? `${dataBreve(dettaglio.inizioAt)} – ${dettaglio.finePrevistaAt ? dataBreve(dettaglio.finePrevistaAt) : "indeterminata"}` : "…"}</p>
              <p className="text-xs text-muted">{sel.tipo === "rimessaggio_custodia" ? "Rimessaggio (a terra)" : "Ormeggio (in acqua)"}</p>
            </div>
            <div className="card-soft p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">Contratto e pagamento</p>
              <p className="mt-1">{dettaglio?.contratto?.firmatoAt ? "Contratto firmato" : "Contratto da firmare"}</p>
              <p className="text-xs text-muted">{dettaglio ? `Residuo ${euro(dettaglio.conto?.residuoCent ?? 0)}` : "…"}</p>
            </div>
            {sel.telefono && <a className="btn-soft" href={`https://wa.me/${sel.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp al proprietario</a>}
          </div>
        )}

        {tab === "attivita" && (
          <div className="grid gap-1.5">
            {(dettaglio?.attivita ?? []).length === 0 && <p className="text-muted">Nessuna attività registrata.</p>}
            {(dettaglio?.attivita ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2">
                <span className="min-w-0 truncate">{a.tipo}{a.quantita ? ` · ${a.quantita}${a.unita ? " " + a.unita : ""}` : ""}</span>
                <span className={"shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold " + (a.stato === "completato" ? "bg-[#d8f3ea] text-[#177469]" : a.stato === "in_corso" ? "bg-[#ffe8d5] text-deep" : "bg-[#fff0cc] text-[#9a6406]")}>
                  {a.stato === "completato" ? "Completato" : a.stato === "in_corso" ? "In corso" : "Da fare"}
                </span>
              </div>
            ))}
          </div>
        )}

        {tab === "conto" && (
          <div className="grid gap-1.5">
            {(dettaglio?.addebiti ?? []).map((a: any) => (
              <div key={a.id} className="flex items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2">
                <span className="min-w-0 truncate">{a.descrizione}</span>
                <span className="shrink-0 font-semibold">{euro(a.importoCent)}</span>
              </div>
            ))}
            {(dettaglio?.payments ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2 rounded-2xl border border-dashed border-line px-3 py-2 text-muted">
                <span className="min-w-0 truncate">Incasso {p.stato === "pagato" ? "" : "(in attesa)"}</span>
                <span className="shrink-0 font-semibold">{euro(p.totaleCent)}</span>
              </div>
            ))}
            {dettaglio && (
              <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-2xl bg-[#faf6f2] p-2"><p className="text-muted">Addebitato</p><p className="font-bold">{euro(dettaglio.conto?.totaleAddebitiCent ?? 0)}</p></div>
                <div className="rounded-2xl bg-[#faf6f2] p-2"><p className="text-muted">Pagato</p><p className="font-bold">{euro(dettaglio.conto?.incassatoCent ?? 0)}</p></div>
                <div className="rounded-2xl bg-[#faf6f2] p-2"><p className="text-muted">Residuo</p><p className="font-bold">{euro(dettaglio.conto?.residuoCent ?? 0)}</p></div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-3 grid gap-2">
        {move.aperto ? (
          <form onSubmit={sposta} className="grid gap-2 rounded-2xl border border-line p-3">
            <p className="text-xs font-bold">Sposta barca</p>
            <select className="rounded-2xl border border-line p-2.5" value={move.postoId} onChange={(e) => setMove({ ...move, postoId: e.target.value })} required>
              <option value="">Nuovo posto…</option>
              {tuttiPosti.filter((p) => !p.bloccato && p.permanenza?.id !== sel.id).map((p) => (
                <option key={p.id} value={p.id}>{p.codice} · {p.areaNome}</option>
              ))}
            </select>
            <label className="grid gap-1 text-xs text-muted"><span>Decorrenza dello spostamento</span>
              <input type="datetime-local" className="rounded-2xl border border-line p-2.5" value={move.decorrenza} onChange={(e) => setMove({ ...move, decorrenza: e.target.value })} />
            </label>
            <div className="flex gap-2">
              <button className="btn-primary flex-1" type="submit">Conferma spostamento</button>
              <button type="button" className="btn-soft" onClick={() => setMove({ aperto: false, postoId: "", decorrenza: "" })}>Annulla</button>
            </div>
          </form>
        ) : (
          <button className="btn-soft" onClick={() => setMove({ aperto: true, postoId: "", decorrenza: "" })}>⇄ Sposta barca</button>
        )}
        <Link className="btn-primary" href={`/ormeggio/permanenza/${sel.id}`}>＋ Aggiungi servizio / apri scheda</Link>
      </div>
    </>
  ) : null;

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="rounded-2xl border border-[#bfe6dc] bg-[#eafaf5] p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {/* Intestazione */}
      <div className="rounded-3xl bg-gradient-to-br from-ocean to-sea px-6 py-6 text-white shadow-[0_18px_40px_-18px_rgba(194,65,12,0.75)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/75">Ormeggio</p>
        <h1 className="mt-1 text-3xl">Griglia dei posti</h1>
        <p className="mt-1 text-sm text-white/85">Lettere sulle righe, numeri sulle colonne: il posto si legge come A1. Le sagome mostrano le barche nelle celle.</p>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {[
            { n: "Posti", v: r?.totale }, { n: "Occupati", v: r?.occupati }, { n: "Liberi", v: r?.liberi },
            { n: "Da sistemare", v: r?.daSistemare }, { n: "Bloccate", v: r?.bloccate },
          ].map((k) => (
            <div key={k.n} className="rounded-2xl bg-white/10 px-3 py-2"><p className="text-[10px] uppercase tracking-widest text-white/60">{k.n}</p><p className="font-display text-2xl">{k.v ?? "–"}</p></div>
          ))}
        </div>
      </div>

      {/* Schede interne */}
      <div className="inline-flex w-fit flex-wrap rounded-full border border-line bg-white p-1 shadow-sm">
        <span className="rounded-full bg-ocean px-4 py-2 text-sm font-bold text-white">Griglia</span>
        <Link className="rounded-full px-4 py-2 text-sm font-bold text-ocean hover:bg-foam" href="/ormeggio/da-fare">Da fare</Link>
        <Link className="rounded-full px-4 py-2 text-sm font-bold text-ocean hover:bg-foam" href="/ormeggio/movimenti">Movimenti</Link>
        <Link className="rounded-full px-4 py-2 text-sm font-bold text-ocean hover:bg-foam" href="/ormeggio/conti">Conti</Link>
        <Link className="rounded-full px-4 py-2 text-sm font-bold text-ocean hover:bg-foam" href="/ormeggio/configurazione">Configurazione</Link>
      </div>

      {/* Barra strumenti */}
      <div className="flex flex-wrap items-center gap-3">
        <input type="date" className="rounded-full border border-line bg-white p-2.5 text-sm" value={data} onChange={(e) => setData(e.target.value)} />
        {aree.length > 0 && (
          <select className="rounded-full border border-line bg-white p-2.5 text-sm" value={areaSelezionata?.id ?? ""} onChange={(e) => setAreaId(e.target.value)}>
            {aree.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
          </select>
        )}
        <input className="min-w-[180px] flex-1 rounded-full border border-line bg-white p-2.5 text-sm" placeholder="Cerca barca, proprietario o coordinata" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        <div className="inline-flex rounded-full border border-line bg-white p-1">
          <button className={"rounded-full px-3 py-1.5 text-sm font-bold " + (vista === "griglia" ? "bg-ocean text-white" : "text-ocean")} onClick={() => setVista("griglia")}>Griglia</button>
          <button className={"rounded-full px-3 py-1.5 text-sm font-bold " + (vista === "elenco" ? "bg-ocean text-white" : "text-ocean")} onClick={() => setVista("elenco")}>Elenco</button>
        </div>
        <button className={"rounded-full px-4 py-2.5 text-sm font-bold " + (configura ? "bg-deep text-white" : "border border-line bg-white text-ocean")} onClick={() => setConfigura(!configura)}>⚙ {configura ? "Fine configurazione" : "Configura"}</button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#d8f3ea] ring-1 ring-[#a9e0d0]" /> In sosta</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fff0cc] ring-1 ring-[#f0d59a]" /> Da fare</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#ffe8d5] ring-1 ring-[#fdba74]" /> In mare: posto assegnato</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fdeeea] ring-1 ring-[#f6c9be]" /> Bloccata</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-white ring-1 ring-line" /> libero</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#efe9e3] ring-1 ring-line" /> non utilizzabile</span>
      </div>

      {configura && (
        <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={creaArea}>
          <p className="text-sm text-muted md:col-span-12">In configurazione, clicca un posto per attivarlo/disattivarlo. Qui crei nuove aree.</p>
          <label className="grid gap-1 text-sm md:col-span-5"><span className="text-xs font-semibold text-muted">Nome area *</span>
            <input className="rounded-2xl border border-line p-3" placeholder="es. Area ormeggio / Piazzale" value={nuovaArea.nome} onChange={(e) => setNuovaArea({ ...nuovaArea, nome: e.target.value })} required />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2"><span className="text-xs font-semibold text-muted">Boe (righe)</span>
            <input className="rounded-2xl border border-line p-3" type="number" min={1} max={40} value={nuovaArea.righe} onChange={(e) => setNuovaArea({ ...nuovaArea, righe: Number(e.target.value) })} />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2"><span className="text-xs font-semibold text-muted">Colonne</span>
            <input className="rounded-2xl border border-line p-3" type="number" min={1} max={40} value={nuovaArea.colonne} onChange={(e) => setNuovaArea({ ...nuovaArea, colonne: Number(e.target.value) })} />
          </label>
          <div className="md:col-span-3"><button className="btn-primary w-full" type="submit">＋ Crea area</button></div>
        </form>
      )}

      <div className="flex gap-4">
        <div className="min-w-0 flex-1 grid gap-4">
          {/* VISTA ELENCO */}
          {vista === "elenco" && areaSelezionata && (
            <section className="card overflow-x-auto p-4 md:p-5">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-muted">
                  <tr><th className="p-2">Posto</th><th className="p-2">Barca</th><th className="p-2">Proprietario</th><th className="p-2">Stato</th><th className="p-2">Attività</th></tr>
                </thead>
                <tbody>
                  {areaSelezionata.posti.filter(corrisponde).map((p) => (
                    <tr key={p.id} className="border-t border-line">
                      <td className="p-2 font-semibold">{p.codice}</td>
                      <td className="p-2">{p.permanenza?.boatNome ?? <span className="text-muted">libero</span>}</td>
                      <td className="p-2 text-muted">{p.permanenza?.proprietario ?? "—"}</td>
                      <td className="p-2">
                        {p.bloccato ? <span className="text-muted">non utilizzabile</span> : p.permanenza ? (
                          <button onClick={() => setSelId(p.permanenza!.id)} className={"rounded-full border px-2 py-0.5 text-[11px] font-semibold " + STILE[p.permanenza.statoGriglia]}>{NOME_STATO[p.permanenza.statoGriglia]}</button>
                        ) : <span className="text-muted">libero</span>}
                      </td>
                      <td className="p-2 text-muted">{p.permanenza ? `${p.permanenza.attivitaDaFare} da fare` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          {/* VISTA GRIGLIA */}
          {vista === "griglia" && areaSelezionata && (() => {
            const area = areaSelezionata;
            const map = new Map(area.posti.map((p) => [`${p.riga}:${p.colonna}`, p]));
            const boe = Array.from({ length: area.righe }, (_, i) => i + 1);
            const colonne = Array.from({ length: area.colonne }, (_, i) => i + 1);
            return (
              <section className="card p-4 md:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-xl">{area.nome}</h2>
                  <div className="flex items-center gap-3 text-xs text-muted">
                    <span>{area.colonne} colonne × {area.righe} boe</span>
                    {configura && (
                      <button className="font-bold text-coral" onClick={() => confirm(`Eliminare l'area "${area.nome}"?`) && chiama(`/api/v1/ormeggio/aree/${area.id}`, "DELETE")}>Elimina area</button>
                    )}
                  </div>
                </div>
                <div className="overflow-x-auto pb-1">
                  <div className="inline-block min-w-full">
                    <div className="grid gap-1.5" style={{ gridTemplateColumns: `52px repeat(${area.colonne}, minmax(92px, 1fr))` }}>
                      <div />
                      {colonne.map((c) => <div key={c} className="pb-1 text-center text-xs font-semibold text-muted">{c}</div>)}
                      {boe.map((bo) => (
                        <div key={bo} className="contents">
                          <div className="flex items-center justify-center">
                            <span className="grid h-8 w-8 place-items-center rounded-full bg-deep text-xs font-bold text-white">{lettera(bo)}</span>
                          </div>
                          {colonne.map((c) => {
                            const posto = map.get(`${bo}:${c}`);
                            if (!posto) return <span key={`${bo}:${c}`} className="h-[84px] rounded-2xl border border-dashed border-line" />;
                            const visibile = corrisponde(posto);
                            const base = "relative grid h-[84px] place-items-center rounded-2xl border p-1 text-center text-[10px] transition " + (visibile ? "" : "opacity-30 ");

                            if (posto.bloccato) {
                              return <button key={posto.id} onClick={() => configura && toggleBlocco(posto)} title={configura ? "Clicca per riabilitare" : "Posto non utilizzabile"} className={base + "cursor-default border-dashed border-line bg-[#efe9e3] text-muted"}><b className="absolute left-1 top-0.5 text-[10px]">{posto.codice}</b><span>non usabile</span></button>;
                            }
                            if (posto.permanenza) {
                              const p = posto.permanenza;
                              if (configura) return <button key={posto.id} onClick={() => toggleBlocco(posto)} title="In configurazione: clicca per disattivare il posto" className={base + STILE[p.statoGriglia]}><b className="absolute left-1 top-0.5 text-[10px]">{posto.codice}</b><SagomaBarca stato={p.statoGriglia} /></button>;
                              return (
                                <button key={posto.id} onClick={() => { setSelId(p.id); setTab("scheda"); setMove({ aperto: false, postoId: "", decorrenza: "" }); }} title={p.motivi.join(" · ") || NOME_STATO[p.statoGriglia]} className={base + STILE[p.statoGriglia] + " hover:brightness-105"}>
                                  <b className="absolute left-1 top-0.5 text-[10px]">{posto.codice}</b>
                                  <SagomaBarca stato={p.statoGriglia} />
                                  <span className="absolute bottom-0.5 left-0.5 right-0.5 truncate font-semibold">{p.boatNome}</span>
                                </button>
                              );
                            }
                            return (
                              <button key={posto.id} onClick={() => { if (!configura) { setPostoScelto(posto); setErr(""); setMsg(""); } }} className={base + "border-[#bfe6dc] bg-white text-muted " + (configura ? "cursor-default" : "hover:border-ocean hover:bg-foam")} title={configura ? "Posto libero" : `${posto.codice} · libero — clicca per assegnare`}>
                                <b className="absolute left-1 top-0.5 text-[10px]">{posto.codice}</b>
                                <span>{configura ? "libero" : "＋ libero"}</span>
                              </button>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </section>
            );
          })()}

          {griglia && griglia.aree.length === 0 && (
            <div className="card grid place-items-center gap-2 p-8 text-center">
              <p className="font-semibold">Nessuna area configurata.</p>
              <p className="text-sm text-muted">Attiva «Configura» e crea la prima area indicando quante boe e quante colonne.</p>
            </div>
          )}
        </div>

        {/* SCHEDA LATERALE (desktop/tablet) */}
        {sel && (
          <aside className="hidden w-[340px] shrink-0 self-start rounded-3xl border border-line bg-white p-4 shadow-sm md:block">
            {corpoPannello}
          </aside>
        )}
      </div>

      {/* SCHEDA A TUTTO SCHERMO (telefono) */}
      {sel && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-white p-4 md:hidden">
          {corpoPannello}
        </div>
      )}

      {postoScelto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPostoScelto(null)}>
          <form className="grid max-h-[90vh] w-full max-w-2xl gap-3 overflow-y-auto rounded-3xl bg-white p-6 text-sm shadow-2xl" onClick={(e) => e.stopPropagation()} onSubmit={assegna}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg">Assegna il posto {postoScelto.codice}</h2>
              <button type="button" className="grid h-9 w-9 place-items-center rounded-full bg-[#faf6f2] text-muted" onClick={() => setPostoScelto(null)}>✕</button>
            </div>
            <fieldset className="grid gap-2 rounded-2xl border border-line p-3">
              <legend className="px-1 text-xs font-bold text-muted">Proprietario</legend>
              <div className="flex gap-3">
                <label className="flex items-center gap-2"><input type="radio" checked={form.propMode === "esistente"} onChange={() => setForm({ ...form, propMode: "esistente" })} /> Già in anagrafica</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.propMode === "nuovo"} onChange={() => setForm({ ...form, propMode: "nuovo" })} /> Nuovo</label>
              </div>
              {form.propMode === "esistente" ? (
                <select className="rounded-2xl border border-line p-3" value={form.proprietarioId} onChange={(e) => setForm({ ...form, proprietarioId: e.target.value })} required>
                  <option value="">Scegli il proprietario…</option>
                  {proprietari.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.telefono ? ` · ${p.telefono}` : ""}</option>)}
                </select>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="rounded-2xl border border-line p-3" placeholder="Nome o denominazione *" value={form.propNome} onChange={(e) => setForm({ ...form, propNome: e.target.value })} required />
                  <input className="rounded-2xl border border-line p-3" placeholder="Telefono" value={form.propTelefono} onChange={(e) => setForm({ ...form, propTelefono: e.target.value })} />
                </div>
              )}
            </fieldset>
            <fieldset className="grid gap-2 rounded-2xl border border-line p-3">
              <legend className="px-1 text-xs font-bold text-muted">Barca</legend>
              <div className="flex gap-3">
                <label className="flex items-center gap-2"><input type="radio" checked={form.barcaMode === "esistente"} onChange={() => setForm({ ...form, barcaMode: "esistente" })} /> Già in elenco</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.barcaMode === "nuovo"} onChange={() => setForm({ ...form, barcaMode: "nuovo" })} /> Nuova</label>
              </div>
              {form.barcaMode === "esistente" ? (
                <select className="rounded-2xl border border-line p-3" value={form.boatId} onChange={(e) => setForm({ ...form, boatId: e.target.value })} required>
                  <option value="">Scegli la barca…</option>
                  {barche.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="rounded-2xl border border-line p-3" placeholder="Nome barca *" value={form.barcaNome} onChange={(e) => setForm({ ...form, barcaNome: e.target.value })} required />
                  <input className="rounded-2xl border border-line p-3" placeholder="Tipo (gozzo, open…)" value={form.barcaTipo} onChange={(e) => setForm({ ...form, barcaTipo: e.target.value })} />
                </div>
              )}
            </fieldset>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Tipo di sosta</span>
                <select className="rounded-2xl border border-line p-3" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option value="ormeggio_custodia">Ormeggio (in acqua, con custodia)</option>
                  <option value="rimessaggio_custodia">Rimessaggio (a terra, con custodia)</option>
                </select>
              </label>
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Corrispettivo concordato (€)</span>
                <input className="rounded-2xl border border-line p-3" placeholder="es. 200,00" value={form.corrispettivoEuro} onChange={(e) => setForm({ ...form, corrispettivoEuro: e.target.value })} />
              </label>
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Inizio</span>
                <input type="date" className="rounded-2xl border border-line p-3" value={form.inizioAt} onChange={(e) => setForm({ ...form, inizioAt: e.target.value })} required />
              </label>
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Fine prevista (facoltativa)</span>
                <input type="date" className="rounded-2xl border border-line p-3" value={form.finePrevistaAt} onChange={(e) => setForm({ ...form, finePrevistaAt: e.target.value })} />
              </label>
            </div>
            <input className="rounded-2xl border border-line p-3" placeholder="Note (facoltative)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            <div className="flex items-center gap-3">
              <button className="btn-primary" type="submit">＋ Registra la sosta</button>
              {form.corrispettivoEuro && <span className="text-muted">Addebito custodia: <b>{euro(Math.round(Number(form.corrispettivoEuro.replace(",", ".")) * 100))}</b></span>}
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
