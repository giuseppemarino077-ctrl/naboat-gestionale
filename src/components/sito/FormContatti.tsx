"use client";
import { useState } from "react";
import Turnstile from "@/components/Turnstile";

const campo = "rounded-md border border-line p-2.5 text-sm";

// Form «Contatti» del sito: nome, cognome, telefono, email e consenso.
// Protezioni: campo esca nascosto, tempo minimo di compilazione, Turnstile e limiti lato server.
export function FormContatti() {
  const [dati, setDati] = useState({ nome: "", cognome: "", telefono: "", email: "" });
  const [tipo, setTipo] = useState("noleggiare");
  const [messaggio, setMessaggio] = useState("");
  const [privacy, setPrivacy] = useState(false);
  const [esca, setEsca] = useState("");
  const [token, setToken] = useState("");
  const [istante] = useState(() => Date.now());
  const [invio, setInvio] = useState(false);
  const [fatto, setFatto] = useState(false);
  const [errore, setErrore] = useState("");

  const cambia = (nome: keyof typeof dati) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDati({ ...dati, [nome]: e.target.value });

  const invia = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrore("");
    if (!privacy) {
      setErrore("Per inviare serve il consenso al trattamento dei dati.");
      return;
    }
    setInvio(true);
    const r = await fetch("/api/v1/contatti", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...dati, tipo, messaggio, privacy: true, azienda: esca, istante, turnstileToken: token }),
    });
    const j = await r.json().catch(() => ({}));
    setInvio(false);
    if (!r.ok) {
      setErrore(j.error ?? "Invio non riuscito, riprova.");
      return;
    }
    setFatto(true);
  };

  if (fatto) {
    return (
      <div className="rounded-[14px] bg-foam p-6 text-center">
        <p className="font-display text-xl font-extrabold text-deep">Grazie, ci siamo.</p>
        <p className="mt-2 text-sm text-muted">
          Ti ricontattiamo entro un giorno lavorativo al numero o all'email che ci hai lasciato.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={invia} className="grid gap-3">
      <label className="grid gap-1 text-sm font-semibold text-deep">
        Tipo di richiesta
        <select className={campo} value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="noleggiare">Voglio noleggiare una barca</option>
          <option value="noleggiatore">Sono un noleggiatore</option>
          <option value="altro">Altro</option>
        </select>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm font-semibold text-deep">
          Nome
          <input className={campo} autoComplete="given-name" required maxLength={80} value={dati.nome} onChange={cambia("nome")} />
        </label>
        <label className="grid gap-1 text-sm font-semibold text-deep">
          Cognome
          <input className={campo} autoComplete="family-name" required maxLength={80} value={dati.cognome} onChange={cambia("cognome")} />
        </label>
      </div>

      <label className="grid gap-1 text-sm font-semibold text-deep">
        Telefono
        <input className={campo} type="tel" autoComplete="tel" required maxLength={30} value={dati.telefono} onChange={cambia("telefono")} placeholder="es. 333 1234567" />
      </label>

      <label className="grid gap-1 text-sm font-semibold text-deep">
        Email
        <input className={campo} type="email" autoComplete="email" required maxLength={160} value={dati.email} onChange={cambia("email")} placeholder="es. nome@esempio.it" />
      </label>

      <label className="grid gap-1 text-sm font-semibold text-deep">
        Messaggio <span className="font-normal text-muted">(facoltativo)</span>
        <textarea
          className={campo}
          rows={4}
          maxLength={1000}
          value={messaggio}
          onChange={(e) => setMessaggio(e.target.value)}
          placeholder="Raccontaci cosa ti serve: tipo di barca, data, numero di persone…"
        />
      </label>

      {/* Campo esca per i robot: invisibile alle persone, i robot lo compilano. */}
      <div className="hidden" aria-hidden>
        <label>
          Azienda
          <input tabIndex={-1} autoComplete="off" value={esca} onChange={(e) => setEsca(e.target.value)} />
        </label>
      </div>

      <Turnstile onToken={setToken} />

      <label className="flex items-start gap-2 text-xs text-muted">
        <input className="mt-0.5" type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
        <span>Ho letto l'informativa sul trattamento dei dati e acconsento a essere ricontattato al telefono o all'email indicati.</span>
      </label>

      {errore && <p className="text-sm font-semibold text-coral">{errore}</p>}

      <button className="btn-primary justify-self-start px-6 py-3" type="submit" disabled={invio}>
        {invio ? "Invio…" : "Invia richiesta"}
      </button>
      <p className="text-xs text-muted">Ti ricontattiamo entro un giorno lavorativo. I dati servono solo a risponderti.</p>
    </form>
  );
}
