"use client";
import { useEffect, useState } from "react";

type Partenza = {
  id: string; ora: string; barca: string; cliente: string; dest: string; stato: string;
  checkinFatto: boolean; checkoutFatto: boolean; contrattoFirmato: boolean;
  telefono: string | null; prezzoCent: number | null; cauzioneStato: string;
};
type Today = { uscite: number; rientri: number; barcheBloccate: number; attenzioni: number; partenze: Partenza[] };

export default function OggiPage() {
  const [data, setData] = useState<Today | null>(null);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");

  const load = () => {
    fetch("/api/v1/today").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setData).catch(() => setErr("Non autorizzato: accedi per vedere i dati reali."));
  };

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => setMe(j.user)).catch(() => {});
    load();
  }, []);

  const api = async (url: string, method: string, body?: any) => {
    setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    return j;
  };

  const checkin = async (p: Partenza) => {
    const carb = prompt("Carburante alla partenza in % (vuoto = non indicato):", "100");
    if (carb === null) return;
    const note = prompt("Note del check-in (dotazioni, stato generale…):", "") ?? "";
    const r = await api(`/api/v1/bookings/${p.id}/checkin`, "POST", {
      carburantePct: carb.trim() === "" ? null : Number(carb),
      note: note || null,
    });
    if (r) setMsg(`Check-in registrato per ${p.cliente}.`);
  };

  const checkout = async (p: Partenza) => {
    const carb = prompt("Carburante al rientro in % (vuoto = non indicato):", "");
    if (carb === null) return;
    const danni = prompt("Importo danni in euro (vuoto = nessun danno):", "");
    if (danni === null) return;
    const note = prompt("Note del rientro:", "") ?? "";
    const r = await api(`/api/v1/bookings/${p.id}/checkout`, "POST", {
      carburantePct: carb.trim() === "" ? null : Number(carb),
      danniEuro: danni.trim() || null,
      note: note || null,
    });
    if (r) setMsg(`Check-out registrato per ${p.cliente}.${danni.trim() ? " Danni registrati: se la cauzione è autorizzata puoi addebitarla da Pagamenti." : ""}`);
  };

  const contratto = async (p: Partenza) => {
    const r = await api(`/api/v1/bookings/${p.id}/contratto`, "POST");
    if (r?.url) {
      setLink(r.url);
      await navigator.clipboard.writeText(r.url).catch(() => {});
      setMsg("Link del contratto copiato: invialo al cliente (WhatsApp o email).");
    }
  };

  const promemoriaOggi = async () => {
    const oggi = new Date().toISOString().slice(0, 10);
    const r = await api("/api/v1/promemoria/invia", "POST", { data: oggi });
    if (r) setMsg(`Promemoria: ${r.inviati} inviati, ${r.senzaEmail} senza email, ${r.falliti} non inviati.`);
  };

  return (
    <div className="grid gap-4">
      {!me && <p className="card p-3 text-sm">Non hai effettuato l'accesso. <a className="font-bold text-ocean" href="/login">Accedi →</a></p>}
      {me?.tenantStatus === "pending" && (
        <p className="card border-gold bg-[#fff8e6] p-3 text-sm">Account in attesa di approvazione NaBoat. L'operatività si sblocca all'attivazione.</p>
      )}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">Buongiorno{me?.nome ? `, ${me.nome}` : ""}{me?.tenantNome ? ` · ${me.tenantNome}` : ""}</p>
          <h1 className="text-2xl tracking-tight">La giornata è sotto controllo.</h1>
        </div>
        <div className="flex gap-2">
          <button className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" onClick={promemoriaOggi}>✉ Promemoria di oggi</button>
          <a href="/calendario" className="btn-primary">＋ Nuova prenotazione</a>
        </div>
      </div>
      {err && me?.role === "superadmin" ? (
        <div className="card p-4 text-sm">
          <b>Sei collegato come NaBoat.</b> Questa pagina mostra la giornata di una singola azienda: dal pannello scegli
          l'azienda e i suoi dati reali.
          <a className="ml-1 font-bold text-ocean" href="/admin">
            Vai ad Aziende →
          </a>
        </div>
      ) : (
        err && <p className="card p-3 text-sm text-coral">{err}</p>
      )}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}
      {link && <p className="card break-all p-3 text-xs text-muted">Contratto: {link}</p>}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="card p-4"><small className="text-muted">USCITE OGGI</small><div className="font-display text-3xl">{data?.uscite ?? "–"}</div></div>
        <div className="card p-4"><small className="text-muted">RIENTRI OGGI</small><div className="font-display text-3xl">{data?.rientri ?? "–"}</div></div>
        <div className="card p-4"><small className="text-muted">BARCHE BLOCCATE</small><div className="font-display text-3xl">{data?.barcheBloccate ?? "–"}</div></div>
        <div className="card p-4"><small className="text-muted">ATTENZIONE</small><div className="font-display text-3xl">{data?.attenzioni ?? "–"}</div><em className="text-xs not-italic text-muted">Manutenzioni e blocchi</em></div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line p-4">
          <h2>Prossime partenze</h2><a href="/calendario" className="text-sm font-bold text-ocean">Vedi calendario →</a>
        </div>
        {(data?.partenze ?? []).map((p) => (
          <div key={p.id} className="grid gap-2 border-b border-line/60 p-4 text-sm last:border-0">
            <div className="grid grid-cols-[.7fr_1.5fr_.7fr] items-center gap-2 md:grid-cols-[.6fr_1.4fr_1fr_1fr_.6fr]">
              <b>{p.ora}</b><span className="font-semibold">{p.barca}</span>
              <span className="hidden md:block">{p.cliente}</span>
              <span className="hidden md:block text-muted">{p.dest ?? "–"}</span>
              <mark className={p.stato === "In mare" ? "badge-pending" : "badge-ready"}>{p.stato}</mark>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
              <span className={p.contrattoFirmato ? "text-[#177469]" : "text-muted"}>{p.contrattoFirmato ? "✓ contratto firmato" : "contratto da firmare"}</span>
              <span className={p.checkinFatto ? "text-[#177469]" : "text-muted"}>{p.checkinFatto ? "✓ check-in" : "check-in da fare"}</span>
              <span className={p.checkoutFatto ? "text-[#177469]" : "text-muted"}>{p.checkoutFatto ? "✓ check-out" : "check-out da fare"}</span>
              {p.cauzioneStato !== "non_richiesta" && <span className="badge-block">cauzione: {p.cauzioneStato.replace("_", " ")}</span>}
              <span className="ml-auto flex flex-wrap gap-3">
                <button className="text-ocean" onClick={() => contratto(p)}>Contratto link</button>
                {!p.checkinFatto && <button className="text-ocean" onClick={() => checkin(p)}>Check-in</button>}
                {p.checkinFatto && !p.checkoutFatto && <button className="text-ocean" onClick={() => checkout(p)}>Check-out</button>}
              </span>
            </div>
          </div>
        ))}
        {data && data.partenze.length === 0 && <p className="p-4 text-sm text-muted">Nessuna uscita oggi.</p>}
      </div>
    </div>
  );
}
