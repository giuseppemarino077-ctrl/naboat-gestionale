"use client";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

function Inner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [attesa, setAttesa] = useState(false);

  if (!token) return <p className="card p-4 text-sm">Link non valido. Richiedi un nuovo link dalla pagina <a className="font-bold text-ocean" href="/gestionale/password-dimenticata">Password dimenticata</a>.</p>;

  if (done) {
    return (
      <div className="card grid gap-2 p-4 text-sm">
        <p className="font-semibold text-ocean">Password aggiornata.</p>
        <p>Per sicurezza tutte le sessioni attive sono state chiuse: accedi con la nuova password.</p>
        <a className="font-bold text-ocean" href="/gestionale/accesso">Vai all'accesso →</a>
      </div>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (password !== password2) { setErr("Le due password non coincidono."); return; }
    setAttesa(true);
    try {
      const r = await fetch("/api/v1/auth/password-reset/conferma", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) setDone(true);
      else setErr(j.error ?? "Reimpostazione non riuscita.");
    } catch {
      setErr("Reimpostazione non riuscita, riprova.");
    } finally {
      setAttesa(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-md gap-3">
      <h1 className="text-2xl">Nuova password</h1>
      <form onSubmit={submit} className="card grid gap-3 p-4">
        <label className="grid gap-1 text-sm">Nuova password
          <input className="rounded-md border border-line p-2" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <label className="grid gap-1 text-sm">Ripeti la password
          <input className="rounded-md border border-line p-2" type="password" autoComplete="new-password" value={password2} onChange={(e) => setPassword2(e.target.value)} required />
        </label>
        <p className="text-xs text-muted">Almeno 10 caratteri.</p>
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <button className="btn-primary" type="submit" disabled={attesa}>{attesa ? "Salvo…" : "Salva la nuova password"}</button>
      </form>
    </div>
  );
}

export default function ReimpostaPasswordPage() {
  return (
    <Suspense fallback={<p className="card p-4 text-sm">Caricamento…</p>}>
      <Inner />
    </Suspense>
  );
}
