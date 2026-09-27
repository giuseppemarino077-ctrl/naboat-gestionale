"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Perm = {
  id: string;
  boatNome: string;
  proprietario: string | null;
  telefono: string | null;
  tipo: string;
  finePrevistaAt: string | null;
  colore: "verde" | "giallo" | "rosso";
  motivi: string[];
};
type Posto = { id: string; riga: number; colonna: number; codice: string; bloccato: boolean; permanenza: Perm | null };
type Area = { id: string; nome: string; righe: number; colonne: number; posti: Posto[] };
type Griglia = { aree: Area[]; riepilogo: { totale: number; liberi: number; occupati: number; nonUsabili: number; daSistemare: number; bloccate: number } };

const oggi = () => new Date().toISOString().slice(0, 10);
const lettera = (r: number) => String.fromCharCode(64 + r);
const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

const CELLA: Record<string, string> = {
  verde: "border-[#a9e0d0] bg-[#d8f3ea] text-[#177469]",
  giallo: "border-[#f0d59a] bg-[#fff0cc] text-[#9a6406]",
  rosso: "border-[#f6c9be] bg-[#fdeeea] text-coral",
};

export default function OrmeggioPage() {
  const [griglia, setGriglia] = useState<Griglia | null>(null);
  const [data, setData] = useState(oggi());
  const [ricerca, setRicerca] = useState("");
  const [configura, setConfigura] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [postoScelto, setPostoScelto] = useState<Posto | null>(null);
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
  useEffect(() => {
    fetch("/api/v1/ormeggio/proprietari").then((r) => r.json()).then((j) => Array.isArray(j) && setProprietari(j)).catch(() => {});
    fetch("/api/v1/boats?uso=custodia").then((r) => r.json()).then((j) => Array.isArray(j) && setBarche(j)).catch(() => {});
  }, []);

  const chiama = async (url: string, method: string, body?: any) => {
    setErr(""); setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    await carica();
    return j;
  };

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
  };

  const r = griglia?.riepilogo;
  const areeVisibili = griglia?.aree ?? [];

  return (
    <div className="grid gap-5">
      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="rounded-2xl border border-[#bfe6dc] bg-[#eafaf5] p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {/* Intestazione */}
      <div className="rounded-3xl bg-gradient-to-br from-ocean to-sea px-6 py-6 text-white shadow-[0_18px_40px_-18px_rgba(194,65,12,0.75)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/75">Ormeggio</p>
        <h1 className="mt-1 text-3xl">Posti e imbarcazioni</h1>
        <p className="mt-1 text-sm text-white/85">Righe = boe (A, B, C…), colonne numerate. Il posto si legge come A1.</p>
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
        <input className="min-w-[180px] flex-1 rounded-full border border-line bg-white p-2.5 text-sm" placeholder="Cerca barca, proprietario o posto (es. A1)" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        <button className={"rounded-full px-4 py-2.5 text-sm font-bold " + (configura ? "bg-deep text-white" : "border border-line bg-white text-ocean")} onClick={() => setConfigura(!configura)}>⚙ {configura ? "Fine configurazione" : "Configura"}</button>
      </div>

      {/* Legenda */}
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#d8f3ea] ring-1 ring-[#a9e0d0]" /> pronta al 100%</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fff0cc] ring-1 ring-[#f0d59a]" /> qualcosa da sistemare</span>
        <span className="inline-flex items-center gap-1"><i className="h-3 w-3 rounded-full bg-[#fdeeea] ring-1 ring-[#f6c9be]" /> imbarcazione bloccata</span>
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

      {areeVisibili.map((area) => {
        const map = new Map(area.posti.map((p) => [`${p.riga}:${p.colonna}`, p]));
        const boe = Array.from({ length: area.righe }, (_, i) => i + 1);
        const colonne = Array.from({ length: area.colonne }, (_, i) => i + 1);
        return (
          <section key={area.id} className="card p-4 md:p-5">
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
                <div className="grid gap-1.5" style={{ gridTemplateColumns: `92px repeat(${area.colonne}, minmax(96px, 1fr))` }}>
                  <div />
                  {colonne.map((c) => <div key={c} className="pb-1 text-center text-xs font-semibold text-muted">{c}</div>)}
                  {boe.map((bo) => (
                    <div key={bo} className="contents">
                      <div className="flex items-center gap-2 py-1">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-deep text-xs font-bold text-white">⚓</span>
                        <span className="font-display text-sm font-bold">BOA {lettera(bo)}</span>
                      </div>
                      {colonne.map((c) => {
                        const posto = map.get(`${bo}:${c}`);
                        if (!posto) return <span key={`${bo}:${c}`} className="h-[74px] rounded-2xl border border-dashed border-line" />;
                        const visibile = !q || corrisponde(posto);
                        const base = "grid h-[74px] content-start rounded-2xl border p-2 text-left text-[11px] transition " + (visibile ? "" : "opacity-30 ");

                        if (posto.bloccato) {
                          return <button key={posto.id} onClick={() => configura && toggleBlocco(posto)} title={configura ? "Clicca per riabilitare" : "Posto non utilizzabile"} className={base + "cursor-default border-dashed border-line bg-[#efe9e3] text-muted"}><b className="text-xs">{posto.codice}</b><span className="mt-auto">non usabile</span></button>;
                        }
                        if (posto.permanenza) {
                          const p = posto.permanenza;
                          const contenuto = (
                            <>
                              <b className="text-xs">{posto.codice}</b>
                              <span className="mt-auto line-clamp-2 font-semibold">⛵ {p.boatNome}</span>
                              {p.motivi.length > 0 && <span className="line-clamp-1 text-[10px]">{p.motivi[0]}</span>}
                            </>
                          );
                          if (configura) return <button key={posto.id} onClick={() => toggleBlocco(posto)} className={base + CELLA[p.colore]} title="In configurazione: clicca per disattivare il posto">{contenuto}</button>;
                          return <Link key={posto.id} href={`/ormeggio/permanenza/${p.id}`} className={base + CELLA[p.colore] + " hover:brightness-105"} title={p.motivi.join(" · ") || "tutto a posto"}>{contenuto}</Link>;
                        }
                        return (
                          <button key={posto.id} onClick={() => { if (!configura) { setPostoScelto(posto); setErr(""); setMsg(""); } }} className={base + "border-[#bfe6dc] bg-white text-muted " + (configura ? "cursor-default" : "hover:border-ocean hover:bg-foam")} title={configura ? "Posto libero" : `${posto.codice} · libero — clicca per assegnare`}>
                            <b className="text-xs">{posto.codice}</b>
                            <span className="mt-auto">{configura ? "libero" : "＋ libero"}</span>
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
      })}

      {griglia && griglia.aree.length === 0 && (
        <div className="card grid place-items-center gap-2 p-8 text-center">
          <p className="font-semibold">Nessuna area configurata.</p>
          <p className="text-sm text-muted">Attiva «Configura» e crea la prima area indicando quante boe e quante colonne.</p>
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
