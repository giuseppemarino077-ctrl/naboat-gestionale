"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { dimenticaUtente, ricaricaUtente, useUtente } from "@/components/Utente";
import { aziendaNonAttiva, destinazioneAccesso } from "@/lib/accesso";

// Pagina di stato per un'azienda la cui pratica non è ancora attiva.
// Non è bloccata dall'operatività: qui si può verificare l'email, configurare la
// sicurezza e uscire, ma non si entra nel gestionale finché NaBoat non approva.
const TESTI: Record<string, { titolo: string; testo: string }> = {
  pending: {
    titolo: "Azienda in attesa di approvazione",
    testo:
      "Abbiamo ricevuto la registrazione. NaBoat verifica i dati dell'azienda e ti avvisa appena è tutto pronto. Nel frattempo puoi confermare l'indirizzo email e attivare la doppia chiave dalla sezione Sicurezza.",
  },
  suspended: {
    titolo: "Azienda sospesa",
    testo: "L'accesso al gestionale è sospeso. Per chiarimenti scrivi a info@naboat.it: ti rispondiamo appena possibile.",
  },
  rejected: {
    titolo: "Registrazione non approvata",
    testo: "La registrazione non è stata accettata. Puoi scrivere a info@naboat.it per assistenza.",
  },
};

export default function InAttesaPage() {
  const r = useRouter();
  const utente = useUtente();

  useEffect(() => {
    if (utente && !aziendaNonAttiva(utente.tenantStatus)) {
      r.replace(destinazioneAccesso(utente));
    }
  }, [utente, r]);

  const esci = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    dimenticaUtente();
    window.location.href = "/login";
  };

  const aggiorna = async () => {
    const u = await ricaricaUtente();
    if (u && !aziendaNonAttiva(u.tenantStatus)) r.replace(destinazioneAccesso(u));
  };

  const stato = utente?.tenantStatus ?? "pending";
  const testi = TESTI[stato] ?? TESTI.pending;

  return (
    <div className="mx-auto max-w-xl p-5">
      <div className="card grid gap-4 p-6">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-ocean">
            <img src="/img/logo-naboat-bianco.png" alt="" className="h-7 w-auto" />
          </span>
          <div>
            <p className="font-display text-lg font-extrabold leading-tight">NaBoat</p>
            <p className="text-xs text-muted">{utente?.tenantNome ?? "La tua azienda"}</p>
          </div>
        </div>

        <h1 className="text-2xl">{testi.titolo}</h1>
        <p className="text-sm text-muted">{testi.testo}</p>

        {utente?.emailVerified === false && (
          <p className="rounded-xl border border-gold/50 bg-[#fff7e6] p-3 text-sm text-[#9a6406]">
            L'indirizzo email non è ancora confermato: apri il messaggio che ti abbiamo inviato e segui il collegamento.
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button onClick={aggiorna} className="btn-primary">Aggiorna lo stato</button>
          <a href="/sicurezza" className="btn-soft">Sicurezza</a>
          <button onClick={esci} className="btn-soft">Esci</button>
        </div>

        <p className="text-xs text-muted">
          Assistenza: <a className="underline" href="mailto:info@naboat.it">info@naboat.it</a>
        </p>
      </div>
    </div>
  );
}
