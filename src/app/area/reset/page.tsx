"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function Form() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [fatto, setFatto] = useState(false);
  const campo = "rounded-2xl border border-line p-3 text-sm";

  const invia = async (e: React.FormEvent) => {
    e.preventDefault(); setErr("");
    const r = await fetch("/api/v1/cliente/password-reset/conferma", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setFatto(true);
  };

  if (fatto) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold text-deep">Password reimpostata</h1>
        <p className="mt-2 text-sm text-muted">Ora puoi accedere con la nuova password.</p>
        <a className="btn-primary mt-4 inline-block" href="/area">Vai all'area personale</a>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-md gap-3 px-5 py-16">
      <h1 className="font-display text-2xl font-extrabold text-deep">Imposta una nuova password</h1>
      <form className="card grid gap-3 p-5" onSubmit={invia}>
        <input className={campo} type="password" placeholder="Nuova password (min 10 caratteri) *" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <button className="btn-primary" type="submit">Salva la nuova password</button>
      </form>
    </div>
  );
}

export default function ResetClientePage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md px-5 py-16 text-sm text-muted">Carico…</div>}>
      <Form />
    </Suspense>
  );
}
