"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import Turnstile from "@/components/Turnstile";
import { dimenticaUtente } from "@/components/Utente";

export default function RegistrazionePage() {
  const r = useRouter();
  const [f, setF] = useState({ azienda: "", nome: "", email: "", password: "" });
  const [modulo, setModulo] = useState<"noleggio" | "ormeggio" | "entrambi">("noleggio");
  const [ripeti, setRipeti] = useState("");
  const [token, setToken] = useState("");
  const [accetta, setAccetta] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);

  // Le due password devono coincidere: il controllo si fa mentre si scrive e all'invio.
  const nonCoincidono = ripeti.length > 0 && f.password !== ripeti;
  const passwordCorta = f.password.length > 0 && f.password.length < 10;
  const bloccato = nonCoincidono || passwordCorta || !accetta || done;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    if (f.password.length < 10) {
      setErr("La password deve avere almeno 10 caratteri");
      return;
    }
    if (f.password !== ripeti) {
      setErr("Le due password non coincidono");
      return;
    }
    if (!accetta) {
      setErr("Devi accettare i termini e la privacy per registrarti");
      return;
    }
    const res = await fetch("/api/v1/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...f, modulo, accettaTermini: accetta ? true : undefined, turnstileToken: token || undefined }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErr(j.error ?? "Registrazione fallita");
      return;
    }
    setDone(true);
    dimenticaUtente();
    // L'azienda è appena stata creata come "pending": si attende l'approvazione NaBoat.
    r.push("/gestionale/stato");
    r.refresh();
  };

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: e.target.value });

  return (
    <div className="w-full max-w-md">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-ocean"><img src="/img/logo-naboat-bianco.png" alt="" className="h-6 w-auto" /></span>
        <div>
          <p className="font-display text-lg font-extrabold leading-tight">NaBoat</p>
          <p className="text-xs text-muted">Gestionale per il noleggio nautico</p>
        </div>
      </div>
      <h1 className="mb-3 text-2xl">Registra la tua azienda</h1>
      <form onSubmit={submit} className="card grid gap-3 p-5">
        <label className="grid gap-1 text-sm">Azienda<input className="rounded-md border border-line p-2" value={f.azienda} onChange={set("azienda")} required /></label>
        <label className="grid gap-1 text-sm">Il tuo nome<input className="rounded-md border border-line p-2" value={f.nome} onChange={set("nome")} required /></label>
        <label className="grid gap-1 text-sm">Email<input className="rounded-md border border-line p-2" value={f.email} onChange={set("email")} type="email" required /></label>
        <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Che attività gestisci?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {[
              { id: "noleggio", titolo: "Noleggio barche", nota: "Flotta, prenotazioni, contratti" },
              { id: "ormeggio", titolo: "Ormeggio e rimessaggio", nota: "Posti, permanenze, servizi" },
              { id: "entrambi", titolo: "Entrambi", nota: "Puoi passare da un modulo all'altro" },
            ].map((scelta) => (
              <label
                key={scelta.id}
                className={`cursor-pointer rounded-lg border p-3 text-sm ${modulo === scelta.id ? "border-ocean bg-foam" : "border-line"}`}
              >
                <input
                  className="mr-2"
                  type="radio"
                  name="modulo"
                  checked={modulo === scelta.id}
                  onChange={() => setModulo(scelta.id as typeof modulo)}
                />
                <b className="block">{scelta.titolo}</b>
                <span className="text-xs text-muted">{scelta.nota}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="grid gap-1 text-sm">
          Password (min 10 caratteri)
          <input
            className={`rounded-md border p-2 ${passwordCorta ? "border-coral" : "border-line"}`}
            value={f.password}
            onChange={set("password")}
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
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={accetta} onChange={(e) => setAccetta(e.target.checked)} required />
          <span>
            Ho letto e accetto i <a href="/termini" target="_blank" rel="noreferrer" className="font-bold text-ocean">termini</a> e la{" "}
            <a href="/privacy" target="_blank" rel="noreferrer" className="font-bold text-ocean">privacy</a>.
          </span>
        </label>
        <Turnstile onToken={setToken} />
        {err && <p className="text-sm font-semibold text-coral">{err}</p>}
        <button className="btn-primary" type="submit" disabled={bloccato}>Registrati</button>
        <div className="flex justify-between text-sm font-bold">
          <a href="/gestionale/accesso" className="text-ocean">← Torna all'accesso</a>
        </div>
        <p className="text-xs text-muted">L'account resta in attesa di approvazione NaBoat. Ti invieremo un'email per confermare l'indirizzo.</p>
      </form>
    </div>
  );
}
