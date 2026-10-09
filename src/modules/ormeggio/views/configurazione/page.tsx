"use client";
import { useUtente } from "@/components/Utente";
import { IntestazioneOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Icona } from "@/components/ui/Icona";
import { Dialogo, useConferma } from "@/components/ui/Dialogo";

type Servizio = { id: string; nome: string; prezzoCent: number | null; unita: string | null };
type Posto = { id: string; riga: number; colonna: number; codice: string; bloccato: boolean };
type Area = { id: string; nome: string; righe: number; colonne: number; ordine: number; posti: Posto[] };

export default function ConfigurazioneOrmeggioPage() {
  const [aree, setAree] = useState<Area[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nome: "", righe: 4, colonne: 6 });
  const [servizi, setServizi] = useState<Servizio[]>([]);
  const [servizioId, setServizioId] = useState<string | null>(null);
  const [cercaServizio, setCercaServizio] = useState("");
  const [sv, setSv] = useState({ nome: "", prezzoEuro: "", unita: "" });
  const conferma = useConferma();
  const utente = useUtente();
  const vedeImporti = utente?.vedeImporti === true;
  const ruolo = utente?.role;
  const [sezione, setSezione] = useState("aree");
  const [busy, setBusy] = useState(false);

  const load = () =>
    fetch("/api/v1/ormeggio/aree")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) { setAree(j); setErr(""); } else setErr(j.error ?? "Errore"); })
      .catch(() => setErr("Errore di caricamento"));
  const loadServizi = () => fetch("/api/v1/ormeggio/servizi").then((r) => r.json()).then((j) => Array.isArray(j) && setServizi(j)).catch(() => {});
  useEffect(() => { load(); loadServizi(); }, []);
  useEffect(() => {
    if (!ruolo || ruolo === "skipper") return;
    fetch("/api/v1/ormeggio/servizi/predefiniti", { method: "POST" }).then(async (r) => { if (!r.ok) throw new Error("Catalogo non inizializzato"); await loadServizi(); }).catch(() => setErr("Non riesco a preparare il catalogo servizi. Riapri la pagina per riprovare."));
  }, [ruolo]);

  useAggiornamenti(() => { if (!busy && !document.activeElement?.matches("input, select, textarea")) return Promise.all([load(), loadServizi()]).then(() => {}); }, ["ormeggio"]);

  const chiama = async (url: string, method: string, body?: any) => {
    if (busy) return null;
    setBusy(true); setErr(""); setMsg("");
    try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    await load();
    segnalaCambiamento("ormeggio");
    return j;
    } catch { setErr("Connessione interrotta: aggiorna prima di riprovare."); return null; }
    finally { setBusy(false); }
  };

  const creaArea = async (e: React.FormEvent) => {
    e.preventDefault();
    const j = await chiama("/api/v1/ormeggio/aree", "POST", { nome: form.nome, righe: Number(form.righe), colonne: Number(form.colonne) });
    if (j) { setMsg(`Area creata con ${form.righe}×${form.colonne} = ${Number(form.righe) * Number(form.colonne)} posti.`); setForm({ nome: "", righe: 4, colonne: 6 }); }
  };

  const eliminaArea = async (area: Area) => {
    const ok = await conferma.chiedi({
      titolo: `Eliminare l'area "${area.nome}"?`,
      messaggio: "L'area e i suoi posti verranno rimossi dalla griglia.",
      dettaglio: "Barche, soste, storico e conti restano disponibili. Le barche nei posti rimossi compariranno in «Barche fuori griglia» nel quadro posti.",
      confermaLabel: "Elimina area",
      pericoloso: true,
    });
    if (ok) await chiama(`/api/v1/ormeggio/aree/${area.id}`, "DELETE");
  };

  const eliminaServizio = async (x: Servizio) => {
    const ok = await conferma.chiedi({
      titolo: `Eliminare "${x.nome}"?`,
      messaggio: "Il servizio verrà rimosso dal catalogo e non sarà più proponibile nelle schede.",
      confermaLabel: "Elimina servizio",
      pericoloso: true,
    });
    if (ok) { await chiama(`/api/v1/ormeggio/servizi/${x.id}`, "DELETE"); loadServizi(); }
  };

  return (
    <div className="grid gap-4">
      <IntestazioneOrmeggio titolo="Configurazione" descrizione="Aree, posti utilizzabili e catalogo dei servizi interni." />
      <div className="flex gap-2" role="group" aria-label="Configurazione">
        <button className={sezione === "aree" ? "btn-primary" : "btn-soft"} aria-pressed={sezione === "aree"} onClick={() => setSezione("aree")}>Aree e posti ({aree.length})</button>
        <button className={sezione === "servizi" ? "btn-primary" : "btn-soft"} aria-pressed={sezione === "servizi"} onClick={() => setSezione("servizi")}>Catalogo servizi ({servizi.length})</button>
      </div>
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      {sezione === "aree" && <>
      <details className="card p-3" open={aree.length === 0}><summary>＋ Nuova area</summary>
      <form className="grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={creaArea}>
        <label className="grid gap-1 text-sm md:col-span-5">
          <span className="text-xs font-semibold text-muted">Nome area *</span>
          <input className="rounded-md border border-line p-2" placeholder="es. Area ormeggio" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs font-semibold text-muted">Righe (lettere)</span>
          <input className="rounded-md border border-line p-2" type="number" min={1} max={40} value={form.righe} onChange={(e) => setForm({ ...form, righe: Number(e.target.value) })} />
        </label>
        <label className="grid gap-1 text-sm md:col-span-2">
          <span className="text-xs font-semibold text-muted">Colonne (numeri)</span>
          <input className="rounded-md border border-line p-2" type="number" min={1} max={40} value={form.colonne} onChange={(e) => setForm({ ...form, colonne: Number(e.target.value) })} />
        </label>
        <div className="md:col-span-3">
          <button className="btn-primary inline-flex w-full items-center justify-center gap-1.5" type="submit" disabled={busy}><Icona nome="piu" className="h-4 w-4" /> Crea area</button>
        </div>
      </form>
      </details>
      <p className="text-xs text-muted">Clicca sui posti per renderli utilizzabili o bloccarli. Nome e dimensioni si salvano quando esci dal campo; puoi ridurre anche i posti con assegnazioni: le barche interessate restano accessibili nel quadro, in «Barche fuori griglia».</p>
      {aree.map((area) => {
        const map = new Map(area.posti.map((p) => [`${p.riga}:${p.colonna}`, p]));
        const righe = Array.from({ length: area.righe }, (_, i) => i + 1);
        const colonne = Array.from({ length: area.colonne }, (_, i) => i + 1);
        return (
          <section key={`${area.id}-${area.nome}-${area.righe}-${area.colonne}`} className="card grid gap-3 p-4">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-muted">Nome</span>
                <input className="rounded-md border border-line p-2" defaultValue={area.nome} onBlur={(e) => e.target.value !== area.nome && chiama(`/api/v1/ormeggio/aree/${area.id}`, "PATCH", { nome: e.target.value })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-muted">Righe</span>
                <input className="w-20 rounded-md border border-line p-2" type="number" min={1} max={40} defaultValue={area.righe} onBlur={(e) => Number(e.target.value) !== area.righe && chiama(`/api/v1/ormeggio/aree/${area.id}`, "PATCH", { righe: Number(e.target.value) })} />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-muted">Colonne</span>
                <input className="w-20 rounded-md border border-line p-2" type="number" min={1} max={40} defaultValue={area.colonne} onBlur={(e) => Number(e.target.value) !== area.colonne && chiama(`/api/v1/ormeggio/aree/${area.id}`, "PATCH", { colonne: Number(e.target.value) })} />
              </label>
              <button className="ml-auto text-sm font-bold text-danger" onClick={() => eliminaArea(area)}>Elimina area</button>
            </div>

            <div className="overflow-x-auto">
              <div className="grid min-w-full gap-1.5" style={{ gridTemplateColumns: `repeat(${area.colonne}, minmax(56px, 1fr))` }}>
                {righe.map((r) =>
                  colonne.map((c) => {
                    const posto = map.get(`${r}:${c}`);
                    if (!posto) return <span key={`${r}:${c}`} className="h-12 rounded border border-dashed border-line" />;
                    return (
                      <button
                        key={posto.id}
                        onClick={() => chiama(`/api/v1/ormeggio/posti/${posto.id}`, "PATCH", { bloccato: !posto.bloccato })}
                        title={posto.bloccato ? "Posto non utilizzabile — clicca per riabilitare" : "Posto utilizzabile — clicca per bloccare"}
                        className={`h-12 rounded border text-xs font-bold ${posto.bloccato ? "border-dashed border-line bg-[#f1ece7] text-muted" : "border-ocean bg-foam text-ocean"}`}
                      >
                        {posto.codice}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
            <p className="text-xs text-muted">Posti: {area.posti.length} · non utilizzabili: {area.posti.filter((p) => p.bloccato).length}</p>
          </section>
        );
      })}

      </>}
      {sezione === "servizi" && <section className="card grid gap-3 p-4">
        <div>
          <h2 className="text-lg">Catalogo servizi</h2>
          <p className="text-sm text-muted">Servizi pronti per l’ormeggio, tutti modificabili. I prezzi sono da definire: nessun addebito viene creato dal catalogo. Le modifiche valgono per le nuove attività.</p>
        </div>
        <form className="grid gap-2 md:grid-cols-12 md:items-end" onSubmit={async (e) => {
          e.preventDefault();
          const prezzo = sv.prezzoEuro.trim() ? Number(sv.prezzoEuro.replace(",", ".")) : null;
          if (vedeImporti && prezzo !== null && (!Number.isFinite(prezzo) || prezzo < 0)) { setErr("Inserisci un prezzo valido, maggiore o uguale a zero."); return; }
          const j = await chiama("/api/v1/ormeggio/servizi", "POST", { nome: sv.nome.trim(), ...(vedeImporti ? { prezzoCent: prezzo === null ? null : Math.round(prezzo * 100) } : {}), unita: sv.unita.trim() || null });
          if (j) { setMsg("Servizio aggiunto."); setSv({ nome: "", prezzoEuro: "", unita: "" }); loadServizi(); }
        }}>
          <label className="grid gap-1 text-sm md:col-span-5"><span className="text-xs font-semibold text-muted">Nome *</span>
            <input className="rounded-md border border-line p-2" placeholder="es. Lavaggio" value={sv.nome} onChange={(e) => setSv({ ...sv, nome: e.target.value })} required />
          </label>
          {vedeImporti && <label className="grid gap-1 text-sm md:col-span-3"><span className="text-xs font-semibold text-muted">Prezzo € / unità</span>
            <input className="rounded-md border border-line p-2" placeholder="1,80" value={sv.prezzoEuro} onChange={(e) => setSv({ ...sv, prezzoEuro: e.target.value })} />
          </label>}
          <label className="grid gap-1 text-sm md:col-span-2"><span className="text-xs font-semibold text-muted">Unità</span>
            <input className="rounded-md border border-line p-2" placeholder="litri / ore / fisso" value={sv.unita} onChange={(e) => setSv({ ...sv, unita: e.target.value })} />
          </label>
          <div className="md:col-span-2"><button className="btn-primary inline-flex w-full items-center justify-center gap-1.5" type="submit" disabled={busy}><Icona nome="piu" className="h-4 w-4" /> Aggiungi</button></div>
        </form>
        <div className="grid gap-2">
          <input className="campo" aria-label="Cerca servizio" placeholder="Cerca nel catalogo…" value={cercaServizio} onChange={(e) => setCercaServizio(e.target.value)} />
          {servizi.filter((x) => x.nome.toLowerCase().includes(cercaServizio.trim().toLowerCase())).map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
              <span><b>{x.nome}</b>{x.unita ? ` · ${x.unita}` : ""} {x.prezzoCent != null ? `· ${(x.prezzoCent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}` : ""}</span>
              <div className="flex gap-3"><button className="text-sm font-bold text-ocean" onClick={() => { setServizioId(x.id); setSv({ nome: x.nome, prezzoEuro: x.prezzoCent == null ? "" : String(x.prezzoCent / 100), unita: x.unita ?? "" }); }}>Modifica</button><button className="text-sm font-bold text-danger" onClick={() => eliminaServizio(x)}>Elimina</button></div>
            </div>
          ))}
          {servizi.length === 0 && <p className="text-sm text-muted">Nessun servizio nel catalogo.</p>}
        </div>
      </section>}
      <Dialogo aperto={!!servizioId} onChiudi={() => { if (!busy) { setServizioId(null); setSv({ nome: "", prezzoEuro: "", unita: "" }); } }} titolo="Modifica servizio">
        <form className="grid gap-4" onSubmit={async (e) => {
          e.preventDefault();
          const prezzo = sv.prezzoEuro.trim() ? Number(sv.prezzoEuro.replace(",", ".")) : null;
          if (vedeImporti && prezzo !== null && (!Number.isFinite(prezzo) || prezzo < 0)) { setErr("Inserisci un prezzo valido."); return; }
          const j = await chiama(`/api/v1/ormeggio/servizi/${servizioId}`, "PATCH", { nome: sv.nome.trim(), unita: sv.unita.trim() || null, ...(vedeImporti ? { prezzoCent: prezzo === null ? null : Math.round(prezzo * 100) } : {}) });
          if (j) { setServizioId(null); setSv({ nome: "", prezzoEuro: "", unita: "" }); setMsg("Servizio aggiornato. Le attività già registrate conservano i propri dati."); await loadServizi(); }
        }}>
          {err && <Avviso tono="errore">{err}</Avviso>}
          <label className="grid gap-1 text-sm">Nome *<input className="campo" required maxLength={80} value={sv.nome} onChange={(e) => setSv({ ...sv, nome: e.target.value })} /></label>
          {vedeImporti && <label className="grid gap-1 text-sm">Prezzo € / unità<input className="campo" inputMode="decimal" placeholder="Da definire" value={sv.prezzoEuro} onChange={(e) => setSv({ ...sv, prezzoEuro: e.target.value })} /></label>}
          <label className="grid gap-1 text-sm">Unità<input className="campo" maxLength={20} value={sv.unita} onChange={(e) => setSv({ ...sv, unita: e.target.value })} /></label>
          <button className="btn-primary" disabled={busy}>{busy ? "Salvo…" : "Salva servizio"}</button>
        </form>
      </Dialogo>
      {conferma.dialogo}
    </div>
  );
}
