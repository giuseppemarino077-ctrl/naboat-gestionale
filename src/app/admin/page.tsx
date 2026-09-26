"use client";
import { useEffect, useState } from "react";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const eurInput = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));

const etichettaTipo = (tipo: string, quantita: number) => {
  if (tipo === "attivazione") return "Attivazione e installazione";
  if (tipo === "manutenzione_stagionale") return `Manutenzione ${quantita} stagion${quantita === 1 ? "e" : "i"}`;
  return `Manutenzione ${quantita} mes${quantita === 1 ? "e" : "i"}`;
};

export default function AdminPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [pagamenti, setPagamenti] = useState<Record<string, any>>({});
  const [abbo, setAbbo] = useState<{ listino: any; subscriptions: any[]; tenants: any[]; incassatoCent: number } | null>(null);
  const [form, setForm] = useState({
    prezzoAttivazioneEuro: "",
    canoneMensileEuro: "",
    canoneStagionaleEuro: "",
    prezzoAttivazioneOrmeggioEuro: "",
    canoneOrmeggioMensileEuro: "",
    feeNaboatPctDefault: 0,
    abbonamentoObbligatorio: false,
  });
  const [cond, setCond] = useState<Record<string, { moduloMarketplace: boolean; feeNaboatPct: number; prezzoAttivazioneEuro: string; canoneMensileEuro: string; canoneStagionaleEuro: string }>>({});
  const [aspetto, setAspetto] = useState<{ loginImmagine: string | null; loginSfocatura: number; loginMessaggio: string; homeTitolo: string; homeSottotitolo: string; homeImmagine: string | null; manutenzioneAttiva: boolean; manutenzioneTitolo: string; manutenzioneTesto: string; predefinita: string } | null>(null);
  const [caricandoSfondo, setCaricandoSfondo] = useState(false);
  const [caricandoHome, setCaricandoHome] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const caricaSfondo = async (file: File) => {
    setCaricandoSfondo(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/v1/admin/piattaforma", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setCaricandoSfondo(false);
    if (!r.ok) { setErr(j.error ?? "Caricamento non riuscito"); return; }
    setMsg("Immagine di sfondo aggiornata."); load();
  };

  const caricaHome = async (file: File) => {
    setCaricandoHome(true); setErr("");
    const fd = new FormData();
    fd.append("file", file);
    fd.append("campo", "homeImmagine");
    const r = await fetch("/api/v1/admin/piattaforma", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setCaricandoHome(false);
    if (!r.ok) { setErr(j.error ?? "Caricamento non riuscito"); return; }
    setMsg("Foto di apertura della home aggiornata."); load();
  };

  const salvaAspetto = async (patch: Partial<{ loginImmagine: string | null; loginSfocatura: number; loginMessaggio: string | null; homeTitolo: string | null; homeSottotitolo: string | null; homeImmagine: string | null; manutenzioneAttiva: boolean; manutenzioneTitolo: string | null; manutenzioneTesto: string | null }>) => {
    const r = await fetch("/api/v1/admin/piattaforma", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); setMsg("Aspetto aggiornato."); load();
  };

  const load = () => {
    fetch("/api/v1/admin/tenants").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setTenants).catch(() => setErr("Riservato a NaBoat (superadmin)."));
    fetch("/api/v1/admin/piattaforma").then((r) => r.json()).then((j) => { if (j && "loginImmagine" in j) setAspetto(j); }).catch(() => {});
    fetch("/api/v1/admin/payments").then((r) => r.json()).then((j) => {
      if (Array.isArray(j)) setPagamenti(Object.fromEntries(j.map((x: any) => [x.id, x])));
    }).catch(() => {});
    fetch("/api/v1/admin/subscriptions").then((r) => r.json()).then((j) => {
      if (!j?.listino) return;
      setAbbo(j);
      setForm((f) => ({
        prezzoAttivazioneEuro: f.prezzoAttivazioneEuro || eurInput(j.listino.prezzoAttivazioneCent),
        canoneMensileEuro: f.canoneMensileEuro || eurInput(j.listino.canoneMensileCent),
        canoneStagionaleEuro: f.canoneStagionaleEuro || eurInput(j.listino.canoneStagionaleCent),
        prezzoAttivazioneOrmeggioEuro: f.prezzoAttivazioneOrmeggioEuro || eurInput(j.listino.prezzoAttivazioneOrmeggioCent),
        canoneOrmeggioMensileEuro: f.canoneOrmeggioMensileEuro || eurInput(j.listino.canoneOrmeggioMensileCent),
        feeNaboatPctDefault: f.prezzoAttivazioneEuro ? f.feeNaboatPctDefault : j.listino.feeNaboatPctDefault,
        abbonamentoObbligatorio: !!j.listino.abbonamentoObbligatorio,
      }));
      setCond((cur) => {
        const nuovo = { ...cur };
        for (const t of j.tenants ?? []) {
          if (!nuovo[t.id]) {
            nuovo[t.id] = {
              moduloMarketplace: t.moduloMarketplace !== false,
              feeNaboatPct: t.feeNaboatPct ?? 0,
              prezzoAttivazioneEuro: eurInput(t.prezzoAttivazioneCent),
              canoneMensileEuro: eurInput(t.canoneMensileCent),
              canoneStagionaleEuro: eurInput(t.canoneStagionaleCent),
            };
          }
        }
        return nuovo;
      });
    }).catch(() => {});
  };
  useEffect(load, []);

  const chiama = async (body: any, okMsg: string) => {
    const r = await fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); setMsg(okMsg); load();
    return j;
  };

  const salvaListino = () => chiama({ azione: "listino", ...form }, "Listino aggiornato.");
  const salvaCondizioni = (id: string) => chiama({ azione: "condizioniAzienda", id, ...cond[id] }, "Condizioni dell'azienda aggiornate.");
  const abbonamentoAzione = (id: string, azione: "attiva" | "annulla") => chiama({ azione, id }, azione === "attiva" ? "Voce attivata." : "Voce annullata.");

  const azione = async (id: string, a: string) => {
    const r = await fetch("/api/v1/admin/tenants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, azione: a }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    setErr(""); load();
  };
  const elimina = async (id: string) => {
    if (!confirm("Eliminare definitivamente azienda e dati?")) return;
    const r = await fetch(`/api/v1/admin/tenants?id=${id}`, { method: "DELETE" });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    setErr(""); load();
  };
  const pagamentiAzione = async (id: string, azione: "blocca" | "sblocca") => {
    const r = await fetch("/api/v1/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, azione }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    setErr(""); load();
  };

  return (
    <div className="grid gap-4">
      <div><p className="text-sm text-muted">NaBoat Admin</p><h1 className="text-2xl">Aziende noleggiatori.</h1>        <div className="flex gap-2">
          <a className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" href="/admin/backup">🗄 Copie di sicurezza</a>
          <a className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" href="/admin/seo">🔎 SEO pagine pubbliche</a>
          <a className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" href="/admin/contatti">✉ Messaggi dal sito</a>
        </div>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Aspetto della pagina di accesso</h2>
        <p className="text-muted">Immagine a tutto schermo dietro il modulo di accesso. Carica una foto orizzontale (almeno 1600 pixel di larghezza) per un effetto migliore.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="h-40 w-full overflow-hidden rounded-lg border border-line bg-[#3a2418]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aspetto?.loginImmagine || aspetto?.predefinita || "/img/sfondo-login.jpg"} alt="sfondo" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-primary cursor-pointer">
                {caricandoSfondo ? "Carico…" : "Carica immagine"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && caricaSfondo(e.target.files[0])} />
              </label>
              {aspetto?.loginImmagine && (
                <button className="rounded-md border border-line px-3 py-2 font-bold text-coral" onClick={() => salvaAspetto({ loginImmagine: null })}>Torna all'immagine predefinita</button>
              )}
              <span className="text-xs text-muted">{aspetto?.loginImmagine ? "immagine personalizzata" : "immagine predefinita"}</span>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="grid gap-1">Sfocatura dello sfondo: {aspetto?.loginSfocatura ?? 0}
              <input type="range" min={0} max={10} value={aspetto?.loginSfocatura ?? 0} onChange={(e) => setAspetto((a) => (a ? { ...a, loginSfocatura: Number(e.target.value) } : a))} onMouseUp={() => salvaAspetto({ loginSfocatura: aspetto?.loginSfocatura ?? 0 })} />
            </label>
            <label className="grid gap-1">Frase di benvenuto (facoltativa)
              <input className="rounded-md border border-line p-2" value={aspetto?.loginMessaggio ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, loginMessaggio: e.target.value } : a))} onBlur={() => salvaAspetto({ loginMessaggio: aspetto?.loginMessaggio || null })} placeholder="es. Benvenuto nel gestionale NaBoat" />
            </label>
          </div>
        </div>
      </div>

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Home del sito pubblico (naboat.it)</h2>
        <p className="text-muted">Titolo, riga di presentazione e foto di apertura della home. Lasciando vuoti i testi si usano quelli predefiniti; senza una foto dedicata si usa quella della pagina di accesso.</p>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="grid gap-2">
            <div className="h-40 w-full overflow-hidden rounded-lg border border-line bg-[#3a2418]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aspetto?.homeImmagine || aspetto?.loginImmagine || aspetto?.predefinita || "/img/sfondo-login.jpg"} alt="foto di apertura della home" className="h-full w-full object-cover" />
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="btn-primary cursor-pointer">
                {caricandoHome ? "Carico…" : "Carica foto di apertura"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && caricaHome(e.target.files[0])} />
              </label>
              {aspetto?.homeImmagine && (
                <button className="rounded-md border border-line px-3 py-2 font-bold text-coral" onClick={() => salvaAspetto({ homeImmagine: null })}>Usa la foto dell'accesso</button>
              )}
              <span className="text-xs text-muted">{aspetto?.homeImmagine ? "foto personalizzata" : "foto dell'accesso"}</span>
              <a className="font-bold text-ocean" href="/anteprima">Vedi l'anteprima →</a>
            </div>
          </div>
          <div className="grid gap-2">
            <label className="grid gap-1">Titolo di apertura
              <input className="rounded-md border border-line p-2" maxLength={160} value={aspetto?.homeTitolo ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, homeTitolo: e.target.value } : a))} onBlur={() => salvaAspetto({ homeTitolo: aspetto?.homeTitolo || null })} placeholder="es. Il mare è la meta. Noi pensiamo al resto." />
            </label>
            <label className="grid gap-1">Riga sotto il titolo
              <textarea className="rounded-md border border-line p-2" rows={3} maxLength={400} value={aspetto?.homeSottotitolo ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, homeSottotitolo: e.target.value } : a))} onBlur={() => salvaAspetto({ homeSottotitolo: aspetto?.homeSottotitolo || null })} placeholder="es. Le aziende di noleggio e le loro barche, in un unico posto." />
            </label>
          </div>
        </div>
      </div>

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Portale in manutenzione</h2>
        <p className="text-muted">Con l'interruttore acceso, i visitatori di <b>naboat.it</b> vedono solo il messaggio di manutenzione; chi ha già una sessione valida (NaBoat o un'azienda) vede il sito normale. Sotto il messaggio c'è il collegamento <b>Accesso amministratore</b> che porta al portale: da lì si entra e il sito si vede.</p>
        <label className="flex w-fit items-center gap-2 rounded-lg border border-line px-3 py-2 font-bold">
          <input type="checkbox" checked={aspetto?.manutenzioneAttiva ?? false} onChange={(e) => salvaAspetto({ manutenzioneAttiva: e.target.checked })} />
          {aspetto?.manutenzioneAttiva ? "Sito in manutenzione" : "Sito visibile a tutti"}
        </label>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1">Titolo del messaggio
            <input className="rounded-md border border-line p-2" maxLength={160} value={aspetto?.manutenzioneTitolo ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, manutenzioneTitolo: e.target.value } : a))} onBlur={() => salvaAspetto({ manutenzioneTitolo: aspetto?.manutenzioneTitolo || null })} placeholder="es. Stiamo preparando il portale." />
          </label>
          <label className="grid gap-1">Testo del messaggio
            <textarea className="rounded-md border border-line p-2" rows={3} maxLength={600} value={aspetto?.manutenzioneTesto ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, manutenzioneTesto: e.target.value } : a))} onBlur={() => salvaAspetto({ manutenzioneTesto: aspetto?.manutenzioneTesto || null })} placeholder="es. Il nuovo sito NaBoat per noleggio barche Napoli sarà online a breve." />
          </label>
        </div>
      </div>

      <div className="card grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Listino servizi NaBoat</h2>
        <p className="text-muted">
          <b>Gestionale</b>: attivazione una tantum (installazione, caricamento imbarcazioni, formazione) + canone di manutenzione e
          assistenza. <b>Marketplace</b>: fee percentuale solo sulle prenotazioni ricevute dal canale NaBoat. I due servizi sono
          separati: un noleggiatore può usare solo il gestionale.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <label className="grid gap-1">Attivazione e installazione (€, una volta)
            <input className="rounded-md border border-line p-2" value={form.prezzoAttivazioneEuro} onChange={(e) => setForm({ ...form, prezzoAttivazioneEuro: e.target.value })} placeholder="es. 800,00" />
          </label>
          <label className="grid gap-1">Canone manutenzione al mese (€)
            <input className="rounded-md border border-line p-2" value={form.canoneMensileEuro} onChange={(e) => setForm({ ...form, canoneMensileEuro: e.target.value })} placeholder="es. 99,00" />
          </label>
          <label className="grid gap-1">Canone manutenzione a stagione (€){abbo?.listino ? "" : ""}
            <input className="rounded-md border border-line p-2" value={form.canoneStagionaleEuro} onChange={(e) => setForm({ ...form, canoneStagionaleEuro: e.target.value })} placeholder="es. 490,00" />
          </label>
          <label className="grid gap-1">Attivazione modulo Ormeggio (€, una volta)
            <input className="rounded-md border border-line p-2" value={form.prezzoAttivazioneOrmeggioEuro} onChange={(e) => setForm({ ...form, prezzoAttivazioneOrmeggioEuro: e.target.value })} placeholder="es. 600,00" />
          </label>
          <label className="grid gap-1">Canone Ormeggio al mese (€)
            <input className="rounded-md border border-line p-2" value={form.canoneOrmeggioMensileEuro} onChange={(e) => setForm({ ...form, canoneOrmeggioMensileEuro: e.target.value })} placeholder="es. 79,00" />
          </label>
          <label className="grid gap-1">Fee marketplace proposta (%)
            <input className="rounded-md border border-line p-2" type="number" min={0} max={50} step={0.1} value={form.feeNaboatPctDefault} onChange={(e) => setForm({ ...form, feeNaboatPctDefault: Number(e.target.value) })} />
          </label>
          <label className="flex items-center gap-2 self-end">
            <input type="checkbox" checked={form.abbonamentoObbligatorio} onChange={(e) => setForm({ ...form, abbonamentoObbligatorio: e.target.checked })} />
            Canone obbligatorio per usare il portale
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button className="btn-primary w-fit" onClick={salvaListino}>Salva listino</button>
          {abbo && <span className="text-muted">Incassato dai servizi NaBoat: <b>{euro(abbo.incassatoCent)}</b></span>}
        </div>
      </div>

      {abbo && (
        <div className="card overflow-x-auto">
          <div className="border-b border-line p-3 text-sm font-bold">Condizioni per azienda (accordi personalizzati)</div>
          <table className="w-full text-sm">
            <thead className="text-muted"><tr className="text-left">
              <th className="p-2">Azienda</th><th className="p-2">Marketplace</th><th className="p-2">Fee %</th>
              <th className="p-2">Attivazione €</th><th className="p-2">Mensile €</th><th className="p-2">Stagionale €</th><th className="p-2"></th>
            </tr></thead>
            <tbody>
              {abbo.tenants.map((t) => {
                const c = cond[t.id] ?? { moduloMarketplace: true, feeNaboatPct: 0, prezzoAttivazioneEuro: "", canoneMensileEuro: "", canoneStagionaleEuro: "" };
                const set = (patch: Partial<typeof c>) => setCond({ ...cond, [t.id]: { ...c, ...patch } });
                return (
                  <tr key={t.id} className="border-t border-line">
                    <td className="p-2 font-semibold">{t.nome}<span className="block text-xs text-muted">{t.status}</span></td>
                    <td className="p-2">
                      <label className="flex items-center gap-2">
                        <input type="checkbox" checked={c.moduloMarketplace} onChange={(e) => set({ moduloMarketplace: e.target.checked })} />
                        {c.moduloMarketplace ? "attivo" : "solo gestionale"}
                      </label>
                    </td>
                    <td className="p-2"><input className="w-20 rounded-md border border-line p-1" type="number" min={0} max={50} step={0.1} value={c.feeNaboatPct} onChange={(e) => set({ feeNaboatPct: Number(e.target.value) })} /></td>
                    <td className="p-2"><input className="w-24 rounded-md border border-line p-1" value={c.prezzoAttivazioneEuro} onChange={(e) => set({ prezzoAttivazioneEuro: e.target.value })} placeholder="listino" /></td>
                    <td className="p-2"><input className="w-24 rounded-md border border-line p-1" value={c.canoneMensileEuro} onChange={(e) => set({ canoneMensileEuro: e.target.value })} placeholder="listino" /></td>
                    <td className="p-2"><input className="w-24 rounded-md border border-line p-1" value={c.canoneStagionaleEuro} onChange={(e) => set({ canoneStagionaleEuro: e.target.value })} placeholder="listino" /></td>
                    <td className="p-2"><button className="font-bold text-ocean" onClick={() => salvaCondizioni(t.id)}>Salva</button></td>
                  </tr>
                );
              })}
              {!abbo.tenants.length && <tr><td className="p-3 text-muted" colSpan={7}>Nessuna azienda.</td></tr>}
            </tbody>
          </table>
          <p className="p-3 text-xs text-muted">Lasciando vuoti gli importi si usa il listino generale. Spegnendo il Marketplace l'azienda non pubblica su NaBoat e la fee non viene applicata.</p>
        </div>
      )}

      {abbo && abbo.subscriptions.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="border-b border-line p-3 text-sm font-bold">Servizi pagati dalle aziende</div>
          <table className="w-full text-sm">
            <thead className="text-muted"><tr className="text-left">
              <th className="p-2">Azienda</th><th className="p-2">Voce</th><th className="p-2">Dal</th><th className="p-2">Al</th>
              <th className="p-2">Importo</th><th className="p-2">Metodo</th><th className="p-2">Stato</th><th className="p-2">Azioni</th>
            </tr></thead>
            <tbody>
              {abbo.subscriptions.map((s) => (
                <tr key={s.id} className="border-t border-line">
                  <td className="p-2 font-semibold">{s.tenant?.nome}</td>
                  <td className="p-2">{etichettaTipo(s.tipo, s.quantita)}</td>
                  <td className="p-2">{new Date(s.inizioAt).toLocaleDateString("it-IT")}</td>
                  <td className="p-2">{s.tipo === "attivazione" ? "—" : new Date(s.fineAt).toLocaleDateString("it-IT")}</td>
                  <td className="p-2 font-semibold">{euro(s.prezzoCent)}</td>
                  <td className="p-2">{s.metodo ?? "—"}</td>
                  <td className="p-2"><span className={s.stato === "attivo" ? "badge-ready" : s.stato === "in_attesa" ? "badge-pending" : "badge-block"}>{s.stato}</span></td>
                  <td className="p-2">
                    <div className="flex gap-2 font-bold">
                      {s.stato !== "attivo" && s.stato !== "annullato" && <button className="text-[#177469]" onClick={() => abbonamentoAzione(s.id, "attiva")}>Attiva</button>}
                      {s.stato !== "annullato" && <button className="text-coral" onClick={() => confirm("Annullare?") && abbonamentoAzione(s.id, "annulla")}>Annulla</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tenants.map((t: any) => {
        const p = pagamenti[t.id];
        const attivi = p?.pagamentiAttivi && !p?.pagamentiBloccatiNaBoat;
        return (
          <div key={t.id} className="card grid gap-2 p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b>{t.nome}</b> <span className="text-muted">· {t.status} · {t._count.users}u {t._count.boats}b {t._count.bookings}p</span></div>
              <div className="flex flex-wrap gap-2 text-xs font-bold">
                {t.status === "pending" && <><button className="text-[#177469]" onClick={() => azione(t.id, "approve")}>Approva</button><button className="text-coral" onClick={() => azione(t.id, "reject")}>Rifiuta</button></>}
                {t.status === "active" && <button className="text-gold" onClick={() => azione(t.id, "suspend")}>Sospendi</button>}
                {t.status === "suspended" && <button className="text-[#177469]" onClick={() => azione(t.id, "reactivate")}>Riattiva</button>}
                <button className="text-coral" onClick={() => elimina(t.id)}>Elimina</button>
              </div>
            </div>
            {p && (
              <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2 text-xs">
                <span className="text-muted">Pagamenti:</span>
                {p.pagamentiBloccatiNaBoat
                  ? <span className="badge-block">bloccati da NaBoat</span>
                  : attivi
                    ? <span className="badge-ready">attivi</span>
                    : <span className="badge-pending">non attivi</span>}
                {p.stripeAttivo && <span className="badge-block">Stripe</span>}
                {p.paypalAttivo && <span className="badge-block">PayPal</span>}
                <span className="text-muted">fee NaBoat {p.feeNaboatPct}% · {p._count.payments} incassi</span>
                {p.pagamentiBloccatiNaBoat
                  ? <button className="text-[#177469]" onClick={() => pagamentiAzione(t.id, "sblocca")}>Sblocca pagamenti</button>
                  : <button className="text-coral" onClick={() => pagamentiAzione(t.id, "blocca")}>Blocca pagamenti</button>}
              </div>
            )}
          </div>
        );
      })}
      {tenants.length === 0 && !err && <p className="text-sm text-muted">Nessuna azienda registrata.</p>}
    </div>
  );
}
