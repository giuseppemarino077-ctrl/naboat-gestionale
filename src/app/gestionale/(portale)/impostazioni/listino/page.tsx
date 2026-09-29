"use client";
import { useEffect, useState } from "react";

type Tariffa = { id: string; boatId: string | null; tipo: string; stagione: string; prezzoCent: number; attivo: boolean; boat?: { nome: string } | null };
type Boat = { id: string; nome: string };

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const TIPI = [["mezza_giornata", "Mezza giornata"], ["giornata", "Giornata"], ["settimana", "Settimana"]];
const STAGIONI = [["tutto_anno", "Tutto l'anno"], ["alta", "Alta stagione (giu–set)"], ["bassa", "Bassa stagione"]];

export default function ListinoPage() {
  const [tariffe, setTariffe] = useState<Tariffa[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ boatId: "", tipo: "giornata", stagione: "tutto_anno", prezzoEuro: "" });

  const load = () => {
    fetch("/api/v1/tariffe").then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setTariffe(j); }).catch((e) => setErr(e.message));
    fetch("/api/v1/boats").then((r) => r.json()).then((j) => Array.isArray(j) && setBoats(j)).catch(() => {});
  };
  useEffect(load, []);

  const api = async (url: string, method: string, body?: any) => {
    setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    return j;
  };

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api("/api/v1/tariffe", "POST", { ...f, boatId: f.boatId || null });
    if (r) { setF({ ...f, prezzoEuro: "" }); setMsg("Tariffa salvata."); }
  };

  const raggruppa = (tipo: string) => tariffe.filter((t) => t.tipo === tipo);

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Listino</p><h1 className="text-2xl">Prezzi per barca e stagione.</h1></div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Imposta una tariffa</h2>
        <p className="text-muted">Se scegli «Tutte le barche» la tariffa vale come prezzo generale. Se esiste già una tariffa dello stesso tipo, viene aggiornata.</p>
        <form className="grid gap-2 md:grid-cols-5" onSubmit={salva}>
          <select className="rounded-md border border-line p-2" value={f.boatId} onChange={(e) => setF({ ...f, boatId: e.target.value })}>
            <option value="">Tutte le barche</option>
            {boats.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <select className="rounded-md border border-line p-2" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className="rounded-md border border-line p-2" value={f.stagione} onChange={(e) => setF({ ...f, stagione: e.target.value })}>
            {STAGIONI.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <input className="rounded-md border border-line p-2" placeholder="Prezzo € *" value={f.prezzoEuro} onChange={(e) => setF({ ...f, prezzoEuro: e.target.value })} required />
          <button className="btn-primary" type="submit">＋ Salva</button>
        </form>
      </div>

      {TIPI.map(([tipo, label]) => (
        <div key={tipo} className="card overflow-x-auto">
          <div className="border-b border-line p-3 text-sm font-bold">{label}</div>
          <table className="w-full text-sm">
            <thead className="text-muted"><tr className="text-left">
              <th className="p-2">Barca</th><th className="p-2">Stagione</th><th className="p-2">Prezzo</th><th className="p-2">Stato</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {raggruppa(tipo).map((t) => (
                <tr key={t.id} className="border-t border-line">
                  <td className="p-2 font-semibold">{t.boat?.nome ?? "Tutte le barche"}</td>
                  <td className="p-2 capitalize">{t.stagione.replace("_", " ")}</td>
                  <td className="p-2 font-semibold">{euro(t.prezzoCent)}</td>
                  <td className="p-2"><span className={t.attivo ? "badge-ready" : "badge-block"}>{t.attivo ? "attiva" : "sospesa"}</span></td>
                  <td className="p-2">
                    <div className="flex gap-2 font-bold">
                      <button className="text-ocean" onClick={() => api("/api/v1/tariffe", "POST", { boatId: t.boatId, tipo: t.tipo, stagione: t.stagione, prezzoEuro: (t.prezzoCent / 100).toFixed(2).replace(".", ","), attivo: !t.attivo })}>{t.attivo ? "Sospendi" : "Riattiva"}</button>
                      <button className="text-coral" onClick={() => confirm("Eliminare la tariffa?") && api(`/api/v1/tariffe?id=${t.id}`, "DELETE")}>Elimina</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!raggruppa(tipo).length && <tr><td className="p-3 text-muted" colSpan={5}>Nessuna tariffa.</td></tr>}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
}
