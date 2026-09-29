"use client";
import { useEffect, useMemo, useState } from "react";
import { Icona } from "@/components/ui/Icona";
import { useConferma } from "@/components/ui/Dialogo";

type RigaBarca = {
  boatId: string | null; barca: string; incassatoCent: number; rimborsatoCent: number;
  noleggioCent: number; feeNaboatCent: number; feeProviderCent: number; speseCent: number; margineCent: number;
};
type Riepilogo = {
  periodo: { from: string; to: string };
  incassi: { pagatoCent: number; rimborsatoCent: number; noleggioCent: number; feeNaboatCent: number; feeProviderCent: number; incassoNettoCent: number; numeroIncassi: number };
  spese: { totaleCent: number; numeroSpese: number; perCategoria: { categoria: string; totaleCent: number }[] };
  margineCent: number;
  perBarca: RigaBarca[];
  perCanale: { canale: string; noleggioCent: number; feeNaboatCent: number; numero: number }[];
  perMetodo: { metodo: string; totaleCent: number }[];
};
type Spesa = { id: string; categoria: string; descrizione: string; importoCent: number; data: string; note: string | null; boat?: { nome: string } | null };
type Boat = { id: string; nome: string };

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const giorno = (d: Date) => d.toISOString().slice(0, 10);
const CATEGORIE = ["carburante", "manutenzione", "skipper", "assicurazione", "ormeggio", "pulizia", "commissioni", "altro"];

