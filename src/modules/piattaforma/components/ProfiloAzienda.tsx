"use client";
import { useEffect, useState } from "react";
import { useUtente, ricaricaUtente } from "@/components/Utente";
import { SedeOperativa } from "@/components/SedeOperativa";
import { Avviso } from "@/components/ui/Avviso";

type Profilo = { nome: string; telefonoContatto: string | null; indirizzoPartenza: string | null; citta: string | null };

export function ProfiloAzienda() {
  const utente = useUtente();
  const [dati, setDati] = useState<Profilo | null>(null);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [salvando, setSalvando] = useState(false);
  const owner = utente?.role === "owner";

  useEffect(() => {
    let vivo = true;
    fetch("/api/v1/tenant").then(async (r) => {
      if (!r.ok) throw new Error("Non riesco a leggere i dati dell’azienda.");
      const j: Profilo = await r.json();
      if (vivo) setDati({ nome: j.nome, telefonoContatto: j.telefonoContatto, indirizzoPartenza: j.indirizzoPartenza, citta: j.citta });
    }).catch((e: Error) => { if (vivo) setErrore(e.message); });
    return () => { vivo = false; };
  }, []);

  const salva = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dati || salvando || !owner) return;
    setSalvando(true); setErrore(""); setMessaggio("");
    try {
      const r = await fetch("/api/v1/tenant", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dati) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Salvataggio non riuscito.");
      await ricaricaUtente();
      setMessaggio("Dati azienda aggiornati.");
    } catch (e) { setErrore(e instanceof Error ? e.message : "Connessione interrotta. Riprova."); }
    finally { setSalvando(false); }
  };

  return <div className="grid gap-4">
    <div><p className="text-sm text-muted">Impostazioni</p><h1 className="text-2xl">Dati dell’azienda</h1><p className="text-sm text-muted">Identità e contatti utilizzati nel gestionale e nei documenti dell’ormeggio.</p></div>
    {errore && <Avviso tono="errore">{errore}</Avviso>}
    {messaggio && <Avviso tono="ok">{messaggio}</Avviso>}
    {!dati ? <p className="text-sm text-muted">Caricamento…</p> : <form onSubmit={salva} className="card grid gap-4 p-5 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Nome azienda<input required minLength={2} maxLength={120} disabled={!owner || salvando} className="rounded-md border border-line p-2" value={dati.nome} onChange={(e) => setDati({ ...dati, nome: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Telefono<input type="tel" maxLength={40} disabled={!owner || salvando} className="rounded-md border border-line p-2" value={dati.telefonoContatto ?? ""} onChange={(e) => setDati({ ...dati, telefonoContatto: e.target.value || null })} /></label>
      <label className="grid gap-1 text-sm">Sede / punto di riferimento<input maxLength={200} disabled={!owner || salvando} className="rounded-md border border-line p-2" value={dati.indirizzoPartenza ?? ""} onChange={(e) => setDati({ ...dati, indirizzoPartenza: e.target.value || null })} /></label>
      <label className="grid gap-1 text-sm">Città / località<input maxLength={120} disabled={!owner || salvando} className="rounded-md border border-line p-2" value={dati.citta ?? ""} onChange={(e) => setDati({ ...dati, citta: e.target.value || null })} /></label>
      {owner && <button type="submit" className="btn-primary justify-self-start" disabled={salvando}>{salvando ? "Salvo…" : "Salva dati"}</button>}
    </form>}
    <SedeOperativa owner={owner} />
  </div>;
}
