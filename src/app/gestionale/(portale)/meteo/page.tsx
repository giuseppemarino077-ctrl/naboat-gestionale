"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { StatoVuoto } from "@/components/ui/StatoVuoto";
import { useConferma } from "@/components/ui/Dialogo";

type Giorno = { data: string; ventoMaxKmh: number; rafficaMaxKmh: number; ondaMaxM: number | null; pioggiaMm: number; livello: string; motivo: string };
type Luogo = { boatId?: string; barca?: string; nome: string; lat: number; lon: number; giorni: Giorno[]; aggiornatoAt: string; errore?: string };
type Dati = { luoghi: Luogo[]; messaggio?: string };

const giornoIt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const oraIt = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });

export default function MeteoPage() {
  const [dati, setDati] = useState<Dati | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [boatId, setBoatId] = useState("");
  const [portoId, setPortoId] = useState("");
  const [porti, setPorti] = useState<{ id: string; nome: string }[]>([]);
  const conferma = useConferma();

  const load = () => {
    const p = new URLSearchParams();
    if (boatId) p.set("boatId", boatId);
    if (portoId) p.set("portoId", portoId);
    fetch(`/api/v1/meteo${p.toString() ? `?${p.toString()}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDati(j); setErr(""); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, [boatId, portoId]);
  useEffect(() => { fetch("/api/v1/porti").then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setPorti(j)).catch(() => {}); }, []);

  const blocca = async (boatIdBlocco: string, barca: string, giorno: Giorno) => {
    const ok = await conferma.chiedi({
      titolo: `Bloccare ${barca}?`,
      messaggio: `La barca risulterà non disponibile il ${giornoIt(giorno.data)} per condizioni sfavorevoli.`,
      dettaglio: `Motivo: ${giorno.motivo}. Potrai rimuovere il blocco dal Calendario.`,
      confermaLabel: "Blocca uscita",
    });
    if (!ok) return;
    const startAt = new Date(`${giorno.data}T00:00:00`).toISOString();
    const endAt = new Date(`${giorno.data}T23:59:59`).toISOString();
    const r = await fetch("/api/v1/blocks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ boatId: boatIdBlocco, startAt, endAt, motivo: `Meteo: ${giorno.motivo}` }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Blocco non riuscito"); return; }
    setErr(""); setMsg(`${barca} bloccata il ${giornoIt(giorno.data)}. La trovi in grigio nel Calendario.`);
  };

  const colore = (l: string) => (l === "ok" ? "badge-ready" : l === "attenzione" ? "badge-pending" : "badge-info");

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Meteo</p><h1 className="text-2xl">Vento e onde dei prossimi giorni.</h1></div>
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      {porti.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="font-semibold">Base</label>
          <select className="rounded-full border border-line bg-white px-3 py-1.5" value={portoId} onChange={(e) => { setPortoId(e.target.value); setBoatId(""); }}>
            <option value="">Tutte le basi</option>
            {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}

      {dati?.messaggio && <Avviso tono="info">{dati.messaggio}</Avviso>}

      {dati && dati.luoghi.length === 0 && !dati.messaggio && (
        <StatoVuoto icona="barca" titolo="Nessuna località da controllare" testo="Imposta la località dell'attività o una base per le barche." azione={{ label: "Vai a Impostazioni", href: "/gestionale/impostazioni" }} />
      )}

      {dati?.luoghi.map((l, i) => (
        <div key={(l.boatId ?? "sede") + i} className="card overflow-x-auto">
          <div className="border-b border-line p-3 text-sm font-bold">
            {l.barca ? `${l.barca} · ` : ""}{l.nome}
            <span className="ml-2 text-xs font-normal text-muted">aggiornato alle {oraIt(l.aggiornatoAt)}</span>
          </div>
          {l.errore ? (
            <p className="p-3 text-sm text-danger">{l.errore}</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-muted"><tr className="text-left">
                <th className="p-2">Giorno</th><th className="p-2">Vento max</th><th className="p-2">Raffiche</th>
                <th className="p-2">Onde max</th><th className="p-2">Pioggia</th><th className="p-2">Giudizio</th><th className="p-2"></th>
              </tr></thead>
              <tbody>
                {l.giorni.map((g) => (
                  <tr key={g.data} className="border-t border-line">
                    <td className="p-2 font-semibold">{giornoIt(g.data)}</td>
                    <td className="p-2">{g.ventoMaxKmh} km/h</td>
                    <td className="p-2">{g.rafficaMaxKmh} km/h</td>
                    <td className="p-2">{g.ondaMaxM === null ? "—" : `${g.ondaMaxM} m`}</td>
                    <td className="p-2">{g.pioggiaMm} mm</td>
                    <td className="p-2"><span className={colore(g.livello)}>{g.livello}</span> <span className="text-xs text-muted">{g.motivo}</span></td>
                    <td className="p-2">
                      {g.livello !== "ok" && l.boatId && (
                        <button className="font-bold text-danger" onClick={() => blocca(l.boatId!, l.barca ?? l.nome, g)}>Blocca uscita</button>
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
      {conferma.dialogo}
    </div>
  );
}
