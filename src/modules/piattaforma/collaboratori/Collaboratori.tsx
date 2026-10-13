"use client";
import { useCallback, useEffect, useState } from "react";
import { useUtente } from "@/components/Utente";
import { Avviso } from "@/components/ui/Avviso";
import { useConferma } from "@/components/ui/Dialogo";

const nomi = { responsabile: "Responsabile", addetto: "Addetto" };
type Ruolo = keyof typeof nomi;
type ProfiloSalvato = Ruolo | "visualizzazione";
type Membro = { id: string; userId: string; role: string; ruoloOrmeggio: ProfiloSalvato; vedeImporti: boolean; stato: string; revisione: number; user: { nome: string | null; email: string } };
type Invito = { id: string; nome: string; email: string; ruoloOrmeggio: ProfiloSalvato; scadeAt: string; accettatoAt: string | null; revocatoAt: string | null };
export function Collaboratori() {
  const u = useUtente();
  const [membri, setMembri] = useState<Membro[]>([]);
  const [inviti, setInviti] = useState<Invito[]>([]);
  const [errore, setErrore] = useState("");
  const [messaggio, setMessaggio] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ email: "", nome: "", ruoloOrmeggio: "addetto" as Ruolo, vedeImporti: false });
  const conferma = useConferma();
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/v1/collaboratori", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) { setErrore(j.error); setMembri([]); setInviti([]); return; }
      setMembri(j.membri); setInviti(j.inviti);
    } catch { setErrore("Connessione interrotta. Riprova."); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const chiama = async (url: string, method: string, body?: unknown) => {
    if (busy) return null;
    setBusy(true); setErrore(""); setMessaggio("");
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json();
      if (!r.ok) { setErrore(j.error ?? "Operazione non riuscita"); if (r.status === 409) await load(); return null; }
      await load(); return j;
    } catch { setErrore("Connessione interrotta: ricarica prima di riprovare."); return null; }
    finally { setBusy(false); }
  };
  const cambia = (m: Membro, data: object) => chiama(`/api/v1/collaboratori/${m.id}`, "PATCH", { revisione: m.revisione, ...data });
  if (u?.role !== "owner") return <Avviso tono="errore">Gestione collaboratori riservata al titolare.</Avviso>;
  return <div className="grid gap-4">
    <div><h1 className="text-2xl">Collaboratori</h1><p className="text-sm text-muted">Accessi personali alla stessa struttura. Ogni persona usa la propria email e password.</p></div>
    {errore && <Avviso tono="errore">{errore}</Avviso>}{messaggio && <Avviso tono="ok">{messaggio}</Avviso>}
    {link && <div className="card grid gap-2 p-4"><label className="grid gap-1 text-sm font-semibold">Link di invito (valido 7 giorni)<input readOnly className="min-w-0 rounded-xl border border-line p-2 font-normal" value={link} onFocus={(e) => e.target.select()} /></label><button className="btn-secondary justify-self-start" onClick={() => navigator.clipboard.writeText(link).then(() => setMessaggio("Link copiato")).catch(() => setErrore("Seleziona e copia il link dal campo."))}>Copia link</button></div>}
    <form className="card grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4" onSubmit={async (e) => { e.preventDefault(); const j = await chiama("/api/v1/collaboratori", "POST", form); if (j) { setLink(j.link); setMessaggio(j.messaggio); setForm({ email: "", nome: "", ruoloOrmeggio: "addetto", vedeImporti: false }); } }}>
      <label className="grid gap-1 text-sm">Nome<input required minLength={2} maxLength={120} className="rounded-xl border border-line p-2" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Email<input required type="email" className="rounded-xl border border-line p-2" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
      <label className="grid gap-1 text-sm">Ruolo<select className="rounded-xl border border-line p-2" value={form.ruoloOrmeggio} onChange={(e) => setForm({ ...form, ruoloOrmeggio: e.target.value as Ruolo, vedeImporti: false })}>{Object.entries(nomi).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
      <div className="grid content-end gap-2">{form.ruoloOrmeggio === "responsabile" && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.vedeImporti} onChange={(e) => setForm({ ...form, vedeImporti: e.target.checked })} />Accesso agli importi e statistiche</label>}<button disabled={busy} className="btn-primary">Invita collaboratore</button></div>
    </form>
    <div className="grid gap-2 text-sm sm:grid-cols-2"><div className="card p-4"><b>Responsabile</b><p className="mt-1 text-muted">Gestisce clienti, contratti e operatività. Gli importi richiedono un permesso esplicito.</p></div><div className="card p-4"><b>Addetto</b><p className="mt-1 text-muted">Sposta barche, registra uscite e rientri, aggiorna le attività assegnate a sé.</p></div></div>
    {membri.some((m) => m.role !== "owner" && m.ruoloOrmeggio === "visualizzazione" && m.stato !== "rimossa") && <Avviso tono="attenzione">Alcuni collaboratori hanno un ruolo non più disponibile. Scegli Responsabile o Addetto per ripristinare il loro accesso a Ormeggio.</Avviso>}
    <h2 className="text-lg">Persone della struttura</h2>
    {membri.map((m) => <div key={m.id} className="card flex flex-wrap items-center justify-between gap-3 p-4 text-sm"><div><b>{m.user.nome ?? m.user.email}</b><p className="text-muted">{m.user.email} · {m.stato}</p></div><div className="flex flex-wrap items-center gap-3">
      <select aria-label={`Ruolo di ${m.user.nome ?? m.user.email}`} className="rounded-xl border border-line p-2" disabled={busy || m.stato === "rimossa"} value={m.role === "owner" ? "owner" : m.ruoloOrmeggio === "visualizzazione" ? "" : m.ruoloOrmeggio} onChange={async (e) => { const value = e.target.value; if (value === "owner" && !(await conferma.chiedi({ titolo: "Nominare un titolare?", messaggio: "Avrà accesso completo alla struttura, ai collaboratori e all'abbonamento.", confermaLabel: "Nomina titolare" }))) return; await cambia(m, value === "owner" ? { role: "owner" } : { role: "operatore", ruoloOrmeggio: value }); }}>{m.role !== "owner" && m.ruoloOrmeggio === "visualizzazione" && <option value="" disabled>Ruolo da aggiornare</option>}<option value="owner">Titolare</option>{Object.entries(nomi).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select>
      {m.role !== "owner" && m.ruoloOrmeggio === "responsabile" && <label className="flex items-center gap-2"><input type="checkbox" disabled={busy || m.stato === "rimossa"} checked={m.vedeImporti} onChange={(e) => cambia(m, { vedeImporti: e.target.checked })} />Importi</label>}
      {m.stato !== "rimossa" && <button disabled={busy} className="font-bold text-ocean" onClick={() => cambia(m, { stato: m.stato === "attiva" ? "sospesa" : "attiva" })}>{m.stato === "attiva" ? "Sospendi" : "Riattiva"}</button>}
      {m.stato !== "rimossa" && <button disabled={busy} className="font-bold text-coral" onClick={async () => { if (await conferma.chiedi({ titolo: "Rimuovere l'accesso?", messaggio: "La persona perderà subito l'accesso a questa struttura. Il suo account, gli altri accessi e lo storico restano conservati.", confermaLabel: "Rimuovi accesso", pericoloso: true })) await cambia(m, { stato: "rimossa" }); }}>Rimuovi</button>}
    </div></div>)}
    <h2 className="text-lg">Inviti</h2>{inviti.length === 0 && <p className="text-sm text-muted">Nessun invito.</p>}{inviti.map((i) => { const attivo = !i.accettatoAt && !i.revocatoAt && new Date(i.scadeAt) > new Date(); return <div key={i.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm"><div><b>{i.nome}</b> · {i.email}<p className="text-muted">{i.ruoloOrmeggio === "visualizzazione" ? "Ruolo non più disponibile" : nomi[i.ruoloOrmeggio]} · {i.accettatoAt ? "Accettato" : i.revocatoAt ? "Revocato" : attivo && i.ruoloOrmeggio === "visualizzazione" ? "Da revocare e inviare di nuovo" : attivo ? `Scade il ${new Date(i.scadeAt).toLocaleDateString("it-IT")}` : "Scaduto"}</p></div>{attivo && <button disabled={busy} className="font-bold text-coral" onClick={() => chiama(`/api/v1/collaboratori/inviti/${i.id}`, "DELETE")}>Revoca invito</button>}</div>; })}
    <p className="text-sm text-muted">Per un nuovo invito revoca quello precedente e invitalo di nuovo. La <a className="font-semibold text-ocean underline" href="/gestionale/ormeggio/tv">Vista monitor</a> è disponibile con il tuo accesso e con quelli di Responsabili e Addetti.</p>
    {conferma.dialogo}
  </div>;
}
