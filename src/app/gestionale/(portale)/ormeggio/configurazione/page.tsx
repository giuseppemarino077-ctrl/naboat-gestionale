"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { Icona } from "@/components/ui/Icona";
import { useConferma } from "@/components/ui/Dialogo";

type Posto = { id: string; riga: number; colonna: number; codice: string; bloccato: boolean };
type Area = { id: string; nome: string; righe: number; colonne: number; ordine: number; posti: Posto[] };

export default function ConfigurazioneOrmeggioPage() {
  const [aree, setAree] = useState<Area[]>([]);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ nome: "", righe: 4, colonne: 6 });
  const [servizi, setServizi] = useState<any[]>([]);
  const [sv, setSv] = useState({ nome: "", prezzoEuro: "", unita: "" });
  const conferma = useConferma();

  const load = () =>
    fetch("/api/v1/ormeggio/aree")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) { setAree(j); setErr(""); } else setErr(j.error ?? "Errore"); })
      .catch(() => setErr("Errore di caricamento"));
  const loadServizi = () => fetch("/api/v1/ormeggio/servizi").then((r) => r.json()).then((j) => Array.isArray(j) && setServizi(j)).catch(() => {});
  useEffect(() => { load(); loadServizi(); }, []);

  const chiama = async (url: string, method: string, body?: any) => {
    setErr(""); setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    await load();
    return j;
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
      dettaglio: "Le permanenze collegate restano in archivio ma senza posto. L'operazione non è reversibile.",
      confermaLabel: "Elimina area",
      pericoloso: true,
    });
    if (ok) await chiama(`/api/v1/ormeggio/aree/${area.id}`, "DELETE");
  };

  const eliminaServizio = async (x: any) => {
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
      <div>
        <p className="text-sm text-muted">Ormeggio · Configurazione</p>
        <h1 className="text-2xl">Aree e posti.</h1>
        <p className="text-sm text-muted">Crea le aree (es. «Area ormeggio», «Piazzale») indicando righe e colonne: i posti sono numerati a battaglia navale (A1, B3…). Clicca un posto per marcarlo come non utilizzabile (colonna, gru, passaggio).</p>
        <a className="text-sm font-bold text-ocean" href="/gestionale/ormeggio">← Vai alla griglia</a>
      </div>

      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={creaArea}>
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
          <button className="btn-primary inline-flex w-full items-center justify-center gap-1.5" type="submit"><Icona nome="piu" className="h-4 w-4" /> Crea area</button>
        </div>
      </form>

      {aree.map((area) => {
        const map = new Map(area.posti.map((p) => [`${p.riga}:${p.colonna}`, p]));
        const righe = Array.from({ length: area.righe }, (_, i) => i + 1);
        const colonne = Array.from({ length: area.colonne }, (_, i) => i + 1);
        return (
          <section key={area.id} className="card grid gap-3 p-4">
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
              <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `repeat(${area.colonne}, minmax(56px, 1fr))` }}>
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

      <section className="card grid gap-3 p-4">
        <div>
          <h2 className="text-lg">Catalogo servizi</h2>
          <p className="text-sm text-muted">Servizi riutilizzabili (lavaggio, carburante, manutenzione…). Puoi aggiungerne di personalizzati dalla scheda della barca.</p>
        </div>
        <form className="grid gap-2 md:grid-cols-12 md:items-end" onSubmit={async (e) => {
          e.preventDefault();
          const j = await chiama("/api/v1/ormeggio/servizi", "POST", { nome: sv.nome, prezzoCent: sv.prezzoEuro ? Math.round(Number(sv.prezzoEuro.replace(",", ".")) * 100) : null, unita: sv.unita || null });
          if (j) { setMsg("Servizio aggiunto."); setSv({ nome: "", prezzoEuro: "", unita: "" }); loadServizi(); }
        }}>
          <label className="grid gap-1 text-sm md:col-span-5"><span className="text-xs font-semibold text-muted">Nome *</span>
            <input className="rounded-md border border-line p-2" placeholder="es. Lavaggio" value={sv.nome} onChange={(e) => setSv({ ...sv, nome: e.target.value })} required />
          </label>
          <label className="grid gap-1 text-sm md:col-span-3"><span className="text-xs font-semibold text-muted">Prezzo € / unità</span>
            <input className="rounded-md border border-line p-2" placeholder="1,80" value={sv.prezzoEuro} onChange={(e) => setSv({ ...sv, prezzoEuro: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm md:col-span-2"><span className="text-xs font-semibold text-muted">Unità</span>
            <input className="rounded-md border border-line p-2" placeholder="litri / ore / fisso" value={sv.unita} onChange={(e) => setSv({ ...sv, unita: e.target.value })} />
          </label>
          <div className="md:col-span-2"><button className="btn-primary inline-flex w-full items-center justify-center gap-1.5" type="submit"><Icona nome="piu" className="h-4 w-4" /> Aggiungi</button></div>
        </form>
        <div className="grid gap-2">
          {servizi.map((x) => (
            <div key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line px-3 py-2 text-sm">
              <span><b>{x.nome}</b>{x.unita ? ` · ${x.unita}` : ""} {x.prezzoCent != null ? `· ${(x.prezzoCent / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" })}` : ""}</span>
              <button className="text-sm font-bold text-danger" onClick={() => eliminaServizio(x)}>Elimina</button>
            </div>
          ))}
          {servizi.length === 0 && <p className="text-sm text-muted">Nessun servizio nel catalogo.</p>}
        </div>
      </section>
      {conferma.dialogo}
    </div>
  );
}
