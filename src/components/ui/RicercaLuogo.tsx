"use client";
import { useEffect, useRef, useState } from "react";

export type LuogoScelto = { placeId: string; nome: string; indirizzo: string | null; lat: number | null; lon: number | null };

// Ricerca dei luoghi (Google Places, lato server). Niente coordinate inserite a mano.
// Se la chiave non è configurata lo dice apertamente; il testo modificato dopo la
// selezione invalida il luogo scelto (niente coordinate abbinate a un testo nuovo).
export function RicercaLuogo({
  valore,
  onSeleziona,
  segnaposto = "Cerca il nome del porto, la località o l'indirizzo…",
}: {
  valore: LuogoScelto | null;
  onSeleziona: (l: LuogoScelto | null) => void;
  segnaposto?: string;
}) {
  const [q, setQ] = useState("");
  const [risultati, setRisultati] = useState<LuogoScelto[]>([]);
  const [configurato, setConfigurato] = useState(true);
  const [messaggio, setMessaggio] = useState("");
  const [busy, setBusy] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (q.trim().length < 3) { setRisultati([]); setMessaggio(""); return; }
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(async () => {
      setBusy(true);
      try {
        const r = await fetch(`/api/v1/luoghi/ricerca?q=${encodeURIComponent(q.trim())}`);
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setMessaggio(j.error ?? "Ricerca non riuscita."); setRisultati([]); return; }
        setConfigurato(j.configurato !== false);
        setMessaggio(j.messaggio ?? "");
        setRisultati(Array.isArray(j.luoghi) ? j.luoghi : []);
      } catch { setMessaggio("Ricerca non raggiungibile."); setRisultati([]); } finally { setBusy(false); }
    }, 350);
    return () => { if (timer.current) window.clearTimeout(timer.current); };
  }, [q]);

  if (valore) {
    return (
      <div className="rounded-2xl border border-ok-line bg-ok-soft p-3 text-sm">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-ok">{valore.nome}</p>
            {valore.indirizzo && <p className="text-xs text-muted">{valore.indirizzo}</p>}
            {valore.lat != null && valore.lon != null && <p className="text-[11px] text-muted">{valore.lat.toFixed(5)}, {valore.lon.toFixed(5)}</p>}
          </div>
          <button type="button" className="rounded-lg border border-line bg-white px-2 py-1 text-xs font-semibold text-ocean" onClick={() => onSeleziona(null)}>Cambia</button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-2">
      <input
        className="rounded-2xl border border-line p-3 text-sm"
        placeholder={segnaposto}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoComplete="off"
      />
      {busy && <p className="text-xs text-muted">Ricerca…</p>}
      {messaggio && <p className="rounded-xl bg-warn-soft p-2 text-xs text-warn">{messaggio}</p>}
      {!configurato && !messaggio && <p className="rounded-xl bg-warn-soft p-2 text-xs text-warn">Ricerca luoghi non configurata: chiedi all'amministratore di impostare GOOGLE_MAPS_API_KEY.</p>}
      {risultati.length > 0 && (
        <ul className="grid gap-1 rounded-2xl border border-line bg-white p-1">
          {risultati.map((l) => (
            <li key={l.placeId}>
              <button
                type="button"
                className="w-full rounded-xl px-3 py-2 text-left text-sm hover:bg-foam"
                onClick={() => { onSeleziona(l); setQ(""); setRisultati([]); }}
              >
                <span className="block font-semibold">{l.nome}</span>
                {l.indirizzo && <span className="block text-xs text-muted">{l.indirizzo}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
