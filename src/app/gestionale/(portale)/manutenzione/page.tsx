"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Icona } from "@/components/ui/Icona";
import { useConferma } from "@/components/ui/Dialogo";
import { useModulo } from "@/components/ui/ModuloDialogo";

type Item = {
  id: string; boatId: string; tipo: string; titolo: string; dataScadenza: string | null;
  oreMotore: number | null; eseguitoAt: string | null; costoCent: number | null; note: string | null;
  stato: "eseguito" | "scaduto" | "in_scadenza" | "programmato"; boat?: { nome: string } | null;
};
type Boat = { id: string; nome: string };

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (s: string) => new Date(s).toLocaleDateString("it-IT");
const TIPI = ["assicurazione", "revisione", "tagliando", "ore_motore", "altro"];
const etichetta = (t: string) => t.replace("_", " ");

export default function ManutenzionePage() {
  const [items, setItems] = useState<Item[]>([]);
  const [attenzione, setAttenzione] = useState(0);
  const [boats, setBoats] = useState<Boat[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [filtro, setFiltro] = useState("aperti");
  const [f, setF] = useState({ boatId: "", tipo: "assicurazione", titolo: "", dataScadenza: "", oreMotore: "", costoEuro: "", note: "" });
  const conferma = useConferma();
  const modulo = useModulo();

  const load = () => {
    fetch(`/api/v1/maintenance${filtro === "aperti" ? "?aperti=1" : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setItems(j.items ?? []); setAttenzione(j.attenzione ?? 0); })
      .catch((e) => setErr(e.message));
    fetch("/api/v1/boats").then((r) => r.json()).then((j) => Array.isArray(j) && setBoats(j)).catch(() => {});
  };
  useEffect(load, [filtro]);

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
    const r = await api("/api/v1/maintenance", "POST", {
      ...f,
      boatId: f.boatId,
      dataScadenza: f.dataScadenza || null,
      oreMotore: f.oreMotore ? Number(f.oreMotore) : null,
      costoEuro: f.costoEuro || null,
      note: f.note || null,
    });
    if (r) { setF({ ...f, titolo: "", dataScadenza: "", oreMotore: "", costoEuro: "", note: "" }); setMsg("Scadenza registrata."); }
  };

  const esegui = async (item: Item) => {
    const v = await modulo.apri(`Intervento eseguito · ${item.titolo}`, [
      { nome: "costo", etichetta: "Costo sostenuto in euro", placeholder: "Vuoto = nessun costo", valore: item.costoCent ? (item.costoCent / 100).toFixed(2).replace(".", ",") : "", aiuto: "Il costo viene registrato tra le spese." },
    ], { confermaLabel: "Segna come eseguito" });
    if (!v) return;
    const r = await api(`/api/v1/maintenance/${item.id}`, "PATCH", { azione: "esegui", costoEuro: v.costo.trim() || null });
    if (r) setMsg("Intervento segnato come eseguito." + (v.costo.trim() ? " Costo registrato tra le spese." : ""));
  };

  const elimina = async (item: Item) => {
    const ok = await conferma.chiedi({
      titolo: "Eliminare la scadenza?",
      messaggio: `«${item.titolo}» di ${item.boat?.nome ?? "questa barca"} verrà eliminata dall'elenco.`,
      dettaglio: "Se l'intervento è stato eseguito la spesa resta registrata.",
      confermaLabel: "Elimina",
      pericoloso: true,
    });
    if (ok) await api(`/api/v1/maintenance/${item.id}`, "DELETE");
  };

  const badge = (s: Item["stato"]) =>
    s === "eseguito" ? "badge-ready" : s === "scaduto" ? "rounded-full bg-danger-soft px-2 py-1 text-xs font-semibold text-danger" : s === "in_scadenza" ? "badge-pending" : "badge-block";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-sm text-muted">Manutenzione</p><h1 className="text-2xl">Scadenze e interventi delle barche.</h1></div>
        {attenzione > 0 && <span className="badge-pending">{attenzione} da controllare</span>}
      </div>
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Nuova scadenza o intervento</h2>
        <form className="grid gap-2 md:grid-cols-6" onSubmit={aggiungi}>
          <select className="rounded-md border border-line p-2" value={f.boatId} onChange={(e) => setF({ ...f, boatId: e.target.value })} required>
            <option value="">Barca *</option>
            {boats.map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
          </select>
          <select className="rounded-md border border-line p-2 capitalize" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })}>
            {TIPI.map((t) => <option key={t} value={t} className="capitalize">{etichetta(t)}</option>)}
          </select>
          <input className="rounded-md border border-line p-2 md:col-span-2" placeholder="Titolo * (es. Assicurazione RC)" value={f.titolo} onChange={(e) => setF({ ...f, titolo: e.target.value })} required />
          <input className="rounded-md border border-line p-2" type="date" title="Data di scadenza" value={f.dataScadenza} onChange={(e) => setF({ ...f, dataScadenza: e.target.value })} />
          <input className="rounded-md border border-line p-2" type="number" min={0} placeholder="Ore motore" value={f.oreMotore} onChange={(e) => setF({ ...f, oreMotore: e.target.value })} />
          <input className="rounded-md border border-line p-2" placeholder="Costo previsto €" value={f.costoEuro} onChange={(e) => setF({ ...f, costoEuro: e.target.value })} />
          <input className="rounded-md border border-line p-2 md:col-span-4" placeholder="Note" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
          <button className="btn-primary flex items-center justify-center gap-1.5 md:col-span-2" type="submit"><Icona nome="piu" className="h-4 w-4" /> Aggiungi</button>
        </form>
      </div>

      <div className="flex gap-2 text-sm">
        {[["aperti", "Da fare"], ["tutti", "Tutti"]].map(([k, l]) => (
          <button key={k} onClick={() => setFiltro(k)} className={`rounded-full px-4 py-1.5 font-bold ${filtro === k ? "bg-deep text-white" : "bg-white text-muted border border-line"}`}>{l}</button>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left">
            <th className="p-2">Barca</th><th className="p-2">Tipo</th><th className="p-2">Titolo</th>
            <th className="p-2">Scadenza</th><th className="p-2">Ore motore</th><th className="p-2">Costo</th>
            <th className="p-2">Stato</th><th className="p-2">Azioni</th>
          </tr></thead>
          <tbody>
            {items.map((m) => (
              <tr key={m.id} className="border-t border-line">
                <td className="p-2 font-semibold">{m.boat?.nome ?? "—"}</td>
                <td className="p-2 capitalize">{etichetta(m.tipo)}</td>
                <td className="p-2">{m.titolo}{m.note ? <span className="block text-xs text-muted">{m.note}</span> : null}</td>
                <td className="p-2">{m.dataScadenza ? dataIt(m.dataScadenza) : "—"}</td>
                <td className="p-2">{m.oreMotore ?? "—"}</td>
                <td className="p-2">{m.costoCent ? euro(m.costoCent) : "—"}</td>
                <td className="p-2"><span className={badge(m.stato)}>{etichetta(m.stato)}</span>{m.eseguitoAt ? <span className="block text-xs text-muted">il {dataIt(m.eseguitoAt)}</span> : null}</td>
                <td className="p-2">
                  <div className="flex gap-2 font-bold">
                    {!m.eseguitoAt && <button className="text-ok" onClick={() => esegui(m)}>Eseguito</button>}
                    {m.eseguitoAt && <button className="text-ocean" onClick={() => api(`/api/v1/maintenance/${m.id}`, "PATCH", { azione: "riapri" })}>Riapri</button>}
                    <button className="text-danger" onClick={() => elimina(m)}>Elimina</button>
                  </div>
                </td>
              </tr>
            ))}
            {!items.length && <tr><td className="p-3 text-muted" colSpan={8}>Nessuna scadenza registrata.</td></tr>}
          </tbody>
        </table>
      </div>
      {conferma.dialogo}
      {modulo.dialogo}
    </div>
  );
}
