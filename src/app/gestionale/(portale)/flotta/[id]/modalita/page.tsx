"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

type Offerta = { id: string | null; codice: string; attiva: boolean; skipperModo: string; guidaAutonoma: boolean; etaMinima: number | null; noteLimiti: string | null; noteRequisiti: string | null };
const ETICHETTA: Record<string, string> = { LOCAZIONE: "Locazione", LOCAZIONE_CON_COMANDANTE: "Locazione con comandante", NOLEGGIO: "Noleggio" };
const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

function FormModalita({ offerta, onSalva }: { offerta: Offerta; onSalva: (o: Offerta) => Promise<void> }) {
  const [v, setV] = useState<Offerta>(offerta);
  const [busy, setBusy] = useState(false);
  useEffect(() => setV(offerta), [offerta]);

  const salva = async () => {
    setBusy(true);
    try { await onSalva(v); } finally { setBusy(false); }
  };

  return (
    <section className="card grid gap-3 p-5">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">{ETICHETTA[v.codice] ?? v.codice}</h2>
        <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={v.attiva} onChange={(e) => setV({ ...v, attiva: e.target.checked })} /> Attiva</label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="grid gap-1 text-sm">Skipper
          <select value={v.skipperModo} onChange={(e) => setV({ ...v, skipperModo: e.target.value })} className={campo}>
            <option value="NON_DISPONIBILE">Non disponibile</option>
            <option value="OPZIONALE">Opzionale</option>
            <option value="INCLUSO">Incluso</option>
            <option value="OBBLIGATORIO">Obbligatorio</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Guida autonoma
          <select value={v.guidaAutonoma ? "SI" : "NO"} onChange={(e) => setV({ ...v, guidaAutonoma: e.target.value === "SI", etaMinima: e.target.value === "SI" ? v.etaMinima : null })} className={campo}>
            <option value="NO">No</option>
            <option value="SI">Sì</option>
          </select>
        </label>
        <label className="grid gap-1 text-sm">Età minima conducente
          <input type="number" min={18} max={99} disabled={!v.guidaAutonoma} value={v.etaMinima ?? ""} onChange={(e) => setV({ ...v, etaMinima: e.target.value ? Number(e.target.value) : null })} className={campo} />
        </label>
      </div>
      <label className="grid gap-1 text-sm">Note limiti di navigazione<textarea rows={2} value={v.noteLimiti ?? ""} onChange={(e) => setV({ ...v, noteLimiti: e.target.value })} maxLength={2000} className={campo + " py-2"} /></label>
      <label className="grid gap-1 text-sm">Note requisiti / idoneità<textarea rows={2} value={v.noteRequisiti ?? ""} onChange={(e) => setV({ ...v, noteRequisiti: e.target.value })} maxLength={2000} className={campo + " py-2"} /></label>
      <div><button type="button" disabled={busy} onClick={salva} className="btn-primary">{busy ? "Salvo…" : "Salva modalità"}</button></div>
    </section>
  );
}

export default function ModalitaPage() {
  const { id } = useParams<{ id: string }>();
  const [offerte, setOfferte] = useState<Offerta[] | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const carica = () => fetch(`/api/v1/boats/${id}/offerte`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setOfferte).catch(() => setErr("Non è stato possibile caricare le modalità."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carica(); }, [id]);

  const salva = async (o: Offerta) => {
    setErr(""); setMsg("");
    const r = await fetch(`/api/v1/boats/${id}/offerte`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codice: o.codice, attiva: o.attiva, skipperModo: o.skipperModo, guidaAutonoma: o.guidaAutonoma, etaMinima: o.etaMinima, noteLimiti: o.noteLimiti, noteRequisiti: o.noteRequisiti }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito."); return; }
    setMsg(`Modalità ${ETICHETTA[o.codice] ?? o.codice} salvata.`); carica();
  };

  if (!offerte) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;
  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      <p className="text-sm text-muted">Le modalità attive alimentano il selettore della prenotazione rapida e il listino. Disattivare una modalità non tocca le prenotazioni passate.</p>
      {offerte.map((o) => <FormModalita key={o.codice} offerta={o} onSalva={salva} />)}
    </div>
  );
}
