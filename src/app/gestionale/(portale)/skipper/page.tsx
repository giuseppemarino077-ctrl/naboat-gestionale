"use client";
import { useEffect, useMemo, useState } from "react";
import { useUtente } from "@/components/Utente";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import {
  aggiungiGiorni,
  etichettaGiorno,
  fineGiorno,
  giornoDi,
  inizioGiorno,
  lunediDi,
  oggi as oggiKey,
  oreDi,
} from "@/lib/calendario";

type Skipper = { id: string; nome: string; telefono: string | null; orePeriodo: number; uscite: number };
type Booking = {
  id: string;
  skipperId: string | null;
  startAt: string;
  endAt: string;
  stato: string;
  clienteNome: string | null;
  passeggeri: number;
  boat: { nome: string };
};
type Dati = { from: string; to: string; skippers: Skipper[]; bookings: Booking[]; senzaSkipper: number };

const COLORI = [
  { sfondo: "bg-[#dceff4]", testo: "text-[#145c72]" },
  { sfondo: "bg-[#e3f2e6]", testo: "text-[#1f6b3a]" },
  { sfondo: "bg-[#fdeede]", testo: "text-[#8a4b12]" },
  { sfondo: "bg-[#ece5f6]", testo: "text-[#5b3a8a]" },
  { sfondo: "bg-[#fbe4e9]", testo: "text-[#8f2941]" },
];

export default function SkipperPage() {
  const utente = useUtente();
  const [lunedi, setLunedi] = useState(() => lunediDi(oggiKey()));
  const [dati, setDati] = useState<Dati | null>(null);
  const [errore, setErrore] = useState("");
  const [filtro, setFiltro] = useState("");

  const giorni = useMemo(() => [...Array(7)].map((_, i) => aggiungiGiorni(lunedi, i)), [lunedi]);

  useEffect(() => {
    const from = inizioGiorno(giorni[0]).toISOString();
    const to = fineGiorno(giorni[6]).toISOString();
    let vivo = true;
    setDati(null);
    fetch(`/api/v1/turni?from=${from}&to=${to}`)
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error ?? "Errore nel caricamento");
        if (vivo) {
          setDati(j);
          setErrore("");
        }
      })
      .catch((e) => {
        if (vivo) setErrore(e.message);
      });
    return () => {
      vivo = false;
    };
  }, [giorni]);

  const skippers = dati?.skippers ?? [];
  const visibili = filtro ? skippers.filter((s) => s.id === filtro) : skippers;
  const indiceSkipper = (id: string) => Math.max(0, skippers.findIndex((s) => s.id === id)) % COLORI.length;
  const oggi = oggiKey();
  const eSkipper = utente?.role === "skipper";

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-ocean">Turni skipper</p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink">Skipper</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-muted">
            Una riga per skipper, sette giorni in orizzontale: le uscite assegnate alle prenotazioni, a colpo d&apos;occhio.
          </p>
        </div>
        {!eSkipper && skippers.length > 0 && (
          <label className="grid gap-1 text-xs font-semibold text-muted">
            Skipper
            <select className="campo min-w-48" value={filtro} onChange={(e) => setFiltro(e.target.value)}>
              <option value="">Tutti</option>
              {skippers.map((s) => (
                <option key={s.id} value={s.id}>{s.nome}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      {errore && <Avviso tono="errore">{errore}</Avviso>}
      {dati && dati.senzaSkipper > 0 && (
        <Avviso tono="attenzione">
          {dati.senzaSkipper} {dati.senzaSkipper === 1 ? "prenotazione senza skipper" : "prenotazioni senza skipper"} nel periodo.
        </Avviso>
      )}

      {!dati && !errore && <Caricamento testo="Carico i turni…" />}

      {dati && (
        <div className="card overflow-x-auto">
          <div className="flex flex-wrap items-center gap-2 border-b border-line p-3">
            <button type="button" aria-label="Settimana precedente" className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white font-bold" onClick={() => setLunedi(aggiungiGiorni(lunedi, -7))}>‹</button>
            <strong className="text-sm">
              {etichettaGiorno(giorni[0])} – {etichettaGiorno(giorni[6])}
            </strong>
            <button type="button" aria-label="Settimana successiva" className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-white font-bold" onClick={() => setLunedi(aggiungiGiorni(lunedi, 7))}>›</button>
            <button type="button" className="ml-auto text-sm font-bold text-ocean" onClick={() => setLunedi(lunediDi(oggi))}>Questa settimana</button>
          </div>

          <div className="grid min-w-[760px]" style={{ gridTemplateColumns: "1.4fr repeat(7,1fr)" }}>
            <div className="border-b border-line p-2 text-xs font-semibold uppercase text-muted">Skipper</div>
            {giorni.map((d) => (
              <div key={d} className={"border-b border-line p-2 text-center text-xs " + (d === oggi ? "font-bold text-ocean" : "text-muted")}>
                {etichettaGiorno(d, { weekday: "short" })} {d.slice(8, 10)}
              </div>
            ))}

            {visibili.map((s) => (
              <div key={s.id} className="contents">
                <div className="border-b border-line p-3 text-sm">
                  <strong>{s.nome}</strong>
                  {s.telefono && <span className="block text-xs text-muted">{s.telefono}</span>}
                  <small className="text-muted">{s.uscite} uscite · {s.orePeriodo} ore</small>
                </div>
                {giorni.map((d) => (
                  <div key={s.id + d} className={"grid content-start gap-1 border-b border-l border-line/60 p-1 " + (d === oggi ? "bg-foam/40" : "")}>
                    {(dati.bookings ?? [])
                      .filter((b) => b.skipperId === s.id && giornoDi(b.startAt) === d)
                      .map((b) => (
                        <div key={b.id} className={"rounded p-1.5 text-[11px] " + COLORI[indiceSkipper(s.id)].sfondo + " " + COLORI[indiceSkipper(s.id)].testo}>
                          {oreDi(b.startAt)} · {b.boat.nome}
                          <div className="text-[10px]">
                            {b.clienteNome ?? "Cliente"} ({b.passeggeri})
                          </div>
                        </div>
                      ))}
                  </div>
                ))}
              </div>
            ))}

            {visibili.length === 0 && (
              <div className="col-span-8 p-4 text-sm text-muted">
                {filtro ? "Nessuna uscita per lo skipper scelto in questa settimana." : "Nessuno skipper attivo in questa settimana."}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-muted">Il turno nasce dalla prenotazione: assegni lo skipper dal Calendario e compare qui.</p>
    </div>
  );
}
