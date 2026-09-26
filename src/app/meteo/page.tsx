"use client";
import { useEffect, useState } from "react";

type Giorno = { data: string; ventoMaxKmh: number; rafficaMaxKmh: number; ondaMaxM: number | null; pioggiaMm: number; livello: string; motivo: string };
type Barca = { boatId: string; barca: string; giorni: Giorno[]; errore?: string };
type Dati = { barche: Barca[]; messaggio?: string };

const giornoIt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });

export default function MeteoPage() {
  const [dati, setDati] = useState<Dati | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [boatId, setBoatId] = useState("");

  const load = () => {
    fetch(`/api/v1/meteo${boatId ? `?boatId=${boatId}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDati(j); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, [boatId]);

  const blocca = async (boatId: string, barca: string, giorno: Giorno) => {
    if (!confirm(`Bloccare ${barca} il ${giornoIt(giorno.data)} per condizioni sfavorevoli?`)) return;
    const startAt = new Date(`${giorno.data}T00:00:00`).toISOString();
    const endAt = new Date(`${giorno.data}T23:59:59`).toISOString();
    const r = await fetch("/api/v1/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boatId, startAt, endAt, motivo: `Meteo: ${giorno.motivo}` }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Blocco non riuscito"); return; }
    setErr(""); setMsg(`${barca} bloccata il ${giornoIt(giorno.data)}. La trovi in grigio nel Calendario.`);
  };

  const colore = (l: string) => (l === "ok" ? "badge-ready" : l === "attenzione" ? "badge-pending" : "bg-[#f9e4df] text-[#914435] rounded-full px-2 py-1 text-xs font-semibold");

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Meteo</p><h1 className="text-2xl">Vento e onde dei prossimi giorni.</h1></div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {dati?.messaggio && <p className="card p-3 text-sm text-muted">{dati.messaggio}</p>}

      {dati?.barche.map((b) => (
        <div key={b.boatId} className="card overflow-x-auto">
          <div className="border-b border-line p-3 text-sm font-bold">{b.barca}</div>
          {b.errore ? (
            <p className="p-3 text-sm text-coral">{b.errore}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted"><tr className="text-left">
                <th className="p-2">Giorno</th><th className="p-2">Vento max</th><th className="p-2">Raffiche</th>
                <th className="p-2">Onde max</th><th className="p-2">Pioggia</th><th className="p-2">Giudizio</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {b.giorni.map((g) => (
                  <tr key={g.data} className="border-t border-line">
                    <td className="p-2 font-semibold">{giornoIt(g.data)}</td>
                    <td className="p-2">{g.ventoMaxKmh} km/h</td>
                    <td className="p-2">{g.rafficaMaxKmh} km/h</td>
                    <td className="p-2">{g.ondaMaxM === null ? "—" : `${g.ondaMaxM} m`}</td>
                    <td className="p-2">{g.pioggiaMm} mm</td>
                    <td className="p-2"><span className={colore(g.livello)}>{g.livello}</span> <span className="text-xs text-muted">{g.motivo}</span></td>
                    <td className="p-2">
                      {g.livello !== "ok" && (
                        <button className="font-bold text-coral" onClick={() => blocca(b.boatId, b.barca, g)}>Blocca uscita</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ))}
      <p className="text-xs text-muted">Dati meteo da Open-Meteo (gratuito). Il giudizio è indicativo: la decisione di uscire resta sempre del noleggiatore.</p>
    </div>
  );
}
