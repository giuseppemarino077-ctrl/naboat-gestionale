"use client";
import { useEffect, useRef, useState } from "react";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const eurInput = (c: number | null | undefined) => (c === null || c === undefined ? "" : (c / 100).toFixed(2).replace(".", ","));

const etichettaTipo = (tipo: string, quantita: number) => {
  if (tipo === "attivazione") return "Attivazione e installazione";
  if (tipo === "manutenzione_stagionale") return `Manutenzione ${quantita} stagion${quantita === 1 ? "e" : "i"}`;
  return `Manutenzione ${quantita} mes${quantita === 1 ? "e" : "i"}`;
};

const STATO: Record<string, { label: string; classe: string }> = {
  active: { label: "attiva", classe: "badge-ready" },
  pending: { label: "da approvare", classe: "badge-pending" },
  suspended: { label: "sospesa", classe: "badge-block" },
  rejected: { label: "rifiutata", classe: "badge-block" },
};

const MODULO: Record<string, string> = { noleggio: "Noleggio", ormeggio: "Ormeggio", entrambi: "Noleggio + Ormeggio" };

type StatoFiltro = "tutte" | "da-approvare" | "attive" | "sospese";
type ModuloFiltro = "tutti" | "noleggio" | "ormeggio";

function Pill({
  attivo,
  children,
  onClick,
}: {
  attivo: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-full px-4 py-2 text-sm font-bold transition " +
        (attivo ? "bg-ocean text-white shadow-[0_6px_18px_-6px_rgba(194,65,12,0.7)]" : "text-ocean hover:bg-foam")
      }
    >
      {children}
    </button>
  );
}

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
  const [aspetto, setAspetto] = useState<{ loginImmagine: string | null; loginSfocatura: number; loginMessaggio: string; homeTitolo: string; homeSottotitolo: string; homeImmagine: string | null; manutenzioneAttiva: boolean; manutenzioneTitolo: string; manutenzioneTesto: string; sogliaPatenteCv: number; tempoPreparazioneMin: number; finestraRecensioniGiorni: number; pianoFreeMaxBarche: number; pianoFreeMaxFoto: number; pianoProPrezzoMensileCent: number | null; pianoProPrezzoAnnualeCent: number | null; pianoProvaGiorni: number; predefinita: string } | null>(null);
  const [caricandoSfondo, setCaricandoSfondo] = useState(false);
  const [caricandoHome, setCaricandoHome] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [utenti, setUtenti] = useState<Record<string, any[]>>({});
  const [utentiAperti, setUtentiAperti] = useState<Record<string, boolean>>({});
  const [pren, setPren] = useState<Record<string, any[]>>({});
  const [prenAperti, setPrenAperti] = useState<Record<string, boolean>>({});
  const [riepilogo, setRiepilogo] = useState<any>(null);

  const [tab, setTab] = useState<"aziende" | "servizi" | "sito">("aziende");
  const [filtroStato, setFiltroStato] = useState<StatoFiltro>("tutte");
  const [filtroModulo, setFiltroModulo] = useState<ModuloFiltro>("tutti");
  const [cerca, setCerca] = useState("");
  const initRef = useRef(false);

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

  const salvaAspetto = async (patch: Partial<{ loginImmagine: string | null; loginSfocatura: number; loginMessaggio: string | null; homeTitolo: string | null; homeSottotitolo: string | null; homeImmagine: string | null; manutenzioneAttiva: boolean; manutenzioneTitolo: string | null; manutenzioneTesto: string | null; sogliaPatenteCv: number; tempoPreparazioneMin: number; finestraRecensioniGiorni: number; pianoFreeMaxBarche: number; pianoFreeMaxFoto: number; pianoProPrezzoMensileCent: number | null; pianoProPrezzoAnnualeCent: number | null; pianoProvaGiorni: number }>) => {
    const r = await fetch("/api/v1/admin/piattaforma", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); setMsg("Aspetto aggiornato."); load();
  };

  const load = () => {
    fetch("/api/v1/admin/tenants").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then((list) => {
      setTenants(list);
      if (!initRef.current) {
        initRef.current = true;
        setFiltroStato(list.some((t: any) => t.status === "pending") ? "da-approvare" : "tutte");
      }
    }).catch(() => setErr("Riservato a NaBoat (superadmin)."));
    fetch("/api/v1/admin/piattaforma").then((r) => r.json()).then((j) => { if (j && "loginImmagine" in j) setAspetto(j); }).catch(() => {});
    fetch("/api/v1/admin/riepilogo").then((r) => r.json()).then((j) => { if (j && typeof j.aziendeDaApprovare === "number") setRiepilogo(j); }).catch(() => {});
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

  const caricaUtenti = async (tenantId: string) => {
    const r = await fetch(`/api/v1/admin/utenti?tenantId=${tenantId}`);
    const j = await r.json().catch(() => []);
    if (Array.isArray(j)) setUtenti((u) => ({ ...u, [tenantId]: j }));
  };
  const toggleUtenti = (tenantId: string) => {
    const apri = !utentiAperti[tenantId];
    setUtentiAperti((a) => ({ ...a, [tenantId]: apri }));
    if (apri) caricaUtenti(tenantId);
  };
  const reset2fa = async (tenantId: string, userId: string) => {
    if (!confirm("Azzerare la 2FA di questo utente? Dovrà configurarla di nuovo al prossimo accesso.")) return;
    const r = await fetch("/api/v1/admin/utenti", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); setMsg("2FA azzerata: l'utente dovrà riaccedere."); caricaUtenti(tenantId);
  };

  const caricaPren = async (tenantId: string) => {
    const r = await fetch(`/api/v1/admin/bookings?tenantId=${tenantId}`);
    const j = await r.json().catch(() => []);
    if (Array.isArray(j)) setPren((p) => ({ ...p, [tenantId]: j }));
  };
  const togglePren = (tenantId: string) => {
    const apri = !prenAperti[tenantId];
    setPrenAperti((a) => ({ ...a, [tenantId]: apri }));
    if (apri) caricaPren(tenantId);
  };
  const setCanale = async (tenantId: string, bookingId: string, origineCanale: "diretto" | "naboat") => {
    const r = await fetch("/api/v1/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId, origineCanale }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); setMsg("Canale della prenotazione aggiornato."); caricaPren(tenantId);
  };

  const pendingCount = tenants.filter((t) => t.status === "pending").length;

  const visibili = tenants
    .filter((t) => (filtroStato === "tutte" ? true : filtroStato === "da-approvare" ? t.status === "pending" : filtroStato === "attive" ? t.status === "active" : t.status === "suspended"))
    .filter((t) => (filtroModulo === "tutti" ? true : filtroModulo === "noleggio" ? t.tipoModulo === "noleggio" || t.tipoModulo === "entrambi" : t.tipoModulo === "ormeggio" || t.tipoModulo === "entrambi"))
    .filter((t) => !cerca || t.nome.toLowerCase().includes(cerca.toLowerCase()))
    .sort((a, b) => (a.status === "pending" ? 0 : 1) - (b.status === "pending" ? 0 : 1) || +new Date(b.createdAt) - +new Date(a.createdAt));

  return (
    <div className="grid gap-6">
      {/* Intestazione */}
      <div className="rounded-3xl bg-gradient-to-br from-ocean to-sea px-6 py-6 text-white shadow-[0_18px_40px_-18px_rgba(194,65,12,0.75)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/70">NaBoat Admin</p>
        <h1 className="mt-1 text-3xl">Pannello di controllo</h1>
        <p className="mt-1 text-sm text-white/85">Aziende, servizi e sito pubblico in un unico posto.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/backup">🗄 Copie di sicurezza</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/seo">🔎 SEO pagine pubbliche</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/contatti">✉ Messaggi dal sito</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/recensioni">★ Recensioni</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/catalogo">⚙ Catalogo modelli</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/patenti">🪪 Patenti</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/clienti">👤 Clienti</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/barche">⛵ Barche</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/piani">📊 Piani</a>
          <a className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" href="/admin/nuova-azienda">＋ Nuova azienda</a>
        </div>
      </div>

      {riepilogo && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            { n: "Noleggiatori", v: riepilogo.noleggiatori },
            { n: "Da approvare", v: riepilogo.aziendeDaApprovare },
            { n: "Messaggi da leggere", v: riepilogo.messaggiDaLeggere },
            { n: "Modelli da verificare", v: riepilogo.modelliDaVerificare },
            { n: "Patenti da verificare", v: riepilogo.patentiDaVerificare },
            { n: "Barche pubblicate", v: riepilogo.barchePubblicate },
            { n: "Clienti", v: riepilogo.clienti },
            { n: "Prenotazioni oggi", v: riepilogo.prenotazioniOggi },
            { n: "Recensioni", v: riepilogo.recensioni },
          ].map((k) => (
            <div key={k.n} className="rounded-2xl border border-line bg-white px-3 py-2 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-muted">{k.n}</p>
              <p className="font-display text-2xl font-extrabold text-deep">{k.v ?? "–"}</p>
            </div>
          ))}
        </div>
      )}

      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-4 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="rounded-2xl border border-[#bfe6dc] bg-[#eafaf5] p-4 text-sm font-semibold text-[#177469]">{msg}</p>}

      {/* Schede */}
      <div className="inline-flex w-fit rounded-full border border-line bg-white p-1 shadow-sm">
        <Pill attivo={tab === "aziende"} onClick={() => setTab("aziende")}>Aziende{pendingCount > 0 ? ` (${pendingCount} da approvare)` : ""}</Pill>
        <Pill attivo={tab === "servizi"} onClick={() => setTab("servizi")}>Servizi e listino</Pill>
        <Pill attivo={tab === "sito"} onClick={() => setTab("sito")}>Sito e aspetto</Pill>
      </div>

      {tab === "aziende" && (
        <div className="grid gap-5">
          {pendingCount > 0 && filtroStato !== "da-approvare" && (
            <button onClick={() => setFiltroStato("da-approvare")} className="flex items-center justify-between gap-3 rounded-3xl border border-gold/50 bg-[#fff7e6] px-5 py-4 text-left transition hover:bg-[#fff1d6]">
              <span className="text-sm font-bold text-[#9a6406]">
                {pendingCount === 1 ? "1 azienda in attesa di approvazione" : `${pendingCount} aziende in attesa di approvazione`}
              </span>
              <span className="rounded-full bg-gold px-4 py-2 text-sm font-bold text-[#3a2708]">Mostra</span>
            </button>
          )}

          <div className="grid gap-3 rounded-3xl border border-line bg-white p-4 shadow-sm md:grid-cols-[1fr_auto]">
            <input
              className="w-full rounded-full border border-line bg-[#faf6f2] px-4 py-3 text-sm outline-none focus:border-ocean"
              placeholder="Cerca un'azienda per nome…"
              value={cerca}
              onChange={(e) => setCerca(e.target.value)}
            />
            <div className="flex flex-wrap items-center gap-1">
              <Pill attivo={filtroStato === "tutte"} onClick={() => setFiltroStato("tutte")}>Tutte</Pill>
              <Pill attivo={filtroStato === "da-approvare"} onClick={() => setFiltroStato("da-approvare")}>Da approvare</Pill>
              <Pill attivo={filtroStato === "attive"} onClick={() => setFiltroStato("attive")}>Attive</Pill>
              <Pill attivo={filtroStato === "sospese"} onClick={() => setFiltroStato("sospese")}>Sospese</Pill>
            </div>
            <div className="flex flex-wrap items-center gap-1 md:col-span-2">
              <span className="pr-1 text-xs font-semibold uppercase tracking-wider text-muted">Modulo</span>
              <Pill attivo={filtroModulo === "tutti"} onClick={() => setFiltroModulo("tutti")}>Tutti</Pill>
              <Pill attivo={filtroModulo === "noleggio"} onClick={() => setFiltroModulo("noleggio")}>Noleggio</Pill>
              <Pill attivo={filtroModulo === "ormeggio"} onClick={() => setFiltroModulo("ormeggio")}>Ormeggio</Pill>
            </div>
          </div>

          <p className="px-1 text-sm text-muted">{visibili.length === 1 ? "1 azienda" : `${visibili.length} aziende`} in elenco.</p>

          <div className="grid gap-4">
            {visibili.map((t: any) => {
              const p = pagamenti[t.id];
              const attivi = p?.pagamentiAttivi && !p?.pagamentiBloccatiNaBoat;
              const st = STATO[t.status] ?? { label: t.status, classe: "badge-block" };
              return (
                <div key={t.id} className="rounded-3xl border border-line bg-white p-5 shadow-sm transition hover:shadow-md">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-extrabold">{t.nome}</p>
                      <p className="mt-0.5 text-xs text-muted">{t._count.users} utenti · {t._count.boats} barche · {t._count.bookings} prenotazioni</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={st.classe}>{st.label}</span>
                      <span className="rounded-full bg-foam px-2 py-1 text-xs font-semibold text-ocean">{MODULO[t.tipoModulo] ?? t.tipoModulo}</span>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 text-sm font-bold">
                    {t.status === "pending" && <button className="rounded-full bg-[#177469] px-4 py-2 text-white" onClick={() => azione(t.id, "approve")}>Approva</button>}
                    {t.status === "pending" && <button className="rounded-full border border-line px-4 py-2 text-coral" onClick={() => azione(t.id, "reject")}>Rifiuta</button>}
                    {t.status === "active" && <button className="rounded-full border border-line px-4 py-2 text-gold" onClick={() => azione(t.id, "suspend")}>Sospendi</button>}
                    {t.status === "suspended" && <button className="rounded-full bg-[#177469] px-4 py-2 text-white" onClick={() => azione(t.id, "reactivate")}>Riattiva</button>}
                    <button className="rounded-full px-4 py-2 text-coral hover:bg-[#fdeeea]" onClick={() => elimina(t.id)}>Elimina</button>
                  </div>

                  {p && (
                    <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-[#faf6f2] p-3 text-xs">
                      <span className="text-muted">Pagamenti:</span>
                      {p.pagamentiBloccatiNaBoat ? <span className="badge-block">bloccati da NaBoat</span> : attivi ? <span className="badge-ready">attivi</span> : <span className="badge-pending">non attivi</span>}
                      {p.stripeAttivo && <span className="badge-block">Stripe</span>}
                      {p.paypalAttivo && <span className="badge-block">PayPal</span>}
                      <span className="text-muted">fee NaBoat {p.feeNaboatPct}% · {p._count.payments} incassi</span>
                      {p.pagamentiBloccatiNaBoat
                        ? <button className="ml-auto font-bold text-[#177469]" onClick={() => pagamentiAzione(t.id, "sblocca")}>Sblocca pagamenti</button>
                        : <button className="ml-auto font-bold text-coral" onClick={() => pagamentiAzione(t.id, "blocca")}>Blocca pagamenti</button>}
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold">
                    <button className="rounded-full border border-line px-3 py-1.5 text-ocean hover:bg-foam" onClick={() => toggleUtenti(t.id)}>Utenti e 2FA</button>
                    <button className="rounded-full border border-line px-3 py-1.5 text-ocean hover:bg-foam" onClick={() => togglePren(t.id)}>Canale prenotazioni</button>
                  </div>

                  {utentiAperti[t.id] && (
                    <div className="mt-3 grid gap-2 rounded-2xl border border-line p-3 text-xs">
                      {(utenti[t.id] ?? []).map((u: any) => (
                        <div key={u.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{u.email}</span>
                          <span className="text-muted">{u.role}</span>
                          <span className={u.totpEnabled ? "badge-ready" : "badge-pending"}>{u.totpEnabled ? "2FA attiva" : "senza 2FA"}</span>
                          {u.totpEnabled && <button className="font-bold text-coral" onClick={() => reset2fa(t.id, u.id)}>Azzera 2FA</button>}
                        </div>
                      ))}
                      {utenti[t.id] && utenti[t.id].length === 0 && <span className="text-muted">Nessun utente.</span>}
                    </div>
                  )}

                  {prenAperti[t.id] && (
                    <div className="mt-3 grid gap-2 rounded-2xl border border-line p-3 text-xs">
                      <p className="text-muted">Imposta il canale di vendita: da «naboat» matura la fee NaBoat, da «diretto» no. Solo NaBoat può cambiarlo.</p>
                      {(pren[t.id] ?? []).map((b: any) => (
                        <div key={b.id} className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{b.clienteNome ?? "cliente"}</span>
                          <span className="text-muted">{new Date(b.startAt).toLocaleDateString("it-IT")} · {b.boat?.nome ?? ""}</span>
                          <span className={b.origineCanale === "naboat" ? "badge-ready" : "badge-pending"}>{b.origineCanale}</span>
                          <button className="font-bold text-ocean" onClick={() => setCanale(t.id, b.id, b.origineCanale === "naboat" ? "diretto" : "naboat")}>
                            {b.origineCanale === "naboat" ? "Imposta diretto" : "Imposta naboat"}
                          </button>
                        </div>
                      ))}
                      {pren[t.id] && pren[t.id].length === 0 && <span className="text-muted">Nessuna prenotazione.</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {visibili.length === 0 && !err && (
              <div className="rounded-3xl border border-dashed border-line bg-white p-8 text-center text-sm text-muted">
                Nessuna azienda con questi filtri.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "servizi" && (
        <div className="grid gap-5">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-xl">Listino servizi NaBoat</h2>
            <p className="mt-1 text-sm text-muted">
              <b>Gestionale</b>: attivazione una tantum (installazione, caricamento imbarcazioni, formazione) + canone di manutenzione e assistenza. <b>Marketplace</b>: fee percentuale solo sulle prenotazioni ricevute dal canale NaBoat. I due servizi sono separati.
            </p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">Attivazione e installazione (€, una volta)
                <input className="rounded-2xl border border-line p-3" value={form.prezzoAttivazioneEuro} onChange={(e) => setForm({ ...form, prezzoAttivazioneEuro: e.target.value })} placeholder="es. 800,00" />
              </label>
              <label className="grid gap-1 text-sm">Canone manutenzione al mese (€)
                <input className="rounded-2xl border border-line p-3" value={form.canoneMensileEuro} onChange={(e) => setForm({ ...form, canoneMensileEuro: e.target.value })} placeholder="es. 99,00" />
              </label>
              <label className="grid gap-1 text-sm">Canone manutenzione a stagione (€)
                <input className="rounded-2xl border border-line p-3" value={form.canoneStagionaleEuro} onChange={(e) => setForm({ ...form, canoneStagionaleEuro: e.target.value })} placeholder="es. 490,00" />
              </label>
              <label className="grid gap-1 text-sm">Attivazione modulo Ormeggio (€, una volta)
                <input className="rounded-2xl border border-line p-3" value={form.prezzoAttivazioneOrmeggioEuro} onChange={(e) => setForm({ ...form, prezzoAttivazioneOrmeggioEuro: e.target.value })} placeholder="es. 600,00" />
              </label>
              <label className="grid gap-1 text-sm">Canone Ormeggio al mese (€)
                <input className="rounded-2xl border border-line p-3" value={form.canoneOrmeggioMensileEuro} onChange={(e) => setForm({ ...form, canoneOrmeggioMensileEuro: e.target.value })} placeholder="es. 79,00" />
              </label>
              <label className="grid gap-1 text-sm">Fee marketplace proposta (%)
                <input className="rounded-2xl border border-line p-3" type="number" min={0} max={50} step={0.1} value={form.feeNaboatPctDefault} onChange={(e) => setForm({ ...form, feeNaboatPctDefault: Number(e.target.value) })} />
              </label>
              <label className="flex items-center gap-2 self-end text-sm font-semibold">
                <input type="checkbox" checked={form.abbonamentoObbligatorio} onChange={(e) => setForm({ ...form, abbonamentoObbligatorio: e.target.checked })} />
                Canone obbligatorio per usare il portale
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button className="btn-primary rounded-full" onClick={salvaListino}>Salva listino</button>
              {abbo && <span className="text-sm text-muted">Incassato dai servizi NaBoat: <b>{euro(abbo.incassatoCent)}</b></span>}
            </div>
          </div>

          {abbo && (
            <div className="overflow-x-auto rounded-3xl border border-line bg-white shadow-sm">
              <div className="border-b border-line p-4 text-sm font-bold">Condizioni per azienda (accordi personalizzati)</div>
              <table className="w-full text-sm">
                <thead className="text-muted"><tr className="text-left">
                  <th className="p-3">Azienda</th><th className="p-3">Marketplace</th><th className="p-3">Fee %</th>
                  <th className="p-3">Attivazione €</th><th className="p-3">Mensile €</th><th className="p-3">Stagionale €</th><th className="p-3"></th>
                </tr></thead>
                <tbody>
                  {abbo.tenants.map((t) => {
                    const c = cond[t.id] ?? { moduloMarketplace: true, feeNaboatPct: 0, prezzoAttivazioneEuro: "", canoneMensileEuro: "", canoneStagionaleEuro: "" };
                    const set = (patch: Partial<typeof c>) => setCond({ ...cond, [t.id]: { ...c, ...patch } });
                    return (
                      <tr key={t.id} className="border-t border-line">
                        <td className="p-3 font-semibold">{t.nome}<span className="block text-xs text-muted">{STATO[t.status]?.label ?? t.status}</span></td>
                        <td className="p-3">
                          <label className="flex items-center gap-2">
                            <input type="checkbox" checked={c.moduloMarketplace} onChange={(e) => set({ moduloMarketplace: e.target.checked })} />
                            {c.moduloMarketplace ? "attivo" : "solo gestionale"}
                          </label>
                        </td>
                        <td className="p-3"><input className="w-20 rounded-xl border border-line p-1.5" type="number" min={0} max={50} step={0.1} value={c.feeNaboatPct} onChange={(e) => set({ feeNaboatPct: Number(e.target.value) })} /></td>
                        <td className="p-3"><input className="w-24 rounded-xl border border-line p-1.5" value={c.prezzoAttivazioneEuro} onChange={(e) => set({ prezzoAttivazioneEuro: e.target.value })} placeholder="listino" /></td>
                        <td className="p-3"><input className="w-24 rounded-xl border border-line p-1.5" value={c.canoneMensileEuro} onChange={(e) => set({ canoneMensileEuro: e.target.value })} placeholder="listino" /></td>
                        <td className="p-3"><input className="w-24 rounded-xl border border-line p-1.5" value={c.canoneStagionaleEuro} onChange={(e) => set({ canoneStagionaleEuro: e.target.value })} placeholder="listino" /></td>
                        <td className="p-3"><button className="font-bold text-ocean" onClick={() => salvaCondizioni(t.id)}>Salva</button></td>
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
            <div className="overflow-x-auto rounded-3xl border border-line bg-white shadow-sm">
              <div className="border-b border-line p-4 text-sm font-bold">Servizi pagati dalle aziende</div>
              <table className="w-full text-sm">
                <thead className="text-muted"><tr className="text-left">
                  <th className="p-3">Azienda</th><th className="p-3">Voce</th><th className="p-3">Dal</th><th className="p-3">Al</th>
                  <th className="p-3">Importo</th><th className="p-3">Metodo</th><th className="p-3">Stato</th><th className="p-3">Azioni</th>
                </tr></thead>
                <tbody>
                  {abbo.subscriptions.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="p-3 font-semibold">{s.tenant?.nome}</td>
                      <td className="p-3">{etichettaTipo(s.tipo, s.quantita)}</td>
                      <td className="p-3">{new Date(s.inizioAt).toLocaleDateString("it-IT")}</td>
                      <td className="p-3">{s.tipo === "attivazione" ? "—" : new Date(s.fineAt).toLocaleDateString("it-IT")}</td>
                      <td className="p-3 font-semibold">{euro(s.prezzoCent)}</td>
                      <td className="p-3">{s.metodo ?? "—"}</td>
                      <td className="p-3"><span className={s.stato === "attivo" ? "badge-ready" : s.stato === "in_attesa" ? "badge-pending" : "badge-block"}>{s.stato}</span></td>
                      <td className="p-3">
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
        </div>
      )}

      {tab === "sito" && (
        <div className="grid gap-5">
          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-xl">Aspetto della pagina di accesso</h2>
            <p className="mt-1 text-sm text-muted">Immagine a tutto schermo dietro il modulo di accesso. Carica una foto orizzontale (almeno 1600 pixel di larghezza) per un effetto migliore.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <div className="h-40 w-full overflow-hidden rounded-2xl border border-line bg-[#3a2418]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={aspetto?.loginImmagine || aspetto?.predefinita || "/img/sfondo-login.jpg"} alt="sfondo" className="h-full w-full object-cover" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-primary cursor-pointer rounded-full">
                    {caricandoSfondo ? "Carico…" : "Carica immagine"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && caricaSfondo(e.target.files[0])} />
                  </label>
                  {aspetto?.loginImmagine && (
                    <button className="rounded-full border border-line px-3 py-2 text-sm font-bold text-coral" onClick={() => salvaAspetto({ loginImmagine: null })}>Torna all'immagine predefinita</button>
                  )}
                  <span className="text-xs text-muted">{aspetto?.loginImmagine ? "immagine personalizzata" : "immagine predefinita"}</span>
                </div>
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm">Sfocatura dello sfondo: {aspetto?.loginSfocatura ?? 0}
                  <input type="range" min={0} max={10} value={aspetto?.loginSfocatura ?? 0} onChange={(e) => setAspetto((a) => (a ? { ...a, loginSfocatura: Number(e.target.value) } : a))} onMouseUp={() => salvaAspetto({ loginSfocatura: aspetto?.loginSfocatura ?? 0 })} />
                </label>
                <label className="grid gap-1 text-sm">Frase di benvenuto (facoltativa)
                  <input className="rounded-2xl border border-line p-3" value={aspetto?.loginMessaggio ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, loginMessaggio: e.target.value } : a))} onBlur={() => salvaAspetto({ loginMessaggio: aspetto?.loginMessaggio || null })} placeholder="es. Benvenuto nel gestionale NaBoat" />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-xl">Home del sito pubblico (naboat.it)</h2>
            <p className="mt-1 text-sm text-muted">Titolo, riga di presentazione e foto di apertura della home. Lasciando vuoti i testi si usano quelli predefiniti; senza una foto dedicata si usa quella della pagina di accesso.</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="grid gap-2">
                <div className="h-40 w-full overflow-hidden rounded-2xl border border-line bg-[#3a2418]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={aspetto?.homeImmagine || aspetto?.loginImmagine || aspetto?.predefinita || "/img/sfondo-login.jpg"} alt="foto di apertura della home" className="h-full w-full object-cover" />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="btn-primary cursor-pointer rounded-full">
                    {caricandoHome ? "Carico…" : "Carica foto di apertura"}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && caricaHome(e.target.files[0])} />
                  </label>
                  {aspetto?.homeImmagine && (
                    <button className="rounded-full border border-line px-3 py-2 text-sm font-bold text-coral" onClick={() => salvaAspetto({ homeImmagine: null })}>Usa la foto dell'accesso</button>
                  )}
                  <span className="text-xs text-muted">{aspetto?.homeImmagine ? "foto personalizzata" : "foto dell'accesso"}</span>
                  <a className="font-bold text-ocean" href="/anteprima">Vedi l'anteprima →</a>
                </div>
              </div>
              <div className="grid gap-3">
                <label className="grid gap-1 text-sm">Titolo di apertura
                  <input className="rounded-2xl border border-line p-3" maxLength={160} value={aspetto?.homeTitolo ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, homeTitolo: e.target.value } : a))} onBlur={() => salvaAspetto({ homeTitolo: aspetto?.homeTitolo || null })} placeholder="es. Il mare è la meta. Noi pensiamo al resto." />
                </label>
                <label className="grid gap-1 text-sm">Riga sotto il titolo
                  <textarea className="rounded-2xl border border-line p-3" rows={3} maxLength={400} value={aspetto?.homeSottotitolo ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, homeSottotitolo: e.target.value } : a))} onBlur={() => salvaAspetto({ homeSottotitolo: aspetto?.homeSottotitolo || null })} placeholder="es. Le aziende di noleggio e le loro barche, in un unico posto." />
                </label>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-xl">Portale in manutenzione</h2>
            <p className="mt-1 text-sm text-muted">Con l'interruttore acceso, i visitatori di <b>naboat.it</b> vedono solo il messaggio di manutenzione; chi ha già una sessione valida vede il sito normale.</p>
            <label className="mt-3 flex w-fit items-center gap-2 rounded-full border border-line px-4 py-2 text-sm font-bold">
              <input type="checkbox" checked={aspetto?.manutenzioneAttiva ?? false} onChange={(e) => salvaAspetto({ manutenzioneAttiva: e.target.checked })} />
              {aspetto?.manutenzioneAttiva ? "Sito in manutenzione" : "Sito visibile a tutti"}
            </label>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="grid gap-1 text-sm">Titolo del messaggio
                <input className="rounded-2xl border border-line p-3" maxLength={160} value={aspetto?.manutenzioneTitolo ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, manutenzioneTitolo: e.target.value } : a))} onBlur={() => salvaAspetto({ manutenzioneTitolo: aspetto?.manutenzioneTitolo || null })} placeholder="es. Stiamo preparando il portale." />
              </label>
              <label className="grid gap-1 text-sm">Testo del messaggio
                <textarea className="rounded-2xl border border-line p-3" rows={3} maxLength={600} value={aspetto?.manutenzioneTesto ?? ""} onChange={(e) => setAspetto((a) => (a ? { ...a, manutenzioneTesto: e.target.value } : a))} onBlur={() => salvaAspetto({ manutenzioneTesto: aspetto?.manutenzioneTesto || null })} placeholder="es. Il nuovo sito NaBoat per noleggio barche sarà online a breve." />
              </label>
            </div>
          </div>

          <div className="rounded-3xl border border-line bg-white p-6 shadow-sm">
            <h2 className="text-xl">Parametri della piattaforma</h2>
            <p className="mt-1 text-sm text-muted">Regole di prodotto configurabili senza toccare il codice.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">Soglia patente (CV)
                <input type="number" min={0} max={2000} className="rounded-2xl border border-line p-3" value={aspetto?.sogliaPatenteCv ?? 40} onChange={(e) => setAspetto((a) => (a ? { ...a, sogliaPatenteCv: Number(e.target.value) } : a))} onBlur={() => salvaAspetto({ sogliaPatenteCv: aspetto?.sogliaPatenteCv ?? 40 })} />
              </label>
              <label className="grid gap-1 text-sm">Preparazione fra noleggi (minuti)
                <input type="number" min={0} max={10080} className="rounded-2xl border border-line p-3" value={aspetto?.tempoPreparazioneMin ?? 0} onChange={(e) => setAspetto((a) => (a ? { ...a, tempoPreparazioneMin: Number(e.target.value) } : a))} onBlur={() => salvaAspetto({ tempoPreparazioneMin: aspetto?.tempoPreparazioneMin ?? 0 })} />
              </label>
              <label className="grid gap-1 text-sm">Finestra recensioni (giorni)
                <input type="number" min={1} max={365} className="rounded-2xl border border-line p-3" value={aspetto?.finestraRecensioniGiorni ?? 60} onChange={(e) => setAspetto((a) => (a ? { ...a, finestraRecensioniGiorni: Number(e.target.value) } : a))} onBlur={() => salvaAspetto({ finestraRecensioniGiorni: aspetto?.finestraRecensioniGiorni ?? 60 })} />
              </label>
            </div>
            <h3 className="mt-6 font-display text-lg">Piani Free e Pro dei noleggiatori</h3>
            <p className="mt-1 text-sm text-muted">Importi e limiti sono da definire: qui restano configurabili.</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="grid gap-1 text-sm">Free · barche massime
                <input type="number" min={0} className="rounded-2xl border border-line p-3" value={aspetto?.pianoFreeMaxBarche ?? 3} onChange={(e) => setAspetto((a) => (a ? { ...a, pianoFreeMaxBarche: Number(e.target.value) } : a))} onBlur={() => salvaAspetto({ pianoFreeMaxBarche: aspetto?.pianoFreeMaxBarche ?? 3 })} />
              </label>
              <label className="grid gap-1 text-sm">Free · foto massime
                <input type="number" min={0} className="rounded-2xl border border-line p-3" value={aspetto?.pianoFreeMaxFoto ?? 5} onChange={(e) => setAspetto((a) => (a ? { ...a, pianoFreeMaxFoto: Number(e.target.value) } : a))} onBlur={() => salvaAspetto({ pianoFreeMaxFoto: aspetto?.pianoFreeMaxFoto ?? 5 })} />
              </label>
              <label className="grid gap-1 text-sm">Giorni di prova
                <input type="number" min={0} className="rounded-2xl border border-line p-3" value={aspetto?.pianoProvaGiorni ?? 0} onChange={(e) => setAspetto((a) => (a ? { ...a, pianoProvaGiorni: Number(e.target.value) } : a))} onBlur={() => salvaAspetto({ pianoProvaGiorni: aspetto?.pianoProvaGiorni ?? 0 })} />
              </label>
              <label className="grid gap-1 text-sm">Pro · prezzo al mese (€)
                <input type="number" min={0} step="0.01" className="rounded-2xl border border-line p-3" value={aspetto?.pianoProPrezzoMensileCent != null ? aspetto.pianoProPrezzoMensileCent / 100 : ""} onChange={(e) => setAspetto((a) => (a ? { ...a, pianoProPrezzoMensileCent: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } : a))} onBlur={() => salvaAspetto({ pianoProPrezzoMensileCent: aspetto?.pianoProPrezzoMensileCent ?? null })} />
              </label>
              <label className="grid gap-1 text-sm">Pro · prezzo all'anno (€)
                <input type="number" min={0} step="0.01" className="rounded-2xl border border-line p-3" value={aspetto?.pianoProPrezzoAnnualeCent != null ? aspetto.pianoProPrezzoAnnualeCent / 100 : ""} onChange={(e) => setAspetto((a) => (a ? { ...a, pianoProPrezzoAnnualeCent: e.target.value === "" ? null : Math.round(Number(e.target.value) * 100) } : a))} onBlur={() => salvaAspetto({ pianoProPrezzoAnnualeCent: aspetto?.pianoProPrezzoAnnualeCent ?? null })} />
              </label>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
