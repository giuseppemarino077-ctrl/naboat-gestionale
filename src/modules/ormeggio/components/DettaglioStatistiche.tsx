"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { Dialogo } from "@/components/ui/Dialogo";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";
import { data, euro, numero, nomiSaldi, queryStatistiche, titoliDettagli } from "@/modules/ormeggio/statistiche/presentazione";
import type { DettaglioStatistica, FiltriStatistiche, SelezioneStatistica } from "@/modules/ormeggio/statistiche/presentazione";

const spiegazioni = {
  incassi: "Pagamenti ricevuti meno rimborsi riusciti nel periodo. Le cauzioni sono escluse. Non vengono sottratti costi, IVA o commissioni.",
  residui: "Quanto manca da pagare sui contratti che comprendono almeno un giorno del periodo scelto. Il saldo è quello attuale, come in Economia: non indica necessariamente pagamenti scaduti.",
  occupazione: "Confrontiamo il tempo in cui i posti sono riservati con quello in cui sono disponibili. Per esempio, un posto riservato per 5 giorni su 10 vale il 50%. Una barca in mare mantiene la sua riserva.",
  contratti: "Contratti con inizio della permanenza nel periodo scelto, esclusi quelli annullati. La data della firma non cambia questo conteggio.",
  saldati: "Contratti presenti nel periodo che oggi non hanno importi da pagare. Sono inclusi i contratti gratuiti e quelli con un credito.",
  parziali: "Contratti presenti nel periodo con almeno un pagamento registrato e un importo ancora da pagare.",
  da_saldare: "Contratti presenti nel periodo con importi da pagare e nessun pagamento registrato.",
};

