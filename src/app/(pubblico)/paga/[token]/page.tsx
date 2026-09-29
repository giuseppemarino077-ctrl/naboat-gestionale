"use client";
import { useEffect, useState } from "react";

type Dati = {
  boat: string;
  data: string;
  passeggeri: number;
  destinazione?: string | null;
  prezzoCent: number | null;
  accontoPct: number;
  accontoCent: number;
  pagato: number;
  stripeDisponibile: boolean;
  cauzioneCent: number | null;
  cauzioneStato: string;
};

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function PaginaPubblica({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [dati, setDati] = useState<Dati | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [esito, setEsito] = useState("");

  useEffect(() => {
    params.then((p) => {
      setToken(p.token);
      const e = new URLSearchParams(window.location.search).get("esito");
      if (e === "ok") setEsito("ok");
      if (e === "annullato") setEsito("annullato");
    });
  }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/payments/public/${token}`)
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error ?? "Link non valido");
        setDati(j);
      })
      .catch((e) => setErr(e.message));
  }, [token]);

  const paga = async (tipo: "acconto" | "totale" | "cauzione") => {
    setBusy(true); setErr("");
    const r = await fetch(`/api/v1/payments/public/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Pagamento non disponibile"); return; }
    if (j.url) window.location.href = j.url;
  };

  return (
    <div className="mx-auto grid max-w-lg gap-4 p-5">
      <div className="flex items-center gap-2 font-display font-extrabold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-ocean"><img src="/img/logo-naboat-bianco.png" alt="" className="h-5 w-auto" /></span>
        NaBoat
      </div>

      {esito === "ok" && <p className="card p-3 text-sm font-semibold text-[#177469]">Pagamento completato. Grazie! Riceverai conferma dal noleggiatore.</p>}
      {esito === "cauzione-ok" && <p className="card p-3 text-sm font-semibold text-[#177469]">Cauzione autorizzata: l'importo è solo bloccato sulla carta e verrà rilasciato al rientro, salvo danni.</p>}
      {esito === "cauzione-annullata" && <p className="card p-3 text-sm font-semibold text-[#9a6406]">Autorizzazione della cauzione annullata. Puoi riprovare da questa pagina.</p>}
      {esito === "annullato" && <p className="card p-3 text-sm font-semibold text-[#9a6406]">Pagamento annullato. Puoi riprovare quando vuoi da questa pagina.</p>}
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      {!dati && !err && <p className="card p-3 text-sm text-muted">Caricamento…</p>}

      {dati && (
        <div className="card grid gap-3 p-5 text-sm">
          <div>
            <p className="text-sm text-muted">Pagamento prenotazione</p>
            <h1 className="text-2xl">{dati.boat}</h1>
          </div>
          <div className="grid gap-1">
            <p>Data: <b>{new Date(dati.data).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" })}</b></p>
            <p>Passeggeri: <b>{dati.passeggeri}</b>{dati.destinazione ? <> · Destinazione: <b>{dati.destinazione}</b></> : null}</p>
            {dati.prezzoCent ? <p>Prezzo del noleggio: <b>{euro(dati.prezzoCent)}</b></p> : null}
          </div>

          {dati.pagato > 0 && <p className="rounded-md bg-[#e1f5f1] p-2 font-semibold text-[#177469]">Risulta già un pagamento registrato.</p>}

          {!dati.stripeDisponibile ? (
            <p className="rounded-md bg-[#fff0cc] p-2 text-[#9a6406]">Il pagamento con carta non è disponibile: contatta il noleggiatore.</p>
          ) : (
            <div className="grid gap-2">
              <button className="btn-primary" disabled={busy} onClick={() => paga("acconto")}>
                Paga acconto {dati.accontoPct}% — {euro(dati.accontoCent)}
              </button>
              {dati.prezzoCent ? (
                <button className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" disabled={busy} onClick={() => paga("totale")}>
                  Paga l'intero importo — {euro(dati.prezzoCent)}
                </button>
              ) : null}
              {dati.cauzioneCent && dati.cauzioneStato !== "autorizzata" && dati.cauzioneStato !== "addebitata" ? (
                <button className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" disabled={busy} onClick={() => paga("cauzione")}>
                  Autorizza cauzione — {euro(dati.cauzioneCent)} (blocco, non incassata)
                </button>
              ) : null}
              <p className="text-xs text-muted">Il pagamento è gestito da Stripe: i dati della carta non passano dai nostri server. La cauzione è un blocco sulla carta: viene incassata solo se ci sono danni.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
