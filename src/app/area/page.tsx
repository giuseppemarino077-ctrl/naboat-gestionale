"use client";
import { useCallback, useEffect, useState } from "react";
import { IntestazioneSito } from "@/components/sito/IntestazioneSito";
import { PiedeSito } from "@/components/sito/PiedeSito";

const euro = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const dataIt = (d: string) => new Date(d).toLocaleString("it-IT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const STATO: Record<string, string> = {
  da_confermare: "Da confermare", prenotata: "Confermata", in_mare: "In navigazione",
  rientrata: "Completata", no_show: "Non presentata", cancellata: "Annullata",
};
const campo = "rounded-2xl border border-line p-3 text-sm";

function AreaPage() {
  const [me, setMe] = useState<any>(null);
  const [recensioni, setRecensioni] = useState<any[]>([]);
  const [carico, setCarico] = useState(true);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [modo, setModo] = useState<"login" | "registrazione">("login");
  const [auth, setAuth] = useState({ nome: "", email: "", telefono: "", password: "" });
  const [pat, setPat] = useState({ numero: "" });
  const [patFile, setPatFile] = useState<File | null>(null);
  const [rec, setRec] = useState<{ bookingId: string; voto: number; commento: string }>({ bookingId: "", voto: 5, commento: "" });

  const carica = useCallback(async () => {
    setCarico(true);
    const r = await fetch("/api/v1/cliente/me");
    if (r.status === 401) { setMe(false); setCarico(false); return; }
    const j = await r.json().catch(() => ({}));
    if (j?.account) { setMe(j); setErr(""); } else setMe(false);
    setCarico(false);
  }, []);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => {
    if (!me) return;
    fetch("/api/v1/cliente/recensioni").then((r) => r.json()).then((j) => Array.isArray(j) && setRecensioni(j)).catch(() => {});
  }, [me]);

  const autentica = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    const url = modo === "login" ? "/api/v1/cliente/login" : "/api/v1/cliente/registrazione";
    const body = modo === "login" ? { email: auth.email, password: auth.password } : { nome: auth.nome, email: auth.email, telefono: auth.telefono || null, password: auth.password };
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    carica();
  };

  const esci = async () => { await fetch("/api/v1/cliente/logout", { method: "POST" }); setMe(false); setRecensioni([]); };

  const caricaPatente = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    if (!patFile) { setErr("Scegli la foto della patente"); return; }
    const fd = new FormData();
    fd.append("file", patFile);
    fd.append("numero", pat.numero);
    const r = await fetch("/api/v1/cliente/patente", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setMsg("Patente inviata: la verifichiamo a breve."); setPatFile(null); setPat({ numero: "" }); carica();
  };

  const inviaRecensione = async (e: React.FormEvent) => {
    e.preventDefault(); setErr(""); setMsg("");
    const r = await fetch("/api/v1/cliente/recensioni", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(rec) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setMsg("Recensione salvata, grazie!"); setRec({ bookingId: "", voto: 5, commento: "" });
    fetch("/api/v1/cliente/recensioni").then((x) => x.json()).then((k) => Array.isArray(k) && setRecensioni(k)).catch(() => {});
    carica();
  };

  if (carico) return <div className="mx-auto max-w-3xl px-5 py-16 text-sm text-muted">Carico…</div>;

  // Non autenticato: ingresso o registrazione.
  if (!me) {
    return (
      <div className="mx-auto grid max-w-md gap-4 px-5 py-16">
        <div className="text-center">
          <h1 className="font-display text-3xl font-extrabold text-deep">Area personale</h1>
          <p className="mt-1 text-sm text-muted">Le tue prenotazioni, la patente e le recensioni.</p>
        </div>
        <div className="flex justify-center gap-2 text-sm">
          <button onClick={() => setModo("login")} className={"rounded-full px-4 py-1.5 font-bold " + (modo === "login" ? "bg-ocean text-white" : "border border-line text-ocean")}>Accedi</button>
          <button onClick={() => setModo("registrazione")} className={"rounded-full px-4 py-1.5 font-bold " + (modo === "registrazione" ? "bg-ocean text-white" : "border border-line text-ocean")}>Registrati</button>
        </div>
        <form onSubmit={autentica} className="card grid gap-3 p-5">
          {modo === "registrazione" && <input className={campo} placeholder="Nome e cognome *" value={auth.nome} onChange={(e) => setAuth({ ...auth, nome: e.target.value })} required />}
          <input className={campo} type="email" placeholder="Email *" value={auth.email} onChange={(e) => setAuth({ ...auth, email: e.target.value })} required />
          {modo === "registrazione" && <input className={campo} type="tel" placeholder="Telefono" value={auth.telefono} onChange={(e) => setAuth({ ...auth, telefono: e.target.value })} />}
          <input className={campo} type="password" placeholder="Password (min 10 caratteri) *" value={auth.password} onChange={(e) => setAuth({ ...auth, password: e.target.value })} required />
          {err && <p className="text-sm font-semibold text-coral">{err}</p>}
          <button className="btn-primary" type="submit">{modo === "login" ? "Accedi" : "Crea account"}</button>
          {modo === "login" && (
            <button
              type="button"
              className="text-xs font-bold text-ocean"
              onClick={async () => {
                const email = prompt("Email del tuo account:");
                if (!email) return;
                await fetch("/api/v1/cliente/password-reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
                setMsg("Se l'email è registrata, riceverai un link per reimpostare la password.");
              }}
            >
              Password dimenticata?
            </button>
          )}
          <p className="text-xs text-muted">Il noleggio si paga all'azienda. NaBoat custodisce i tuoi dati sul server in Italia.</p>
        </form>
      </div>
    );
  }

  const prossima = me.future?.[me.future.length - 1];
  const completate = (me.passate ?? []).filter((p: any) => p.stato === "rientrata");
  const recensite = new Set(recensioni.map((r) => r.bookingId));

  return (
    <div className="mx-auto grid max-w-4xl gap-6 px-5 py-10">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm text-muted">Area personale</p>
          <h1 className="font-display text-2xl font-extrabold text-deep">Ciao {me.account.nome.split(" ")[0]}</h1>
        </div>
        <button className="btn-soft" onClick={esci}>Esci</button>
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {prossima && (
        <div className="rounded-3xl bg-gradient-to-br from-ocean to-sea p-6 text-white shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-white/75">La tua prossima uscita</p>
          <h2 className="mt-1 font-display text-2xl font-extrabold">{prossima.boat?.nome ?? "Barca"}</h2>
          <p className="mt-1 text-white/90">{dataIt(prossima.startAt)} · {prossima.azienda?.nome}</p>
          <p className="mt-1 text-sm text-white/80">Stato: {STATO[prossima.stato] ?? prossima.stato}{prossima.residuoCent > 0 ? ` · saldo ${euro(prossima.residuoCent)}` : ""}</p>
          {prossima.azienda?.telefono && <a className="mt-3 inline-block rounded-[7px] bg-gold px-4 py-2 text-sm font-extrabold text-[#3a2708]" href={`https://wa.me/${prossima.azienda.telefono.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">Contatta l'azienda</a>}
        </div>
      )}

      <section className="grid gap-3">
        <h2 className="font-display text-xl font-bold text-deep">Prenotazioni</h2>
        {[...(me.future ?? [])].reverse().map((p: any) => (
          <div key={p.id} className="card flex flex-wrap items-center justify-between gap-2 p-4 text-sm">
            <div>
              <b>{p.boat?.nome ?? "Barca"}</b> <span className="text-muted">· {p.azienda?.nome}</span>
              <p className="text-xs text-muted">{dataIt(p.startAt)} · {p.passeggeri} persone{p.boat?.porto?.nome ? ` · ${p.boat.porto.nome}` : ""}</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs font-semibold">{STATO[p.stato] ?? p.stato}</span>
          </div>
        ))}
        {(me.future ?? []).length === 0 && <p className="text-sm text-muted">Nessuna prenotazione futura. <a className="font-bold text-ocean" href="/noleggia">Cerca una barca →</a></p>}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-xl font-bold text-deep">Patente nautica</h2>
        {me.patente ? (
          <div className="text-sm">
            <p>Stato: <b>{me.patente.stato === "approvata" ? "approvata" : me.patente.stato === "rifiutata" ? "rifiutata" : "in verifica"}</b></p>
            {me.patente.motivoRifiuto && <p className="text-coral">Motivo: {me.patente.motivoRifiuto}</p>}
            <p className="mt-2 text-xs text-muted">La foto resta in archivio privato e il numero è cifrato.</p>
            <form className="mt-3 grid gap-2" onSubmit={caricaPatente}>
              <input className={campo} placeholder="Nuovo numero (per aggiornare)" value={pat.numero} onChange={(e) => setPat({ numero: e.target.value })} />
              <input className="rounded-2xl border border-line p-2 text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPatFile(e.target.files?.[0] ?? null)} />
              <button className="btn-soft w-fit" type="submit">Aggiorna</button>
            </form>
          </div>
        ) : (
          <form className="grid gap-2" onSubmit={caricaPatente}>
            <p className="text-sm text-muted">Carica foto e numero: serve per noleggiare senza patente in banchina? No, serve solo quando la barca la richiede. La verifica NaBoat resta in archivio privato.</p>
            <input className={campo} placeholder="Numero della patente *" value={pat.numero} onChange={(e) => setPat({ numero: e.target.value })} required />
            <input className="rounded-2xl border border-line p-2 text-sm" type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setPatFile(e.target.files?.[0] ?? null)} />
            <button className="btn-primary w-fit" type="submit">Invia la patente</button>
          </form>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-xl font-bold text-deep">Le tue recensioni</h2>
        {completate.filter((p: any) => !recensite.has(p.id)).length > 0 && (
          <form className="grid gap-2 rounded-2xl bg-[#faf6f2] p-3" onSubmit={inviaRecensione}>
            <p className="text-sm font-semibold">Lascia una recensione</p>
            <select className={campo} value={rec.bookingId} onChange={(e) => setRec({ ...rec, bookingId: e.target.value })} required>
              <option value="">Scegli l'uscita…</option>
              {completate.filter((p: any) => !recensite.has(p.id)).map((p: any) => <option key={p.id} value={p.id}>{dataIt(p.startAt)} · {p.boat?.nome}</option>)}
            </select>
            <label className="grid gap-1 text-sm">Voto
              <select className={campo} value={rec.voto} onChange={(e) => setRec({ ...rec, voto: Number(e.target.value) })}>
                {[5, 4, 3, 2, 1].map((v) => <option key={v} value={v}>{"★".repeat(v)}{"☆".repeat(5 - v)}</option>)}
              </select>
            </label>
            <textarea className={campo} rows={3} placeholder="Commento (facoltativo)" value={rec.commento} onChange={(e) => setRec({ ...rec, commento: e.target.value })} />
            <button className="btn-primary w-fit" type="submit">Pubblica recensione</button>
          </form>
        )}
        {recensioni.map((r) => (
          <div key={r.id} className="rounded-2xl border border-line p-3 text-sm">
            <p className="font-bold text-gold">{"★".repeat(r.voto)}{"☆".repeat(5 - r.voto)} <span className="text-xs font-normal text-muted">{r.booking?.boat?.nome} · {r.booking?.tenant?.nome}</span></p>
            {r.commento && <p className="mt-1">{r.commento}</p>}
            {r.risposta && <p className="mt-1 rounded-xl bg-[#faf6f2] p-2 text-xs"><b>Risposta dell'azienda:</b> {r.risposta}</p>}
          </div>
        ))}
        {recensioni.length === 0 && completate.length === 0 && <p className="text-sm text-muted">Dopo la tua prima uscita potrai lasciare una recensione.</p>}
      </section>
    </div>
  );
}

// L'area cliente è una pagina del sito: intestazione e piede pubblici, senza menù del gestionale.
export default function AreaConSito() {
  return (
    <div className="bg-white text-ink">
      <IntestazioneSito appBase="" />
      <AreaPage />
      <PiedeSito appBase="" />
    </div>
  );
}
