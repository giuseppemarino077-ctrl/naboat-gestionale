"use client";
import { useEffect, useMemo, useState } from "react";

type Skipper = { id: string; nome: string; telefono: string | null; orePeriodo: number; uscite: number };
type Booking = { id: string; skipperId: string | null; startAt: string; endAt: string; stato: string; clienteNome: string | null; passeggeri: number; boat: { nome: string } };
type Dati = { from: string; to: string; skippers: Skipper[]; bookings: Booking[]; senzaSkipper: number };

const iso = (d: Date) => d.toISOString().slice(0, 10);

export default function TurniPage() {
  const [offset, setOffset] = useState(0);
  const [dati, setDati] = useState<Dati | null>(null);
  const [err, setErr] = useState("");

  const giorni = useMemo(() => {
    const lunedi = new Date();
    lunedi.setHours(0, 0, 0, 0);
    lunedi.setDate(lunedi.getDate() - ((lunedi.getDay() + 6) % 7) + offset * 7);
    return [...Array(7)].map((_, i) => {
      const d = new Date(lunedi);
      d.setDate(d.getDate() + i);
      return d;
    });
  }, [offset]);

  useEffect(() => {
    const from = new Date(giorni[0]).toISOString();
    const to = new Date(giorni[6].getTime() + 86400000 - 1).toISOString();
    fetch(`/api/v1/turni?from=${from}&to=${to}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDati(j); })
      .catch((e) => setErr(e.message));
  }, [giorni]);

  const stessoGiorno = (isoData: string, d: Date) => new Date(isoData).toISOString().slice(0, 10) === iso(d);

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Turni skipper</p><h1 className="text-2xl">Chi è in mare, giorno per giorno.</h1></div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      {dati && dati.senzaSkipper > 0 && (
        <p className="card p-3 text-sm badge-pending w-fit">{dati.senzaSkipper} prenotazioni senza skipper nel periodo</p>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <button className="rounded-md border border-line px-2" onClick={() => setOffset(offset - 1)}>‹</button>
          <strong className="text-sm">Settimana {iso(giorni[0])} – {iso(giorni[6])}</strong>
          <button className="rounded-md border border-line px-2" onClick={() => setOffset(offset + 1)}>›</button>
          <button className="ml-auto text-sm font-bold text-ocean" onClick={() => setOffset(0)}>Questa settimana</button>
        </div>
        <div className="grid min-w-[760px]" style={{ gridTemplateColumns: `1.4fr repeat(7,1fr)` }}>
          <div className="border-b border-line p-2 text-xs text-muted">SKIPPER</div>
          {giorni.map((d) => (
            <div key={+d} className="border-b border-line p-2 text-center text-xs text-muted">
              {d.toLocaleDateString("it", { weekday: "short" })} {d.getDate()}
            </div>
          ))}
          {(dati?.skippers ?? []).map((s) => (
            <div key={s.id} className="contents">
              <div className="border-b border-line p-3 text-sm">
                <strong>{s.nome}</strong><br />
                <small className="text-muted">{s.uscite} uscite · {s.orePeriodo} ore</small>
              </div>
              {giorni.map((d) => (
                <div key={s.id + iso(d)} className="grid content-start gap-1 border-b border-l border-line/60 p-1">
                  {(dati?.bookings ?? [])
                    .filter((b) => b.skipperId === s.id && stessoGiorno(b.startAt, d))
                    .map((b) => (
                      <div key={b.id} className="rounded bg-[#dceff4] p-1.5 text-[11px] text-[#145c72]">
                        {new Date(b.startAt).toISOString().slice(11, 16)} · {b.boat.nome}
                        <div className="text-[10px]">{b.clienteNome ?? ""} ({b.passeggeri})</div>
                      </div>
                    ))}
                </div>
              ))}
            </div>
          ))}
          {!dati?.skippers.length && <div className="col-span-8 p-3 text-sm text-muted">Aggiungi skipper in Flotta per vedere i turni.</div>}
        </div>
      </div>
      <p className="text-xs text-muted">Il turno nasce dalla prenotazione: assegni lo skipper dal Calendario e compare qui.</p>
    </div>
  );
}