export function DettaglioStatistiche({ selezione, filtri, aggiornatoAt, onChiudi }: { selezione: SelezioneStatistica; filtri: FiltriStatistiche; aggiornatoAt: string; onChiudi: () => void }) {
  const [pagina, setPagina] = useState(1);
  const [dettaglio, setDettaglio] = useState<DettaglioStatistica | null>(null);
  const [errore, setErrore] = useState("");
  const [tentativo, setTentativo] = useState(0);
  const dal = selezione.dal ?? filtri.dal, al = selezione.al ?? filtri.al;
  useEffect(() => {
    const controller = new AbortController();
    const p = queryStatistiche({ ...filtri, dal, al });
    p.set(selezione.tipo in nomiSaldi ? "categoria" : "dettaglio", selezione.tipo);
    p.set("pagina", String(pagina));
    richiestaOrmeggio(`/api/v1/ormeggio/statistiche?${p}`, { signal: controller.signal, cache: "no-store" }).then(async (r) => {
      const j = await r.json();
      if (controller.signal.aborted) return;
      if (!r.ok) { setDettaglio(null); setErrore(j.error ?? "Dettaglio non disponibile"); return; }
      if (pagina > 1 && pagina > Math.max(1, Math.ceil(j.totale / j.perPagina))) { setPagina(Math.max(1, Math.ceil(j.totale / j.perPagina))); return; }
      setDettaglio(j); setErrore("");
    }).catch(() => { if (!controller.signal.aborted) { setDettaglio(null); setErrore("Connessione interrotta. Riprova per vedere i dati aggiornati."); } });
    return () => controller.abort();
  }, [filtri, dal, al, selezione.tipo, pagina, aggiornatoAt, tentativo]);
  const m = dettaglio?.metriche;
  const giorni = Math.round((+new Date(al) - +new Date(dal)) / 86400000) + 1;
  const riepilogo = !m ? null : selezione.tipo === "incassi" ? <><span>Ricevuti <b>{euro(m.ricevutiCent)}</b></span><span>− Rimborsi <b>{euro(m.rimborsatiCent)}</b></span><span>= Incassi netti <b>{euro(m.incassiCent)}</b></span></> : selezione.tipo === "occupazione" ? <><span>Posti riservati in media <b>{numero(m.riservati / giorni)}</b></span><span>Posti disponibili in media <b>{numero(m.disponibili / giorni)}</b></span><span>Occupazione <b>{numero(m.occupazione)}%</b></span></> : selezione.tipo === "contratti" ? <span>Contratti iniziati <b>{numero(m.contratti, 0)}</b></span> : selezione.tipo === "residui" ? <><span>Da incassare <b>{euro(m.residuoCent)}</b></span><span>Crediti dei clienti <b>{euro(m.creditoCent)}</b></span></> : <span>Contratti <b>{numero(dettaglio?.totale, 0)}</b></span>;
  return <Dialogo aperto onChiudi={onChiudi} titolo={titoliDettagli[selezione.tipo]} larghezza="max-w-3xl">
    <div className="max-h-[75dvh] overflow-y-auto overscroll-contain pr-1">
      <p className="text-xs font-semibold text-ocean">{data(dal)} – {data(al)} · sola lettura</p>
      <p className="mt-2 text-sm leading-relaxed text-muted">{spiegazioni[selezione.tipo]}</p>
      {errore && <div className="mt-3"><Avviso tono="errore" azione={<button className="btn-soft" onClick={() => setTentativo((v) => v + 1)}>Riprova</button>}>{errore}</Avviso></div>}
      {!dettaglio && !errore && <p role="status" className="py-8 text-center text-muted">Caricamento…</p>}
      {dettaglio && <>
        <div className="my-4 flex flex-wrap gap-x-5 gap-y-2 rounded-2xl bg-foam p-4 text-sm">{riepilogo}</div>
        {selezione.tipo === "incassi" && dettaglio.copertura.pagamentiSenzaData > 0 && <Avviso tono="attenzione">{dettaglio.copertura.pagamentiSenzaData} movimenti senza data: il totale non è disponibile. Qui sotto trovi i movimenti con data certa.</Avviso>}
        {selezione.tipo === "occupazione" && <p className="mb-3 text-xs text-muted">I giorni disponibili escludono i blocchi registrati. Contiamo soltanto le aree e i posti ancora presenti nel profilo.</p>}
        <div className="grid gap-2">
          {dettaglio.righe.map((r) => <article key={r.id} className="rounded-xl border border-line p-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-semibold text-deep">{r.titolo}</h3><p className="mt-1 text-xs text-muted">{r.sottotitolo}</p></div>{r.importoCent != null && <b className={r.importoCent < 0 ? "text-coral" : "text-deep"}>{euro(r.importoCent)}</b>}{r.residuoCent != null && <b>Da pagare {euro(r.residuoCent)}</b>}{r.disponibili != null && <b>{r.occupazione == null ? "Non disponibile" : `${numero(r.occupazione)}%`}</b>}</div>
            {r.data && <p className="mt-2 text-xs text-muted">{data(r.data)}</p>}
            {r.inizioAt && <p className="mt-2 text-xs text-muted">{data(r.inizioAt)} – {r.fineAt ? data(r.fineAt) : "Senza data di fine"}</p>}
            {r.addebitatoCent != null && <p className="mt-2 text-xs">Addebitato {euro(r.addebitatoCent)} · Pagato {euro(r.pagatoCent)}{r.creditoCent ? ` · Credito ${euro(r.creditoCent)}` : ""}</p>}
            {r.disponibili != null && <p className="mt-2 text-xs">{numero(r.riservati)} giorni riservati su {numero(r.disponibili)} disponibili</p>}
            {r.permanenzaId && <Link className="mt-2 inline-block text-xs font-semibold text-ocean underline underline-offset-4" href={`/gestionale/ormeggio/permanenza/${r.permanenzaId}`}>Apri scheda barca →</Link>}
          </article>)}
          {!dettaglio.totale && <p className="rounded-xl bg-foam/50 p-6 text-center text-muted">Nessun elemento per questi filtri.</p>}
        </div>
        {dettaglio.totale > dettaglio.perPagina && <div className="mt-4 flex items-center justify-between gap-2"><button className="btn-soft" disabled={pagina === 1} onClick={() => { setDettaglio(null); setPagina(pagina - 1); }}>Precedenti</button><span className="text-xs">{pagina} / {Math.ceil(dettaglio.totale / dettaglio.perPagina)}</span><button className="btn-soft" disabled={pagina * dettaglio.perPagina >= dettaglio.totale} onClick={() => { setDettaglio(null); setPagina(pagina + 1); }}>Successive</button></div>}
      </>}
    </div>
  </Dialogo>;
}
