"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { StatoVuoto } from "@/components/ui/StatoVuoto";
import { Icona } from "@/components/ui/Icona";
import { useModulo } from "@/components/ui/ModuloDialogo";
import { RicercaLuogo, type LuogoScelto } from "@/components/ui/RicercaLuogo";
import { useUtente } from "@/components/Utente";
import { segnalaCambiamento } from "@/lib/aggiorna";

type Giorno = { data: string; ventoMaxKmh: number; rafficaMaxKmh: number; ondaMaxM: number | null; pioggiaMm: number; livello: string; motivo: string };
type Luogo = { boatId?: string; barca?: string; nome: string; lat: number; lon: number; giorni: Giorno[]; aggiornatoAt: string; errore?: string };
type Dati = { luoghi: Luogo[]; messaggio?: string; serveLocalita?: boolean };

const TUTTE = "__tutte__";

const giornoIt = (s: string) => new Date(s + "T12:00:00").toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
const oraIt = (iso: string) => new Date(iso).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
const numero = (s: string) => { const n = Number(s.replace(",", ".")); return s.trim() !== "" && Number.isFinite(n) ? n : null; };

export default function MeteoPage() {
  const [dati, setDati] = useState<Dati | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [portoId, setPortoId] = useState("");
  const [porti, setPorti] = useState<{ id: string; nome: string }[]>([]);
  const [flotta, setFlotta] = useState<{ id: string; nome: string; portoId: string | null }[]>([]);
  const [apriLocalita, setApriLocalita] = useState(false);
  const [nomeSede, setNomeSede] = useState("");
  const [luogo, setLuogo] = useState<LuogoScelto | null>(null);
  const [manuale, setManuale] = useState(false);
  const [lat, setLat] = useState("");
  const [lon, setLon] = useState("");
  const [errSede, setErrSede] = useState("");
  const [msgSede, setMsgSede] = useState("");
  const [salvandoSede, setSalvandoSede] = useState(false);
  const [bloccando, setBloccando] = useState(false);
  const modulo = useModulo();
  const utente = useUtente();
  const owner = utente?.role === "owner" || utente?.role === "superadmin";

  const load = () => {
    const p = new URLSearchParams();
    if (portoId) p.set("portoId", portoId);
    fetch(`/api/v1/meteo${p.toString() ? `?${p.toString()}` : ""}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setDati(j); setErr(""); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, [portoId]);
  useEffect(() => { fetch("/api/v1/porti").then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setPorti(j)).catch(() => {}); }, []);
  useEffect(() => { fetch("/api/v1/boats?uso=noleggio").then((r) => (r.ok ? r.json() : [])).then((j) => { const lista = Array.isArray(j) ? j : j?.items ?? []; setFlotta(lista.map((b: { id: string; nome: string; portoId?: string | null }) => ({ id: b.id, nome: b.nome, portoId: b.portoId ?? null }))); }).catch(() => {}); }, []);

  useEffect(() => {
    fetch("/api/v1/tenant").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j) return;
      setNomeSede(j.sedeOperativaNome ?? "");
      if (j.sedeOperativaLat != null && j.sedeOperativaLon != null) {
        setLat(String(j.sedeOperativaLat));
        setLon(String(j.sedeOperativaLon));
        setLuogo({ placeId: j.sedeOperativaPlaceId ?? "manuale", nome: j.sedeOperativaNome ?? "Sede operativa", indirizzo: null, lat: j.sedeOperativaLat, lon: j.sedeOperativaLon });
      }
    }).catch(() => {});
  }, []);

  const salvaLocalita = async () => {
    if (!owner) return;
    const latEff = manuale ? numero(lat) : luogo?.lat ?? null;
    const lonEff = manuale ? numero(lon) : luogo?.lon ?? null;
    if (latEff == null || lonEff == null) { setMsgSede(""); setErrSede("Indica la località oppure inserisci latitudine e longitudine."); return; }
    setSalvandoSede(true); setErrSede(""); setMsgSede("");
    const r = await fetch("/api/v1/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sedeOperativaNome: ((!manuale && luogo?.nome) ? luogo.nome : (nomeSede || "Base operativa")).trim() || null,
        sedeOperativaLat: latEff,
        sedeOperativaLon: lonEff,
        sedeOperativaPlaceId: manuale ? null : luogo?.placeId ?? null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setSalvandoSede(false);
    if (!r.ok) { setErrSede(j.error ?? "Salvataggio non riuscito."); return; }
    setNomeSede(j.sedeOperativaNome ?? "");
    if (j.sedeOperativaLat != null && j.sedeOperativaLon != null) {
      setLat(String(j.sedeOperativaLat));
      setLon(String(j.sedeOperativaLon));
      setLuogo({ placeId: j.sedeOperativaPlaceId ?? "manuale", nome: j.sedeOperativaNome ?? "Sede operativa", indirizzo: null, lat: j.sedeOperativaLat, lon: j.sedeOperativaLon });
    }
    setMsgSede("Località salvata: le previsioni sono aggiornate.");
    load();
  };

  const blocca = async (giorno: Giorno) => {
    const candidate = portoId ? flotta.filter((b) => b.portoId === portoId) : flotta;
    if (!candidate.length) { setErr("Nessuna barca del noleggio da bloccare per questa base."); return; }
    const scelta = await modulo.apri(
      `Blocca uscita · ${giornoIt(giorno.data)}`,
      [{
        nome: "boatId",
        etichetta: "Barca",
        opzioni: [
          { valore: TUTTE, label: `Tutte le barche (${candidate.length})` },
          ...candidate.map((b) => ({ valore: b.id, label: b.nome })),
        ],
      }],
      { confermaLabel: "Blocca uscita", descrizione: `Condizioni: ${giorno.motivo}. Il blocco copre l'intera giornata e compare subito nel Calendario.` },
    );
    if (!scelta) return;

    const daBloccare = scelta.boatId === TUTTE ? candidate : candidate.filter((b) => b.id === scelta.boatId);
    if (!daBloccare.length) { setErr("Nessuna barca selezionata."); return; }

    const startAt = new Date(`${giorno.data}T00:00:00`).toISOString();
    const endAt = new Date(`${giorno.data}T23:59:59`).toISOString();
    let fatte = 0;
    const errori: string[] = [];
    setBloccando(true);
    setMsg(daBloccare.length > 1 ? `Blocco in corso su ${daBloccare.length} barche…` : "Blocco in corso…");
    try {
      for (const b of daBloccare) {
        const r = await fetch("/api/v1/blocks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ boatId: b.id, startAt, endAt, motivo: `Meteo: ${giorno.motivo}` }),
        });
        if (r.ok) fatte++;
        else { const j = await r.json().catch(() => ({})); errori.push(`${b.nome}: ${j.error ?? "non bloccata"}`); }
      }
    } finally {
      setBloccando(false);
    }

    setErr("");
    setMsg(
      daBloccare.length === 1
        ? `${daBloccare[0].nome} bloccata il ${giornoIt(giorno.data)}. La trovi in grigio nel Calendario.`
        : `${fatte} barche bloccate il ${giornoIt(giorno.data)}${errori.length ? `, ${errori.length} non bloccate (${errori.join("; ")})` : ""}.`,
    );
    if (fatte) segnalaCambiamento("prenotazioni");
  };

  const cambiaModo = () => {
    if (!manuale && luogo) { setLat(String(luogo.lat ?? "")); setLon(String(luogo.lon ?? "")); }
    setManuale((m) => !m);
  };

  const colore = (l: string) => (l === "ok" ? "badge-ready" : l === "attenzione" ? "badge-pending" : "badge-info");

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">Meteo</p><h1 className="text-2xl">Vento e onde dei prossimi giorni.</h1><p className="mt-1 text-sm text-muted">Previsione unica riferita alla base del noleggio.</p></div>
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <details className="card p-4 sm:p-5" open={apriLocalita} onToggle={(e) => setApriLocalita(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2 font-display text-base font-bold"><Icona nome="pin" className="h-5 w-5 text-ocean" /> Imposta località</span>
          <span className="truncate text-xs text-muted">{nomeSede || "Nessuna località impostata"}</span>
        </summary>
        <div className="mt-3 grid gap-3">
          <p className="text-sm text-muted">Base unica usata per le previsioni del noleggio. Non è la sede legale.</p>
          {errSede && <Avviso tono="errore">{errSede}</Avviso>}
          {msgSede && <Avviso tono="ok">{msgSede}</Avviso>}
          {!owner && <p className="text-xs text-muted">Solo il titolare dell&apos;azienda può modificare la località.</p>}
          {manuale ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-muted">Latitudine</span>
                <input className="campo" inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="es. 40.8333" disabled={!owner} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-muted">Longitudine</span>
                <input className="campo" inputMode="decimal" value={lon} onChange={(e) => setLon(e.target.value)} placeholder="es. 14.2500" disabled={!owner} />
              </label>
            </div>
          ) : (
            <div className="grid gap-2">
              <span className="text-xs font-semibold text-muted">Località (ricerca)</span>
              <RicercaLuogo valore={luogo} onSeleziona={(l) => { setLuogo(l); if (l?.nome) setNomeSede(l.nome); }} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="text-xs font-bold text-ocean" onClick={cambiaModo}>{manuale ? "Cerca la località per nome" : "Inserisci le coordinate a mano"}</button>
            <button type="button" className="btn-primary" disabled={!owner || salvandoSede} onClick={salvaLocalita}>{salvandoSede ? "Salvo…" : "Salva località"}</button>
          </div>
        </div>
      </details>

      {porti.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="font-semibold">Base</label>
          <select className="rounded-full border border-line bg-white px-3 py-1.5" value={portoId} onChange={(e) => setPortoId(e.target.value)}>
            <option value="">Base del noleggio</option>
            {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      )}

      {dati?.messaggio && (
        <Avviso
          tono="info"
          azione={dati.serveLocalita && owner ? <button className="btn-soft shrink-0" onClick={() => setApriLocalita(true)}>Imposta località</button> : undefined}
        >
          {dati.messaggio}
        </Avviso>
      )}

      {dati && dati.luoghi.length === 0 && !dati.messaggio && (
        <StatoVuoto icona="meteo" titolo="Nessuna base impostata" testo="Imposta la base del noleggio per vedere la previsione." azione={{ label: "Imposta località", onClick: () => setApriLocalita(true) }} />
      )}

      {dati?.luoghi.map((l, i) => (
        <div key={(l.boatId ?? "sede") + i} className="card overflow-x-auto">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line p-3 text-sm font-bold">
            <span>{l.nome}</span>
            <span className="text-xs font-normal text-muted">{l.lat.toFixed(4)}, {l.lon.toFixed(4)} · aggiornato alle {oraIt(l.aggiornatoAt)}</span>
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
                      {g.livello !== "ok" && (
                        <button className="font-bold text-danger disabled:opacity-50" disabled={bloccando} onClick={() => blocca(g)}>Blocca uscita</button>
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
      {modulo.dialogo}
    </div>
  );
}
