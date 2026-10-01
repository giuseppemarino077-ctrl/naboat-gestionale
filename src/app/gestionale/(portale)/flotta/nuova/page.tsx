"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";

export default function NuovaBarcaPage() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [potenzaCv, setPotenzaCv] = useState("");
  const [patenteRichiesta, setPatenteRichiesta] = useState<"" | "SI" | "NO">("");
  const [codiceInterno, setCodiceInterno] = useState("");
  const [tipo, setTipo] = useState("");
  const [portoId, setPortoId] = useState("");
  const [porti, setPorti] = useState<{ id: string; nome: string }[]>([]);
  const [errore, setErrore] = useState("");
  const [busy, setBusy] = useState(false);
  const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

  useEffect(() => {
    fetch("/api/v1/porti").then((r) => (r.ok ? r.json() : [])).then((j) => { if (Array.isArray(j)) { setPorti(j); if (j[0]) setPortoId(j[0].id); } }).catch(() => {});
  }, []);

  const salva = async () => {
    setErrore("");
    if (nome.trim().length < 2) { setErrore("Indica il nome della barca."); return; }
    const potenza = potenzaCv.trim() ? Number(potenzaCv.replace(",", ".")) : null;
    if (potenza != null && (Number.isNaN(potenza) || potenza <= 0)) { setErrore("La potenza deve essere un numero maggiore di zero."); return; }
    if (!patenteRichiesta) { setErrore("Indica se è richiesta la patente nautica."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/boats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: nome.trim(),
          potenzaCv: potenza,
          patenteRichiesta: patenteRichiesta === "SI",
          capienza: null,
          codiceInterno: codiceInterno.trim() || null,
          tipo: tipo.trim() || null,
          portoId: portoId || null,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErrore(j.error ?? "Non è stato possibile salvare."); return; }
      router.push(`/gestionale/flotta/${j.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-4">
      <div>
        <Link href="/gestionale/flotta" className="text-sm font-semibold text-ocean">← Torna alla flotta</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">Nuova barca</h1>
        <p className="mt-1 text-sm text-muted">Bastano i dati essenziali: la barca entra subito nel calendario, disponibile. Foto, prezzi e pubblicazione si aggiungono dopo.</p>
      </div>

      {errore && <Avviso tono="errore">{errore}</Avviso>}

      <div className="card grid gap-4 p-5">
        <label className="grid gap-2 text-sm font-semibold">Nome della barca *<input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={160} className={campo} /></label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-semibold">Potenza motore (CV) *<input value={potenzaCv} onChange={(e) => setPotenzaCv(e.target.value)} inputMode="decimal" placeholder="es. 40,5" className={campo} /></label>
          <fieldset className="grid gap-2 text-sm font-semibold">
            Patente nautica richiesta? *
            <div className="grid grid-cols-2 gap-2">
              {(["SI", "NO"] as const).map((v) => (
                <label key={v} className={"flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-sm font-semibold " + (patenteRichiesta === v ? "border-ocean bg-foam text-ocean" : "border-line bg-white text-ink")}>
                  <input type="radio" className="sr-only" checked={patenteRichiesta === v} onChange={() => setPatenteRichiesta(v)} />
                  {v === "SI" ? "Sì" : "No"}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <details className="rounded-2xl border border-line bg-sand p-4">
          <summary className="cursor-pointer text-sm font-semibold text-ocean">Dati aggiuntivi (facoltativi)</summary>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">Codice interno<input value={codiceInterno} onChange={(e) => setCodiceInterno(e.target.value)} maxLength={80} className={campo} /></label>
            <label className="grid gap-1 text-sm">Tipo barca<input value={tipo} onChange={(e) => setTipo(e.target.value)} maxLength={40} placeholder="es. gommone, motoscafo…" className={campo} /></label>
            {porti.length > 0 && (
              <label className="grid gap-1 text-sm sm:col-span-2">Sede abituale
                <select value={portoId} onChange={(e) => setPortoId(e.target.value)} className={campo}>
                  <option value="">Nessuna sede</option>
                  {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </select>
              </label>
            )}
          </div>
        </details>

        <div className="flex justify-end">
          <button type="button" disabled={busy} onClick={salva} className="btn-primary">{busy ? "Salvo…" : "Crea barca"}</button>
        </div>
      </div>
    </div>
  );
}
