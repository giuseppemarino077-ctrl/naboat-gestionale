"use client";
import { useState } from "react";

export default function PasswordDimenticataPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [attesa, setAttesa] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setAttesa(true);
    try {
      const r = await fetch("/api/v1/auth/password-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (r.ok) {
        setMsg("Se l'indirizzo è registrato riceverai un'email con il link per reimpostare la password (valido 1 ora).");
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.error ?? "Richiesta non riuscita, riprova.");
      }
    } catch {
      setErr("Richiesta non riuscita, riprova.");
    } finally {
      setAttesa(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-md gap-3">
      <h1 className="text-2xl">Password dimenticata</h1>
      <p className="text-sm text-muted">Inserisci l'email del tuo account: ti mandiamo un link per scegliere una nuova password.</p>
      <form onSubmit={submit} className="card grid gap-3 p-4">
        <label className="grid gap-1 text-sm">Email
          <input className="rounded-md border border-line p-2" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        {msg && <p className="text-sm font-semibold text-ocean">{msg}</p>}
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <button className="btn-primary" type="submit" disabled={attesa}>{attesa ? "Invio…" : "Invia il link"}</button>
      </form>
      <a className="text-sm font-bold text-ocean" href="/login">← Torna all'accesso</a>
    </div>
  );
}
