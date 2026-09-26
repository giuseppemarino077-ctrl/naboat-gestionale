"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

type Posto = { id: string; riga: number; colonna: number; codice: string; bloccato: boolean };
type Area = { id: string; nome: string; righe: number; colonne: number; posti: Posto[] };
type Proprietario = { id: string; nome: string; telefono?: string | null };
type Barca = { id: string; nome: string; proprietarioId?: string | null };
type Permanenza = {
  id: string;
  postoId: string;
  inizioAt: string;
  finePrevistaAt?: string | null;
  stato: string;
  boat?: { nome: string; proprietario?: { nome: string } | null };
  posto?: { codice: string };
};

const oggi = () => new Date().toISOString().slice(0, 10);
const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function OrmeggioPage() {
  const [aree, setAree] = useState<Area[]>([]);
  const [permanenze, setPermanenze] = useState<Permanenza[]>([]);
  const [proprietari, setProprietari] = useState<Proprietario[]>([]);
  const [barche, setBarche] = useState<Barca[]>([]);
  const [data, setData] = useState(oggi());
  const [ricerca, setRicerca] = useState("");
  const [vista, setVista] = useState<"griglia" | "elenco">("griglia");
  const [zoom, setZoom] = useState(1);
  const [postoScelto, setPostoScelto] = useState<Posto | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({
    propMode: "esistente",
    proprietarioId: "",
    propNome: "",
    propTelefono: "",
    barcaMode: "esistente",
    boatId: "",
    barcaNome: "",
    barcaTipo: "",
    inizioAt: oggi(),
    finePrevistaAt: "",
    corrispettivoEuro: "",
    tipo: "ormeggio_custodia",
    note: "",
  });

  const caricaAree = () => fetch("/api/v1/ormeggio/aree").then((r) => r.json()).then((j) => Array.isArray(j) && setAree(j)).catch(() => {});
  const caricaPerm = () => fetch(`/api/v1/ormeggio/permanenze?data=${data}`).then((r) => r.json()).then((j) => Array.isArray(j) && setPermanenze(j)).catch(() => {});

  useEffect(() => { caricaAree(); }, []);
  useEffect(() => { caricaPerm(); }, [data]);
  useEffect(() => {
    fetch("/api/v1/ormeggio/proprietari").then((r) => r.json()).then((j) => Array.isArray(j) && setProprietari(j)).catch(() => {});
    fetch("/api/v1/boats?uso=custodia").then((r) => r.json()).then((j) => Array.isArray(j) && setBarche(j)).catch(() => {});
  }, []);

  const perPosto = useMemo(() => {
    const m = new Map<string, Permanenza>();
    for (const p of permanenze) m.set(p.postoId, p);
    return m;
  }, [permanenze]);

  const q = ricerca.trim().toLowerCase();
  const corrisponde = (posto: Posto, perm?: Permanenza) =>
    !q || posto.codice.toLowerCase().includes(q) || (perm?.boat?.nome ?? "").toLowerCase().includes(q) || (perm?.boat?.proprietario?.nome ?? "").toLowerCase().includes(q);

  const assegna = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setMsg("");
    if (!postoScelto) return;
    const body: any = {
      postoId: postoScelto.id,
      tipo: form.tipo,
      inizioAt: form.inizioAt,
      finePrevistaAt: form.finePrevistaAt || null,
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
    caricaAree(); caricaPerm();
  };

  const totale = aree.reduce((n, a) => n + a.posti.length, 0);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Ormeggio</p>
          <h1 className="text-2xl">Griglia dei posti.</h1>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" href="/ormeggio/da-fare">Da fare</Link>
          <Link className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" href="/ormeggio/movimenti">Movimenti</Link>
          <Link className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" href="/ormeggio/conti">Conti</Link>
          <Link className="rounded-[7px] border border-line px-3 py-2 font-bold text-ocean" href="/ormeggio/configurazione">Configurazione</Link>
        </div>
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="card flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="grid gap-1">
          <span className="text-xs font-semibold text-muted">Data</span>
          <input type="date" className="rounded-md border border-line p-2" value={data} onChange={(e) => setData(e.target.value)} />
        </label>
        <label className="grid flex-1 gap-1 md:max-w-sm">
          <span className="text-xs font-semibold text-muted">Cerca barca, proprietario o posto</span>
          <input className="rounded-md border border-line p-2" placeholder="es. Aurora, Rossi o B3" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
        </label>
        <div className="flex gap-2">
          <button className={`rounded-full px-4 py-1.5 font-bold ${vista === "griglia" ? "bg-deep text-white" : "border border-line bg-white text-muted"}`} onClick={() => setVista("griglia")}>Griglia</button>
          <button className={`rounded-full px-4 py-1.5 font-bold ${vista === "elenco" ? "bg-deep text-white" : "border border-line bg-white text-muted"}`} onClick={() => setVista("elenco")}>Elenco</button>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <span className="text-muted">Zoom</span>
          <button className="rounded-md border border-line px-2 py-1 font-bold" title="Riduci" onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.1).toFixed(2)))}>A−</button>
          <button className="rounded-md border border-line px-2 py-1 font-bold" title="Ingrandisci" onClick={() => setZoom((z) => Math.min(1.6, +(z + 0.1).toFixed(2)))}>A＋</button>
        </div>
        <span className="ml-auto text-muted">{permanenze.length} barche · {totale} posti</span>
      </div>

      {vista === "elenco" ? (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted"><tr className="text-left">
              <th className="p-2">Posto</th><th className="p-2">Barca</th><th className="p-2">Proprietario</th><th className="p-2">Dal</th><th className="p-2">Al</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {permanenze.map((p) => (
                <tr key={p.id} className="border-t border-line">
                  <td className="p-2 font-bold">{p.posto?.codice}</td>
                  <td className="p-2">{p.boat?.nome}</td>
                  <td className="p-2 text-muted">{p.boat?.proprietario?.nome ?? "—"}</td>
                  <td className="p-2">{new Date(p.inizioAt).toLocaleDateString("it-IT")}</td>
                  <td className="p-2">{p.finePrevistaAt ? new Date(p.finePrevistaAt).toLocaleDateString("it-IT") : "indeterminata"}</td>
                  <td className="p-2"><Link className="font-bold text-ocean" href={`/ormeggio/permanenza/${p.id}`}>Apri scheda →</Link></td>
                </tr>
              ))}
              {permanenze.length === 0 && <tr><td className="p-3 text-muted" colSpan={6}>Nessuna barca in questa data.</td></tr>}
            </tbody>
          </table>
        </div>
      ) : (
        aree.map((area) => {
          const map = new Map(area.posti.map((p) => [`${p.riga}:${p.colonna}`, p]));
          const righe = Array.from({ length: area.righe }, (_, i) => i + 1);
          const colonne = Array.from({ length: area.colonne }, (_, i) => i + 1);
          return (
            <section key={area.id} className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg">{area.nome}</h2>
                <span className="text-xs text-muted">{area.colonne} colonne × {area.righe} righe</span>
              </div>
              <div className="overflow-x-auto">
                <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `repeat(${area.colonne}, minmax(78px, 1fr))`, zoom }}>
                  {righe.map((r) =>
                    colonne.map((c) => {
                      const posto = map.get(`${r}:${c}`);
                      if (!posto) return <span key={`${r}:${c}`} className="h-16 rounded border border-dashed border-line" />;
                      const perm = perPosto.get(posto.id);
                      const attivo = corrisponde(posto, perm);
                      if (posto.bloccato) {
                        return (
                          <span key={posto.id} className="grid h-16 place-items-start rounded border border-dashed border-line bg-[#f1ece7] p-1.5 text-[11px] text-muted" title="Posto non utilizzabile">
                            <b className="text-xs">{posto.codice}</b><span className="mt-auto">non usabile</span>
                          </span>
                        );
                      }
                      if (perm) {
                        return (
                          <Link key={posto.id} href={`/ormeggio/permanenza/${perm.id}`} className={`grid h-16 place-items-start rounded border p-1.5 text-left text-[11px] transition hover:brightness-105 ${attivo ? "border-ocean bg-foam" : "border-line bg-foam/40 opacity-40"}`} title={`${posto.codice} · ${perm.boat?.nome ?? ""}`}>
                            <b className="text-xs text-ocean">{posto.codice}</b>
                            <span className="mt-auto line-clamp-2 font-semibold text-ink">⚓ {perm.boat?.nome ?? "barca"}</span>
                          </Link>
                        );
                      }
                      return (
                        <button
                          key={posto.id}
                          onClick={() => { setPostoScelto(posto); setErr(""); setMsg(""); }}
                          className={`grid h-16 place-items-start rounded border border-line bg-white p-1.5 text-left text-[11px] text-muted hover:border-ocean hover:bg-foam ${attivo ? "" : "opacity-40"}`}
                          title={`${posto.codice} · libero — clicca per assegnare`}
                        >
                          <b className="text-xs text-muted">{posto.codice}</b>
                          <span className="mt-auto">＋ libero</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          );
        })
      )}

      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-ocean bg-foam" /> barca presente</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-line bg-white" /> libero (clicca per assegnare)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded border border-dashed border-line bg-[#f1ece7]" /> non utilizzabile</span>
      </div>

      {postoScelto && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setPostoScelto(null)}>
          <form className="card grid max-h-[90vh] w-full max-w-2xl gap-3 overflow-y-auto p-5 text-sm" onClick={(e) => e.stopPropagation()} onSubmit={assegna}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg">Assegna il posto {postoScelto.codice}</h2>
              <button type="button" className="font-bold text-coral" onClick={() => setPostoScelto(null)}>Chiudi ✕</button>
            </div>

            <fieldset className="grid gap-2 rounded-md border border-line p-3">
              <legend className="px-1 text-xs font-bold text-muted">Proprietario</legend>
              <div className="flex gap-3">
                <label className="flex items-center gap-2"><input type="radio" checked={form.propMode === "esistente"} onChange={() => setForm({ ...form, propMode: "esistente" })} /> Già in anagrafica</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.propMode === "nuovo"} onChange={() => setForm({ ...form, propMode: "nuovo" })} /> Nuovo</label>
              </div>
              {form.propMode === "esistente" ? (
                <select className="rounded-md border border-line p-2" value={form.proprietarioId} onChange={(e) => setForm({ ...form, proprietarioId: e.target.value })} required>
                  <option value="">Scegli il proprietario…</option>
                  {proprietari.map((p) => <option key={p.id} value={p.id}>{p.nome}{p.telefono ? ` · ${p.telefono}` : ""}</option>)}
                </select>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="rounded-md border border-line p-2" placeholder="Nome o denominazione *" value={form.propNome} onChange={(e) => setForm({ ...form, propNome: e.target.value })} required />
                  <input className="rounded-md border border-line p-2" placeholder="Telefono" value={form.propTelefono} onChange={(e) => setForm({ ...form, propTelefono: e.target.value })} />
                </div>
              )}
            </fieldset>

            <fieldset className="grid gap-2 rounded-md border border-line p-3">
              <legend className="px-1 text-xs font-bold text-muted">Barca</legend>
              <div className="flex gap-3">
                <label className="flex items-center gap-2"><input type="radio" checked={form.barcaMode === "esistente"} onChange={() => setForm({ ...form, barcaMode: "esistente" })} /> Già in elenco</label>
                <label className="flex items-center gap-2"><input type="radio" checked={form.barcaMode === "nuovo"} onChange={() => setForm({ ...form, barcaMode: "nuovo" })} /> Nuova</label>
              </div>
              {form.barcaMode === "esistente" ? (
                <select className="rounded-md border border-line p-2" value={form.boatId} onChange={(e) => setForm({ ...form, boatId: e.target.value })} required>
                  <option value="">Scegli la barca…</option>
                  {barche.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              ) : (
                <div className="grid gap-2 md:grid-cols-2">
                  <input className="rounded-md border border-line p-2" placeholder="Nome barca *" value={form.barcaNome} onChange={(e) => setForm({ ...form, barcaNome: e.target.value })} required />
                  <input className="rounded-md border border-line p-2" placeholder="Tipo (gozzo, open…)" value={form.barcaTipo} onChange={(e) => setForm({ ...form, barcaTipo: e.target.value })} />
                </div>
              )}
            </fieldset>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Tipo di sosta</span>
                <select className="rounded-md border border-line p-2" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                  <option value="ormeggio_custodia">Ormeggio (in acqua, con custodia)</option>
                  <option value="rimessaggio_custodia">Rimessaggio (a terra, con custodia)</option>
                </select>
              </label>
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Corrispettivo concordato (€)</span>
                <input className="rounded-md border border-line p-2" placeholder="es. 200,00" value={form.corrispettivoEuro} onChange={(e) => setForm({ ...form, corrispettivoEuro: e.target.value })} />
              </label>
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Inizio</span>
                <input type="date" className="rounded-md border border-line p-2" value={form.inizioAt} onChange={(e) => setForm({ ...form, inizioAt: e.target.value })} required />
              </label>
              <label className="grid gap-1"><span className="text-xs font-semibold text-muted">Fine prevista (facoltativa)</span>
                <input type="date" className="rounded-md border border-line p-2" value={form.finePrevistaAt} onChange={(e) => setForm({ ...form, finePrevistaAt: e.target.value })} />
              </label>
            </div>
            <input className="rounded-md border border-line p-2" placeholder="Note (facoltative)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />

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
