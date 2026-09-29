"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import { dimenticaUtente } from "@/components/Utente";
import { destinazioneAccesso } from "@/lib/accesso";

type Aspetto = { sfondo: string; sfocatura: number; messaggio: string };

export default function LoginPage() {
  const r = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [need2fa, setNeed2fa] = useState(false);
  const [token, setToken] = useState("");
  const [err, setErr] = useState("");
  const [aspetto, setAspetto] = useState<Aspetto | null>(null);
  const [da, setDa] = useState<string | null>(null);

  useEffect(() => {
    // Pagina richiesta prima dell'accesso: ci si torna dopo il login.
    const params = new URLSearchParams(window.location.search);
    const p = params.get("da");
    if (p && p.startsWith("/") && !p.startsWith("//")) setDa(p);
  }, []);

  useEffect(() => {
    fetch("/api/v1/piattaforma")
      .then((r) => r.json())
      .then((j) => setAspetto({ sfondo: j.sfondo, sfocatura: j.sfocatura ?? 0, messaggio: j.messaggio ?? "" }))
      .catch(() => setAspetto({ sfondo: "/img/sfondo-login.jpg", sfocatura: 0, messaggio: "" }));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, totpCode: totpCode || undefined, turnstileToken: token || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (j.twoFactorRequired) setNeed2fa(true);
      setErr(j.error ?? "Accesso fallito");
      return;
    }
    const destinazione = destinazioneAccesso(j);
    dimenticaUtente();
    r.push(da ?? destinazione);
    r.refresh();
  };

  const sfondo = aspetto?.sfondo ?? "/img/sfondo-login.jpg";

  return (
    <div className="relative w-full">
      {/* Immagine di sfondo a tutto schermo (modificabile dal pannello NaBoat) */}
      <div
        className="fixed inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${sfondo})`, filter: `blur(${aspetto?.sfocatura ?? 0}px)` }}
        aria-hidden
      />
      {/* Velo scuro per far leggere bene il modulo */}
      <div className="fixed inset-0 bg-[#2a1408]/55" aria-hidden />

      <div className="relative grid min-h-screen place-items-center p-5">
        <div className="w-full max-w-md">
          <div className="mb-5 flex items-center gap-3 text-white">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/15 backdrop-blur"><img src="/img/logo-naboat-bianco.png" alt="" className="h-7 w-auto" /></span>
            <div>
              <p className="font-display text-lg font-extrabold leading-tight">NaBoat</p>
              <p className="text-xs text-white/70">Gestionale per il noleggio nautico</p>
            </div>
          </div>

          {aspetto?.messaggio && <p className="mb-3 text-sm font-semibold text-white drop-shadow">{aspetto.messaggio}</p>}

          <div className="card grid gap-3 p-5 shadow-2xl">
            <h1 className="text-2xl">Accedi</h1>
            <form onSubmit={submit} className="grid gap-3">
              <label className="grid gap-1 text-sm">Email<input className="rounded-md border border-line p-2" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="username" required /></label>
              <label className="grid gap-1 text-sm">Password<input className="rounded-md border border-line p-2" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" required /></label>
              {need2fa && (
                <label className="grid gap-1 text-sm">Codice 2FA (6 cifre)<input className="rounded-md border border-line p-2" value={totpCode} onChange={(e) => setTotpCode(e.target.value)} inputMode="numeric" placeholder="000000" maxLength={6} autoComplete="one-time-code" /></label>
              )}
              <Turnstile onToken={setToken} />
              {err && <p className="text-sm font-semibold text-coral">{err}</p>}
              <button className="btn-primary" type="submit">Accedi</button>
              <div className="flex flex-wrap justify-between gap-2 text-sm font-bold">
                <a href="/gestionale/registrazione" className="text-ocean">Registra la tua azienda →</a>
                <a href="/gestionale/password-dimenticata" className="text-ocean">Password dimenticata?</a>
              </div>
              {da && <p className="text-xs text-muted">Dopo l'accesso torni alla pagina che avevi aperto.</p>}
              <p className="text-xs text-muted">La doppia chiave (codice dal telefono) si attiva <b>dopo l'accesso</b>, dalla sezione <b>Sicurezza</b>.</p>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
