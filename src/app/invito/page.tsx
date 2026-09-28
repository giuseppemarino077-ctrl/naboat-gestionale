"use client";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Form() {
  const r = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [ripeti, setRipeti] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  const nonCoincidono = ripeti.length > 0 && password !== ripeti;
  const passwordCorta = password.length > 0 && password.length < 10;
  const bloccato = nonCoincidono || passwordCorta || !token || done;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (password.length < 10) {
      setErr("La password deve avere almeno 10 caratteri");
      return;
    }
    if (password !== ripeti) {
      setErr("Le due password non coincidono");
      return;
    }
    const res = await fetch("/api/v1/auth/invito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "Invito non riuscito");
      return;
    }
    setDone(true);
    r.push("/login");
  };

  return (
    <div className="w-full max-w-md">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ocean"><img src="/img/logo-naboat-bianco.png" alt="" className="h-6 w-auto" /></span>
        <div>
          <p className="font-display text-lg font-extrabold leading-tight">NaBoat</p>
          <p className="text-xs text-muted">Gestionale per il noleggio nautico</p>
        </div>
      </div>
      <h1 className="mb-3 text-2xl">Attiva il tuo accesso</h1>
      <form onSubmit={submit} className="card grid gap-3 p-5">
        <p className="text-sm text-muted">Scegli la password del tuo account: completerai l'invito e confermerai la tua email.</p>
        <label className="grid gap-1 text-sm">
          Password (min 10 caratteri)
          <input
            className={`rounded-md border p-2 ${passwordCorta ? "border-coral" : "border-line"}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            minLength={10}
            autoComplete="new-password"
            required
          />
          {passwordCorta && <span className="text-xs text-coral">Troppo corta: servono almeno 10 caratteri.</span>}
        </label>
        <label className="grid gap-1 text-sm">
          Ripeti password
          <input
            className={`rounded-md border p-2 ${nonCoincidono ? "border-coral" : "border-line"}`}
            value={ripeti}
            onChange={(e) => setRipeti(e.target.value)}
            type="password"
            autoComplete="new-password"
            required
          />
          {nonCoincidono && <span className="text-xs text-coral">Le due password non coincidono.</span>}
          {!nonCoincidono && ripeti.length > 0 && <span className="text-xs text-[#177469]">Le password coincidono.</span>}
        </label>
        {!token && <p className="text-sm font-semibold text-coral">Link di invito non valido.</p>}
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <button className="btn-primary" type="submit" disabled={bloccato}>Attiva l'accesso</button>
        <div className="flex justify-between text-sm font-bold">
          <a href="/login" className="text-ocean">← Torna all'accesso</a>
        </div>
      </form>
    </div>
  );
}

export default function InvitoPage() {
  return (
    <Suspense fallback={<p className="card p-4 text-sm">Carico…</p>}>
      <Form />
    </Suspense>
  );
}
