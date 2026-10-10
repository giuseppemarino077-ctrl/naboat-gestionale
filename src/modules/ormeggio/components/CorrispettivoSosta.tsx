"use client";
import { useState } from "react";
import { centDaEuro, euroCampo } from "@/modules/ormeggio/tariffe";

export function CorrispettivoSosta({ cent, puoModificare, busy, onSalva, contrattoPresente }: { cent: number | null; puoModificare: boolean; busy: boolean; onSalva: (cent: number) => Promise<boolean>; contrattoPresente: boolean }) {
  const [bozza, setBozza] = useState<string | null>(null);
  const [errore, setErrore] = useState("");
  const valore = bozza ?? euroCampo(cent);
  return <form aria-label="Prezzo della sosta" className="grid gap-2 rounded-2xl border border-line bg-foam/40 p-3" onSubmit={async (e) => {
    e.preventDefault();
    if (busy || !puoModificare) return;
    setErrore("");
    let prezzo: number | null;
    try { prezzo = centDaEuro(valore); if (prezzo === null) throw new Error("Indica il prezzo concordato per la sosta."); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Prezzo non valido."); return; }
    if (await onSalva(prezzo)) setBozza(null);
  }}>
    <label className="grid gap-1 text-xs font-semibold text-muted" htmlFor="prezzo-sosta-scheda">Corrispettivo concordato (€)<input id="prezzo-sosta-scheda" className="campo" inputMode="decimal" placeholder="Da definire" value={valore} readOnly={busy || !puoModificare} onChange={(e) => { setBozza(e.target.value); setErrore(""); }} /></label>
    {puoModificare && <button type="submit" className="btn-soft justify-self-start" disabled={busy || bozza === null}>Salva prezzo</button>}
    <p className="text-xs text-muted">La modifica aggiorna anche il conto della sosta con una rettifica tracciata.{contrattoPresente ? " I documenti già generati conservano la loro versione; usa Contratto per aggiornare quelli non firmati." : ""}</p>
    {errore && <p role="alert" className="text-sm font-semibold text-coral">{errore}</p>}
  </form>;
}