export default function ResocontoPage() {
  const oggi = new Date();
  const [from, setFrom] = useState(giorno(new Date(Date.UTC(oggi.getUTCFullYear(), oggi.getUTCMonth(), 1))));
  const [to, setTo] = useState(giorno(oggi));
  const [dati, setDati] = useState<Riepilogo | null>(null);
  const [spese, setSpese] = useState<Spesa[]>([]);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ boatId: "", categoria: "carburante", descrizione: "", importoEuro: "", data: giorno(oggi), note: "" });
  const conferma = useConferma();

  const query = useMemo(() => `from=${from}T00:00:00.000Z&to=${to}T23:59:59.999Z`, [from, to]);

  const load = () => {
    fetch(`/api/v1/reports/summary?${query}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Errore"); setDati(j); })
      .catch((e) => setErr(e.message));
    fetch(`/api/v1/expenses?${query}`).then((r) => r.json()).then((j) => Array.isArray(j) && setSpese(j)).catch(() => {});
    fetch("/api/v1/boats").then((r) => r.json()).then((j) => Array.isArray(j) && setBoats(j)).catch(() => {});
  };
  useEffect(load, [query]);

  const api = async (url: string, method: string, body?: any) => {
    setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    return j;
  };

  const aggiungi = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await api("/api/v1/expenses", "POST", { ...f, boatId: f.boatId || null });
    if (r) { setF({ ...f, descrizione: "", importoEuro: "", note: "" }); setMsg("Spesa registrata."); }
  };

  const eliminaSpesa = async (s: Spesa) => {
    const ok = await conferma.chiedi({
      titolo: "Eliminare la spesa?",
      messaggio: `«${s.descrizione}» (${euro(s.importoCent)}) verrà rimossa dal resoconto.`,
      confermaLabel: "Elimina spesa",
      pericoloso: true,
    });
    if (ok) await api(`/api/v1/expenses?id=${s.id}`, "DELETE");
  };

  const preset = (tipo: string) => {
    const d = new Date();
    if (tipo === "mese") { setFrom(giorno(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)))); setTo(giorno(d)); }
    if (tipo === "precedente") {
      const y = d.getUTCFullYear(), m = d.getUTCMonth();
      setFrom(giorno(new Date(Date.UTC(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, 1))));
      setTo(giorno(new Date(Date.UTC(y, m, 0))));
    }
    if (tipo === "anno") { setFrom(`${d.getUTCFullYear()}-01-01`); setTo(giorno(d)); }
  };

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Resoconto</p><h1 className="text-2xl">Incassi, spese e margine.</h1></div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="card flex flex-wrap items-end gap-3 p-4 text-sm">
        <label className="grid gap-1">Dal<input className="rounded-md border border-line p-2" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="grid gap-1">Al<input className="rounded-md border border-line p-2" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <button className="rounded-md border border-line px-3 py-2 font-bold" onClick={() => preset("mese")}>Questo mese</button>
        <button className="rounded-md border border-line px-3 py-2 font-bold" onClick={() => preset("precedente")}>Mese scorso</button>
        <button className="rounded-md border border-line px-3 py-2 font-bold" onClick={() => preset("anno")}>Quest'anno</button>
        <a className="btn-primary ml-auto" href={`/api/v1/reports/summary?${query}&format=csv`}>Scarica CSV per Excel</a>
      </div>

      {dati && (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <div className="card p-4"><p className="text-xs text-muted">NOLEGGI INCASSATI</p><p className="text-2xl font-bold">{euro(dati.incassi.noleggioCent)}</p><p className="text-xs text-muted">{dati.incassi.numeroIncassi} incassi</p></div>
            <div className="card p-4"><p className="text-xs text-muted">SPESE</p><p className="text-2xl font-bold text-coral">{euro(dati.spese.totaleCent)}</p><p className="text-xs text-muted">{dati.spese.numeroSpese} voci</p></div>
            <div className="card p-4"><p className="text-xs text-muted">FE COMPLESSIVE</p><p className="text-2xl font-bold">{euro(dati.incassi.feeNaboatCent + dati.incassi.feeProviderCent)}</p><p className="text-xs text-muted">NaBoat {euro(dati.incassi.feeNaboatCent)} · fornitore {euro(dati.incassi.feeProviderCent)}</p></div>
            <div className="card p-4"><p className="text-xs text-muted">MARGINE</p><p className={`text-2xl font-bold ${dati.margineCent < 0 ? "text-coral" : "text-[#177469]"}`}>{euro(dati.margineCent)}</p><p className="text-xs text-muted">noleggi − fee − spese</p></div>
          </div>

          <div className="card overflow-x-auto">
            <div className="border-b border-line p-3 text-sm font-bold">Margine per barca</div>
            <table className="w-full text-sm">
              <thead className="text-muted"><tr className="text-left">
                <th className="p-2">Barca</th><th className="p-2">Incassato</th><th className="p-2">Noleggio</th>
                <th className="p-2">Rimborsi</th><th className="p-2">Fee NaBoat</th><th className="p-2">Commissioni</th>
                <th className="p-2">Spese</th><th className="p-2">Margine</th>
              </tr></thead>
              <tbody>
                {dati.perBarca.map((b) => (
                  <tr key={b.boatId ?? "generale"} className="border-t border-line">
                    <td className="p-2 font-semibold">{b.barca}</td>
                    <td className="p-2">{euro(b.incassatoCent)}</td>
                    <td className="p-2">{euro(b.noleggioCent)}</td>
                    <td className="p-2">{euro(b.rimborsatoCent)}</td>
                    <td className="p-2">{euro(b.feeNaboatCent)}</td>
                    <td className="p-2">{euro(b.feeProviderCent)}</td>
                    <td className="p-2 text-coral">{euro(b.speseCent)}</td>
                    <td className={`p-2 font-bold ${b.margineCent < 0 ? "text-coral" : "text-[#177469]"}`}>{euro(b.margineCent)}</td>
                  </tr>
                ))}
                {!dati.perBarca.length && <tr><td className="p-3 text-muted" colSpan={8}>Nessun dato nel periodo.</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="card p-4 text-sm">
              <p className="font-bold">Spese per categoria</p>
              <table className="mt-2 w-full"><tbody>
                {dati.spese.perCategoria.map((c) => (
                  <tr key={c.categoria} className="border-t border-line"><td className="py-1 capitalize">{c.categoria}</td><td className="py-1 text-right font-semibold">{euro(c.totaleCent)}</td></tr>
                ))}
                {!dati.spese.perCategoria.length && <tr><td className="py-1 text-muted">Nessuna spesa</td></tr>}
              </tbody></table>
            </div>
            <div className="card p-4 text-sm">
              <p className="font-bold">Noleggi per canale</p>
              <table className="mt-2 w-full"><tbody>
                {dati.perCanale.map((c) => (
                  <tr key={c.canale} className="border-t border-line"><td className="py-1 capitalize">{c.canale} ({c.numero})</td><td className="py-1 text-right font-semibold">{euro(c.noleggioCent)}</td></tr>
                ))}
                {!dati.perCanale.length && <tr><td className="py-1 text-muted">Nessun incasso</td></tr>}
              </tbody></table>
            </div>
            <div className="card p-4 text-sm">
              <p className="font-bold">Incassi per metodo</p>
              <table className="mt-2 w-full"><tbody>
                {dati.perMetodo.map((m) => (
                  <tr key={m.metodo} className="border-t border-line"><td className="py-1 capitalize">{m.metodo}</td><td className="py-1 text-right font-semibold">{euro(m.totaleCent)}</td></tr>
                ))}
                {!dati.perMetodo.length && <tr><td className="py-1 text-muted">Nessun incasso</td></tr>}
              </tbody></table>
            </div>
          </div>
        </>
      )}

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Registra una spesa</h2>
        <form className="grid gap-2 md:grid-cols-6" onSubmit={aggiungi}>
          <input className="rounded-md border border-line p-2 md:col-span-2" placeholder="Descrizione *" value={f.descrizione} onChange={(e) => setF({ ...f, descrizione: e.target.value })} required />
          <input className="rounded-md border border-line p-2" placeholder="Importo € *" value={f.importoEuro} onChange={(e) => setF({ ...f, importoEuro: e.target.value })} required />
          <select className="rounded-md border border-line p-2 capitalize" value={f.categoria} onChange={(e) => setF({ ...f, categoria: e.target.value })}>
            {CATEGORIE.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
          <select className="rounded-md border border-line p-2" value={f.boatId} onChange={(e) => setF({ ...f, boatId: e.target.value })}>
            <option value="">Nessuna barca</option>
            {boats.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <input className="rounded-md border border-line p-2" type="date" value={f.data} onChange={(e) => setF({ ...f, data: e.target.value })} required />
          <input className="rounded-md border border-line p-2 md:col-span-5" placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <button className="btn-primary flex items-center justify-center gap-1.5" type="submit"><Icona nome="piu" className="h-4 w-4" /> Aggiungi</button>
        </form>
      </div>

      <div className="card overflow-x-auto">
        <div className="border-b border-line p-3 text-sm font-bold">Spese del periodo</div>
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left">
            <th className="p-2">Data</th><th className="p-2">Descrizione</th><th className="p-2">Categoria</th><th className="p-2">Barca</th><th className="p-2">Importo</th><th className="p-2">Note</th><th className="p-2"></th>
          </tr></thead>
          <tbody>
            {spese.map((s) => (
              <tr key={s.id} className="border-t border-line">
                <td className="p-2">{new Date(s.data).toLocaleDateString("it-IT")}</td>
                <td className="p-2">{s.descrizione}</td>
                <td className="p-2 capitalize">{s.categoria}</td>
                <td className="p-2">{s.boat?.nome ?? "—"}</td>
                <td className="p-2 font-semibold">{euro(s.importoCent)}</td>
                <td className="p-2 text-muted">{s.note ?? ""}</td>
                <td className="p-2"><button className="font-bold text-danger" onClick={() => eliminaSpesa(s)}>Elimina</button></td>
              </tr>
            ))}
            {!spese.length && <tr><td className="p-3 text-muted" colSpan={7}>Nessuna spesa registrata nel periodo.</td></tr>}
          </tbody>
        </table>
      </div>
      {conferma.dialogo}
    </div>
  );
}
