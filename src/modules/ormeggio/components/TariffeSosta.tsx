"use client";
import { useRef, useState } from "react";
import { Icona } from "@/components/ui/Icona";
import { segnalaCambiamento } from "@/lib/aggiorna";
import { centDaEuro, euroCampo, tariffaSosta, type PeriodoTariffa } from "@/modules/ormeggio/tariffe";
import { useCatalogoServizi, type ServizioOrmeggio } from "@/modules/ormeggio/use-catalogo-servizi";

function BarraTariffa({ periodo, servizio, catalogo }: { periodo: PeriodoTariffa; servizio?: ServizioOrmeggio; catalogo: ReturnType<typeof useCatalogoServizi> }) {
  const [bozza, setBozza] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [errore, setErrore] = useState("");
  const [salvato, setSalvato] = useState(false);
  const inCorso = useRef(false);
  const valore = bozza ?? euroCampo(servizio?.prezzoCent ?? null);
  const mensile = periodo === "mensile";
  const etichetta = mensile ? "TARIFFA MENSILE" : "TARIFFA GIORNALIERA";
  const campoId = `costo-${mensile ? "mensile" : "giornaliero"}-sosta`;

  const salva = async () => {
    if (inCorso.current || bozza === null || !catalogo.puoModificare || !catalogo.vedeImporti || catalogo.caricamento || catalogo.errore) return;
    setErrore(""); setSalvato(false);
    let prezzoCent: number | null;
    try { prezzoCent = centDaEuro(valore); }
    catch (e) { setErrore(e instanceof Error ? e.message : "Importo non valido."); return; }
    if (prezzoCent === (servizio?.prezzoCent ?? null)) { setBozza(null); return; }
    inCorso.current = true; setBusy(true);
    try {
      const r = await fetch(`/api/v1/ormeggio/servizi${servizio ? `/${servizio.id}` : ""}`, {
        method: servizio ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(servizio ? { prezzoCent } : { nome: mensile ? "Ormeggio mensile" : "Ormeggio giornaliero", unita: mensile ? "mese" : "giorno", prezzoCent }),
      });
      const j = await r.json();
      if (!r.ok) { setErrore(j.error ?? "Non riesco a salvare la tariffa."); return; }
      await catalogo.carica();
      setBozza(null); setSalvato(true);
      segnalaCambiamento("ormeggio");
    } catch { setErrore("Connessione interrotta. Ricarica le tariffe per controllare il salvataggio."); }
    finally { inCorso.current = false; setBusy(false); }
  };

  return <form aria-label={etichetta} aria-busy={busy} onSubmit={(e) => { e.preventDefault(); void salva(); }} className="grid min-w-0 gap-2 rounded-3xl border border-ocean/15 bg-gradient-to-br from-white to-[#eaf7f5] p-4 shadow-sm">
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
      <label htmlFor={campoId} className="text-xs font-bold uppercase tracking-widest text-ocean">{etichetta}</label>
      <div className="flex w-full min-w-0 items-center gap-2 rounded-2xl border border-ocean/20 bg-white px-3 focus-within:ring-2 focus-within:ring-ocean/30 sm:w-64">
        <span aria-hidden="true" className="text-muted">€</span>
        <input id={campoId} aria-label={etichetta} aria-describedby={`${campoId}-stato`} aria-invalid={!!errore} title="Salva uscendo dal campo o premendo Invio" className="min-w-0 w-full bg-transparent py-3 text-lg font-bold text-deep outline-none" inputMode="decimal" maxLength={16} placeholder="Da definire" readOnly={!catalogo.puoModificare || busy || catalogo.caricamento || !!catalogo.errore} value={valore} onChange={(e) => { setBozza(e.target.value); setErrore(""); setSalvato(false); }} onBlur={() => void salva()} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void salva(); } }} />
        <span className="flex h-5 w-5 shrink-0 items-center justify-center text-ocean" aria-hidden="true">{busy ? <Icona nome="caricamento" className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : salvato ? <Icona nome="check" className="h-4 w-4" /> : null}</span>
      </div>
    </div>
    <span id={`${campoId}-stato`} role="status" className="sr-only">{busy ? "Salvataggio in corso" : salvato ? `${etichetta} salvata` : "Salvataggio uscendo dal campo o premendo Invio"}</span>
    {errore && <p role="alert" className="text-sm font-semibold text-coral">{errore} <button type="button" className="underline" onClick={() => void salva()}>Riprova</button></p>}
  </form>;
}

export function TariffeSosta() {
  const catalogo = useCatalogoServizi();
  return <section aria-label="Tariffe della sosta" className="grid min-w-0 gap-3">
    {(["giornaliera", "mensile"] as const).map((periodo) => {
      const servizio = tariffaSosta(catalogo.servizi, periodo);
      return <BarraTariffa key={`${periodo}-${servizio?.id ?? "nuovo"}`} periodo={periodo} servizio={servizio} catalogo={catalogo} />;
    })}
    {catalogo.errore && <div role="alert" className="text-sm text-coral">{catalogo.errore} <button type="button" className="font-bold underline" onClick={() => catalogo.prepara()}>Riprova</button></div>}
  </section>;
}
