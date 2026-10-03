"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { ESPERIENZE } from "@/lib/esperienze";

type Barca = { id: string; nome: string };
type Alloc = Record<string, { esperienze: string[]; personalizzate: string[] }>;
type Risposta = { attive: string[]; personalizzate: string[]; barche: Array<Barca & { esperienze: string[]; esperienzePersonalizzate: string[] }> };

const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

export default function EsperienzePage() {
  const [attive, setAttive] = useState<string[]>([]);
  const [custom, setCustom] = useState<string[]>([]);
  const [alloc, setAlloc] = useState<Alloc>({});
  const [barche, setBarche] = useState<Barca[]>([]);
  const [nuova, setNuova] = useState("");
  const [caricato, setCaricato] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const applica = (j: Risposta) => {
    setAttive(j.attive ?? []);
    setCustom(j.personalizzate ?? []);
    setBarche((j.barche ?? []).map((b) => ({ id: b.id, nome: b.nome })));
    const m: Alloc = {};
    for (const b of j.barche ?? []) m[b.id] = { esperienze: b.esperienze ?? [], personalizzate: b.esperienzePersonalizzate ?? [] };
    setAlloc(m);
  };

  const carica = () => fetch("/api/v1/esperienze")
    .then((r) => (r.ok ? r.json() : Promise.reject()))
    .then((j) => { applica(j); setCaricato(true); })
    .catch(() => setErr("Non è stato possibile caricare le esperienze."));

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carica(); }, []);

  const toggleAttiva = (codice: string, campoAlloc: "esperienze" | "personalizzate") => {
    const attiva = (campoAlloc === "esperienze" ? attive : custom).includes(codice);
    if (campoAlloc === "esperienze") setAttive(attiva ? attive.filter((c) => c !== codice) : [...attive, codice]);
    else setCustom(attiva ? custom.filter((c) => c !== codice) : [...custom, codice]);
    // Disattivando, la voce sparisce anche dalle barche.
    if (attiva) {
      setAlloc((m) => {
        const n: Alloc = {};
        for (const [k, v] of Object.entries(m)) n[k] = { ...v, [campoAlloc]: v[campoAlloc].filter((c) => c !== codice) };
        return n;
      });
    }
  };

  const toggleBarca = (boatId: string, codice: string, campoAlloc: "esperienze" | "personalizzate") => {
    setAlloc((m) => {
      const cur = m[boatId] ?? { esperienze: [], personalizzate: [] };
      const list = cur[campoAlloc];
      const next = list.includes(codice) ? list.filter((c) => c !== codice) : [...list, codice];
      return { ...m, [boatId]: { ...cur, [campoAlloc]: next } };
    });
  };

  const aggiungiCustom = () => {
    const v = nuova.trim();
    if (v.length < 2) return;
    if (!custom.some((c) => c.toLowerCase() === v.toLowerCase())) setCustom((c) => [...c, v]);
    setNuova("");
  };

  const rimuoviCustom = (nome: string) => {
    setCustom((c) => c.filter((x) => x !== nome));
    setAlloc((m) => {
      const n: Alloc = {};
      for (const [k, v] of Object.entries(m)) n[k] = { ...v, personalizzate: v.personalizzate.filter((c) => c !== nome) };
      return n;
    });
  };

  const salva = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const allocazioni = Object.entries(alloc).map(([boatId, v]) => ({ boatId, esperienze: v.esperienze, personalizzate: v.personalizzate }));
      const r = await fetch("/api/v1/esperienze", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ attive, personalizzate: custom, allocazioni }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito."); return; }
      applica(j);
      setMsg("Esperienze salvate: attivazioni e barche sono aggiornate nel marketplace.");
    } finally {
      setBusy(false);
    }
  };

  if (!caricato) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;

  const allocBarca = (boatId: string, codice: string, campoAlloc: "esperienze" | "personalizzate") =>
    (alloc[boatId]?.[campoAlloc] ?? []).includes(codice);

  const BloccoBarche = ({ codice, campoAlloc, nome }: { codice: string; campoAlloc: "esperienze" | "personalizzate"; nome: string }) => (
    <div className="mt-3 border-t border-line pt-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Barche per «{nome}»</p>
      {barche.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Non hai barche da noleggio: aggiungile dalla Flotta.</p>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          {barche.map((b) => (
            <label key={b.id} className={"flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium " + (allocBarca(b.id, codice, campoAlloc) ? "border-ocean bg-foam text-deep" : "border-line bg-white text-ink hover:border-ocean")}>
              <input type="checkbox" checked={allocBarca(b.id, codice, campoAlloc)} onChange={() => toggleBarca(b.id, codice, campoAlloc)} />
              {b.nome}
            </label>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-widest text-ocean">Marketplace</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Esperienze</h1>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
          Attiva le esperienze che offri e indica con quali barche le proponi: i clienti le ritroveranno come filtro nel marketplace.
        </p>
      </div>

      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      {ESPERIENZE.map((g) => (
        <section key={g.gruppo} className="card p-5">
          <h2 className="font-display text-base font-bold text-ink">{g.gruppo}</h2>
          <div className="mt-3 grid gap-2">
            {g.voci.map((v) => {
              const on = attive.includes(v.codice);
              return (
                <div key={v.codice} className={"rounded-2xl border p-3 " + (on ? "border-ocean bg-foam/40" : "border-line bg-white")}>
                  <label className="flex cursor-pointer items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-ink">{v.nome}</span>
                    <span className="flex items-center gap-2 text-xs font-bold">
                      {on ? "Attiva" : "Non attiva"}
                      <input type="checkbox" checked={on} onChange={() => toggleAttiva(v.codice, "esperienze")} />
                    </span>
                  </label>
                  {on && <BloccoBarche codice={v.codice} campoAlloc="esperienze" nome={v.nome} />}
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section className="card p-5">
        <h2 className="font-display text-base font-bold text-ink">Esperienze personalizzate</h2>
        <p className="mt-1 text-sm text-muted">Aggiungi attività non presenti nel catalogo (es. «Aperitivo a bordo»), poi assegna le barche.</p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="grid flex-1 gap-1 text-sm font-semibold">Nuova esperienza
            <input value={nuova} onChange={(e) => setNuova(e.target.value)} maxLength={80} placeholder="es. Aperitivo al tramonto" className={campo} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); aggiungiCustom(); } }} />
          </label>
          <button type="button" onClick={aggiungiCustom} disabled={nuova.trim().length < 2} className="btn-soft disabled:opacity-50">Aggiungi</button>
        </div>
        {custom.length === 0 ? (
          <p className="mt-3 text-sm text-muted">Nessuna esperienza personalizzata.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {custom.map((nome) => (
              <div key={nome} className="rounded-2xl border border-ocean bg-foam/40 p-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-ink">{nome}</span>
                  <button type="button" onClick={() => rimuoviCustom(nome)} className="text-xs font-bold text-danger">Rimuovi</button>
                </div>
                <BloccoBarche codice={nome} campoAlloc="personalizzate" nome={nome} />
              </div>
            ))}
          </div>
        )}
      </section>

      <div>
        <button type="button" disabled={busy} onClick={salva} className="btn-primary">{busy ? "Salvo…" : "Salva esperienze"}</button>
      </div>
    </div>
  );
}
