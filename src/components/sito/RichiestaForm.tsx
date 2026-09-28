"use client";
import { useState } from "react";
import Turnstile from "@/components/Turnstile";

// Richiesta di prenotazione dalla scheda barca: non è una conferma automatica,
// l'azienda risponde. Se il cliente ha già un account, la richiesta resta collegata.
export function RichiestaForm({ boatId, capienza }: { boatId: string; capienza: number }) {
  const [dati, setDati] = useState({ nome: "", telefono: "", email: "", inizio: "", fine: "", passeggeri: 2, note: "" });
  const [privacy, setPrivacy] = useState(false);
  const [esca, setEsca] = useState("");
  const [token, setToken] = useState("");
  const [istante] = useState(() => Date.now());
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState("");
  const campo = "rounded-2xl border border-line p-3 text-sm";

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore("");
    if (!privacy) { setErrore("Serve il consenso al trattamento dei dati."); return; }
    if (!dati.inizio || !dati.fine) { setErrore("Indica data e orari di inizio e fine."); return; }
    setInvio(true);
    const r = await fetch("/api/v1/richieste", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boatId,
        startAt: new Date(dati.inizio).toISOString(),
        endAt: new Date(dati.fine).toISOString(),
        passeggeri: Number(dati.passeggeri),
        clienteNome: dati.nome,
        telefono: dati.telefono,
        email: dati.email || undefined,
        note: dati.note || undefined,
        privacy: true,
        azienda: esca,
        istante,
        turnstileToken: token,
      }),
    });
    const j = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) { setErrore(j.error ?? "Invio non riuscito, riprova."); return; }
    setFatto(true);
  };

  if (fatto) {
    return (
      <div className="rounded-[14px] bg-foam p-5 text-center">
        <p className="font-display text-lg font-extrabold text-deep">Richiesta inviata.</p>
        <p className="mt-2 text-sm text-muted">L'azienda verifica la disponibilità e ti risponde con le condizioni. Non è una conferma automatica.</p>
        <a className="mt-3 inline-block text-sm font-bold text-ocean" href="/area">Vai all'area personale →</a>
      </div>
    );
  }

  return (
    <form onSubmit={invia} className="grid gap-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="grid gap-1 text-xs font-semibold text-deep">Inizio
          <input type="datetime-local" className={campo} value={dati.inizio} onChange={(e) => setDati({ ...dati, inizio: e.target.value })} required />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-deep">Fine
          <input type="datetime-local" className={campo} value={dati.fine} onChange={(e) => setDati({ ...dati, fine: e.target.value })} required />
        </label>
      </div>
      <label className="grid gap-1 text-xs font-semibold text-deep">Persone
        <input type="number" min={1} max={capienza} className={campo} value={dati.passeggeri} onChange={(e) => setDati({ ...dati, passeggeri: Number(e.target.value) })} />
      </label>
      <input className={campo} placeholder="Nome e cognome *" value={dati.nome} onChange={(e) => setDati({ ...dati, nome: e.target.value })} required />
      <input className={campo} type="tel" placeholder="Telefono *" value={dati.telefono} onChange={(e) => setDati({ ...dati, telefono: e.target.value })} required />
      <input className={campo} type="email" placeholder="Email (facoltativa)" value={dati.email} onChange={(e) => setDati({ ...dati, email: e.target.value })} />
      <textarea className={campo} rows={2} maxLength={1000} placeholder="Note (facoltative)" value={dati.note} onChange={(e) => setDati({ ...dati, note: e.target.value })} />

      <div className="hidden" aria-hidden>
        <label>Azienda<input tabIndex={-1} autoComplete="off" value={esca} onChange={(e) => setEsca(e.target.value)} /></label>
      </div>

      <Turnstile onToken={setToken} />

      <label className="flex items-start gap-2 text-xs text-muted">
        <input className="mt-0.5" type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
        <span>Ho letto l'informativa e acconsento a essere ricontattato.</span>
      </label>
      {errore && <p className="text-sm font-semibold text-coral">{errore}</p>}
      <button className="btn-primary" type="submit" disabled={invio}>{invio ? "Invio…" : "Invia richiesta"}</button>
      <p className="text-xs text-muted">Prezzo, punto d'incontro e regole te li conferma l'azienda prima del pagamento.</p>
    </form>
  );
}
