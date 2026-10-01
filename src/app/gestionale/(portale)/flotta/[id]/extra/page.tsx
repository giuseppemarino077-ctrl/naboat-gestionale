"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

type Extra = { id: string; nome: string; descrizione: string | null; prezzo: number | null; unita: string; quantitaMax: number | null; attivo: boolean };
type Assoc = { extraId: string; prezzoCent: number | null; quantitaMax: number | null };
const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";
const UNITA = [["fisso", "Fisso / a noleggio"], ["persona", "Per persona"], ["per_ora", "Per ora"], ["giorno", "Per giorno"], ["per_unita", "Per unità"]] as const;

export default function ExtraPage() {
  const { id } = useParams<{ id: string }>();
  const [extras, setExtras] = useState<Extra[] | null>(null);
  const [assoc, setAssoc] = useState<Map<string, { prezzo: string; quantita: string }>>(new Map());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [nuovo, setNuovo] = useState({ nome: "", unita: "fisso", prezzo: "", quantitaMax: "", descrizione: "", attivo: true });

  const carica = useCallback(() => {
    fetch(`/api/v1/boats/${id}/extra`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
      setExtras(j.extras);
      const m = new Map<string, { prezzo: string; quantita: string }>();
      for (const a of j.associazioni as Assoc[]) m.set(a.extraId, { prezzo: a.prezzoCent != null ? String(a.prezzoCent / 100) : "", quantita: a.quantitaMax != null ? String(a.quantitaMax) : "" });
      setAssoc(m);
    }).catch(() => setErr("Non è stato possibile caricare gli extra."));
  }, [id]);
  useEffect(carica, [carica]);

  const crea = async () => {
    setErr(""); setMsg("");
    const r = await fetch("/api/v1/extras", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: nuovo.nome, unita: nuovo.unita, prezzo: nuovo.prezzo ? Number(nuovo.prezzo.replace(",", ".")) : undefined, quantitaMax: nuovo.quantitaMax ? Number(nuovo.quantitaMax) : null, descrizione: nuovo.descrizione || null }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Creazione non riuscita."); return; }
    setMsg("Extra creato."); setNuovo({ nome: "", unita: "fisso", prezzo: "", quantitaMax: "", descrizione: "", attivo: true }); carica();
  };

  const toggle = (extraId: string) => setAssoc((m) => { const n = new Map(m); if (n.has(extraId)) n.delete(extraId); else n.set(extraId, { prezzo: "", quantita: "" }); return n; });

  const salvaAssoc = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const voci = (extras ?? []).map((e) => {
        const a = assoc.get(e.id);
        return { extraId: e.id, associato: !!a, prezzoCent: a && a.prezzo ? Math.round(Number(a.prezzo.replace(",", ".")) * 100) : null, quantitaMax: a && a.quantita ? Number(a.quantita) : null };
      });
      const r = await fetch(`/api/v1/boats/${id}/extra`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voci }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito."); return; }
      setMsg("Associazioni extra salvate."); carica();
    } finally { setBusy(false); }
  };

  if (!extras) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;
  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">A. Crea servizio aggiuntivo</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Nome *<input value={nuovo.nome} onChange={(e) => setNuovo({ ...nuovo, nome: e.target.value })} maxLength={120} className={campo} /></label>
          <label className="grid gap-1 text-sm font-semibold">Unità<select value={nuovo.unita} onChange={(e) => setNuovo({ ...nuovo, unita: e.target.value })} className={campo}>{UNITA.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
          <label className="grid gap-1 text-sm font-semibold">Prezzo base €<input value={nuovo.prezzo} onChange={(e) => setNuovo({ ...nuovo, prezzo: e.target.value })} className={campo} /></label>
          <label className="grid gap-1 text-sm font-semibold">Quantità massima<input type="number" min={1} value={nuovo.quantitaMax} onChange={(e) => setNuovo({ ...nuovo, quantitaMax: e.target.value })} className={campo} /></label>
          <label className="grid gap-1 text-sm font-semibold sm:col-span-2">Descrizione<textarea rows={2} value={nuovo.descrizione} onChange={(e) => setNuovo({ ...nuovo, descrizione: e.target.value })} maxLength={500} className={campo + " py-2"} /></label>
        </div>
        <div><button type="button" disabled={busy} onClick={crea} className="btn-primary">Crea extra</button></div>
      </section>

      <section className="card grid gap-2 p-5">
        <h2 className="font-display text-lg font-bold text-ink">B. Catalogo aziendale</h2>
        {extras.length === 0 ? <p className="text-sm text-muted">Nessun extra in catalogo.</p> : (
          <ul className="grid gap-2">
            {extras.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line p-3 text-sm">
                <span><strong>{e.nome}</strong> · {e.prezzo != null ? `${e.prezzo} €` : "prezzo n/d"} · {e.unita.replaceAll("_", " ")}{e.attivo ? "" : " · inattivo"}</span>
                <label className="flex items-center gap-2"><input type="checkbox" checked={e.attivo} onChange={async (ev) => { await fetch(`/api/v1/extras/${e.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attivo: ev.target.checked }) }); carica(); }} /> Attivo</label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">C. Extra disponibili su questa barca</h2>
        <p className="text-sm text-muted">Vuoto = eredita il valore base. Zero come prezzo personalizzato è un valore reale. Togliere l'ultima associazione non applica l'extra a tutte le barche.</p>
        <ul className="grid gap-2">
          {extras.filter((e) => e.attivo).map((e) => {
            const a = assoc.get(e.id);
            return (
              <li key={e.id} className={"grid gap-2 rounded-2xl border p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center " + (a ? "border-ocean bg-foam" : "border-line")}>
                <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={!!a} onChange={() => toggle(e.id)} /> {e.nome}</label>
                {a && (
                  <>
                    <input value={a.prezzo} onChange={(ev) => setAssoc((m) => new Map(m).set(e.id, { ...a, prezzo: ev.target.value }))} placeholder={`€ (base ${e.prezzo ?? "—"})`} className="rounded-lg border border-line px-2 py-1.5 text-sm sm:w-40" />
                    <input value={a.quantita} onChange={(ev) => setAssoc((m) => new Map(m).set(e.id, { ...a, quantita: ev.target.value }))} placeholder="Q.tà max" className="rounded-lg border border-line px-2 py-1.5 text-sm sm:w-28" />
                  </>
                )}
              </li>
            );
          })}
        </ul>
        <div><button type="button" disabled={busy} onClick={salvaAssoc} className="btn-primary">{busy ? "Salvo…" : "Salva associazioni"}</button></div>
      </section>
    </div>
  );
}
