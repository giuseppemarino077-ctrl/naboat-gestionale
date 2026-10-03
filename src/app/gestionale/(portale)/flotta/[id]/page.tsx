"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { useConferma } from "@/components/ui/Dialogo";
import { nomeEsperienza } from "@/lib/esperienze";

type Boat = {
  id: string; nome: string; tipo: string | null; codiceInterno: string | null; capienza: number | null;
  potenzaCv: number | null; patenteRichiesta: boolean; portoId: string | null; modelloId: string | null;
  descrizione: string | null; lunghezzaM: number | null; cabine: number | null; carburante: string | null;
  cauzioneCent: number | null; etaMinima: number | null;
  esperienze: string[]; esperienzePersonalizzate: string[];
};

export default function DatiBarcaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const conferma = useConferma();
  const [b, setB] = useState<Boat | null>(null);
  const [porti, setPorti] = useState<{ id: string; nome: string }[]>([]);
  const [modelli, setModelli] = useState<{ id: string; modello: string; marca: string | null }[]>([]);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

  const carica = () => fetch(`/api/v1/boats/${id}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setB).catch(() => setErr("Barca non trovata."));
  useEffect(() => {
    carica();
    fetch("/api/v1/porti").then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setPorti(j)).catch(() => {});
    fetch("/api/v1/modelli").then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setModelli(j)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const salva = async (dati: Record<string, unknown>, esito = "Dati barca salvati.") => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/boats/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dati) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Non è stato possibile salvare."); return; }
      setB(j as Boat);
      setMsg(esito);
    } finally { setBusy(false); }
  };

  const rimuoviEsperienza = (campo: "esperienze" | "personalizzate", valore: string) => {
    if (!b) return;
    const esp = campo === "esperienze" ? (b.esperienze ?? []).filter((c) => c !== valore) : (b.esperienze ?? []);
    const cus = campo === "personalizzate" ? (b.esperienzePersonalizzate ?? []).filter((c) => c !== valore) : (b.esperienzePersonalizzate ?? []);
    salva({ esperienze: esp, esperienzePersonalizzate: cus }, "Esperienza rimossa dalla barca.");
  };

  const duplica = async () => {
    const ok = await conferma.chiedi({ titolo: `Creare una nuova imbarcazione con la stessa configurazione di "${b?.nome}"?`, messaggio: "Vengono copiati dati tecnici, modalità, dotazioni, extra e prezzi. Non vengono copiati foto, identità fisica e storico.", confermaLabel: "Duplica" });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/v1/boats/${id}/duplicate`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Duplicazione non riuscita."); return; }
      router.push(`/gestionale/flotta/${j.id}`);
    } finally { setBusy(false); }
  };

  if (!b) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;

  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <section className="card grid gap-4 p-5">
        <label className="grid gap-2 text-sm font-semibold">Nome della barca *<input defaultValue={b.nome} onBlur={(e) => e.target.value !== b.nome && salva({ nome: e.target.value })} maxLength={160} className={campo} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">Potenza motore (CV)<input defaultValue={b.potenzaCv ?? ""} onBlur={(e) => { const v = e.target.value.trim() ? Number(e.target.value.replace(",", ".")) : null; if (v !== b.potenzaCv) salva({ potenzaCv: v }); }} inputMode="decimal" className={campo} /></label>
          <fieldset className="grid gap-2 text-sm font-semibold">
            Patente nautica richiesta?
            <div className="grid grid-cols-2 gap-2">
              {[true, false].map((v) => (
                <label key={String(v)} className={"flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold " + (b.patenteRichiesta === v ? "border-ocean bg-foam text-ocean" : "border-line bg-white text-ink")}>
                  <input type="radio" className="sr-only" checked={b.patenteRichiesta === v} onChange={() => salva({ patenteRichiesta: v })} />
                  {v ? "Sì" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <div className="flex justify-end"><button type="button" disabled={busy} onClick={() => salva({})} className="btn-primary">Salva dati barca</button></div>

        <details className="rounded-2xl border border-line bg-sand p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ocean">Codice, tipo e sede</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">Codice interno<input defaultValue={b.codiceInterno ?? ""} onBlur={(e) => salva({ codiceInterno: e.target.value || null })} maxLength={80} className={campo} /></label>
            <label className="grid gap-1 text-sm">Tipo<input defaultValue={b.tipo ?? ""} onBlur={(e) => salva({ tipo: e.target.value || null })} maxLength={40} className={campo} /></label>
            <label className="grid gap-1 text-sm">Sede
              <select defaultValue={b.portoId ?? ""} onChange={(e) => salva({ portoId: e.target.value || null })} className={campo}>
                <option value="">Nessuna sede</option>
                {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </label>
          </div>
        </details>

        <details className="rounded-2xl border border-line bg-sand p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ocean">Dati aggiuntivi NaBoat e pubblicazione</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="grid gap-1 text-sm">Capienza (pax)<input type="number" min={1} max={60} defaultValue={b.capienza ?? ""} onBlur={(e) => salva({ capienza: e.target.value ? Number(e.target.value) : null })} className={campo} /></label>
            <label className="grid gap-1 text-sm">Lunghezza (m)<input type="number" step="0.1" defaultValue={b.lunghezzaM ?? ""} onBlur={(e) => salva({ lunghezzaM: e.target.value ? Number(e.target.value) : null })} className={campo} /></label>
            <label className="grid gap-1 text-sm">Cabine<input type="number" min={0} defaultValue={b.cabine ?? ""} onBlur={(e) => salva({ cabine: e.target.value ? Number(e.target.value) : null })} className={campo} /></label>
            <label className="grid gap-1 text-sm">Cauzione (€)<input type="number" min={0} defaultValue={b.cauzioneCent != null ? b.cauzioneCent / 100 : ""} onBlur={(e) => salva({ cauzioneCent: e.target.value ? Math.round(Number(e.target.value) * 100) : null })} className={campo} /></label>
            <label className="grid gap-1 text-sm">Età minima<input type="number" min={0} max={99} defaultValue={b.etaMinima ?? ""} onBlur={(e) => salva({ etaMinima: e.target.value ? Number(e.target.value) : null })} className={campo} /></label>
            <label className="grid gap-1 text-sm sm:col-span-2">Modello
              <select defaultValue={b.modelloId ?? ""} onChange={(e) => salva({ modelloId: e.target.value || null })} className={campo}>
                <option value="">Nessun modello</option>
                {modelli.map((m) => <option key={m.id} value={m.id}>{m.marca ? `${m.marca} ` : ""}{m.modello}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm sm:col-span-3">Descrizione<textarea rows={3} defaultValue={b.descrizione ?? ""} onBlur={(e) => salva({ descrizione: e.target.value || null })} maxLength={3000} className={campo + " py-3"} /></label>
          </div>
          <p className="mt-3 text-xs text-muted">Foto, copertina e pubblicazione si gestiscono da <Link href={`/gestionale/flotta/${id}/foto`} className="font-semibold text-ocean">Foto e pubblicazione</Link>.</p>
        </details>
      </section>

      <section className="card grid gap-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-display text-lg font-bold text-ink">Esperienze allocate</h2>
          <Link href="/gestionale/esperienze" className="text-sm font-semibold text-ocean hover:underline">Gestisci dal tab Esperienze →</Link>
        </div>
        {(b.esperienze?.length ?? 0) + (b.esperienzePersonalizzate?.length ?? 0) === 0 ? (
          <p className="text-sm text-muted">Nessuna esperienza allocata a questa barca. Attivale e assegnale dal tab «Esperienze».</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {(b.esperienze ?? []).map((c) => (
              <span key={`cat-${c}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm">
                {nomeEsperienza(c)}
                <button type="button" aria-label={`Rimuovi ${nomeEsperienza(c)}`} disabled={busy} onClick={() => rimuoviEsperienza("esperienze", c)} className="font-bold text-danger disabled:opacity-40">×</button>
              </span>
            ))}
            {(b.esperienzePersonalizzate ?? []).map((c) => (
              <span key={`cus-${c}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-sm">
                {c}
                <button type="button" aria-label={`Rimuovi ${c}`} disabled={busy} onClick={() => rimuoviEsperienza("personalizzate", c)} className="font-bold text-danger disabled:opacity-40">×</button>
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-2">
        <Link href={`/gestionale/flotta/${id}/servizi`} className="card p-4 font-semibold text-ocean hover:border-ocean">Gestisci servizi e optional →</Link>
        <Link href={`/gestionale/flotta/${id}/stato`} className="card p-4 font-semibold text-ocean hover:border-ocean">Disponibilità ed eliminazione →</Link>
      </div>

      <section className="card grid gap-3 border border-warn-line bg-warn-soft p-5">
        <h2 className="font-display text-lg font-bold text-ink">Duplica imbarcazione</h2>
        <p className="text-sm text-muted">Crea una nuova unità operativa con la stessa configurazione (tecnica, modalità, dotazioni, extra, prezzi). Non copia foto, identità fisica, prenotazioni e storico.</p>
        <div><button type="button" disabled={busy} onClick={duplica} className="btn-primary">{busy ? "Duplicazione…" : "Duplica imbarcazione"}</button></div>
      </section>
      {conferma.dialogo}
    </div>
  );
}
