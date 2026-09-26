"use client";
import { useUtente } from "@/components/Utente";
import { useEffect, useState } from "react";

type Stato = {
  obbligatorio: boolean;
  tipi: string[];
  mesiPerStagione: number;
  listino: { attivazioneCent: number; mensileCent: number; stagionaleCent: number };
  attivazione: { id: string; pagataAt: string | null; prezzoCent: number } | null;
  manutenzione: { id: string; tipo: string; fineAt: string; giorniResidui: number } | null;
  marketplace: { attivo: boolean; feePct: number };
  storico: any[];
  pagamentoCartaDisponibile: boolean;
};

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (s: string) => new Date(s).toLocaleDateString("it-IT");
const nomeTipo = (t: string, q = 1) =>
  t === "attivazione" ? "Attivazione e installazione" : t === "manutenzione_stagionale" ? `Manutenzione ${q} stagion${q === 1 ? "e" : "i"}` : `Manutenzione ${q} mes${q === 1 ? "e" : "i"}`;

export default function AbbonamentoPage() {
  const utente = useUtente();
  const sonoProprietario = utente?.role === "owner" || utente?.role === "superadmin";
  const [stato, setStato] = useState<Stato | null>(null);
  const [tipo, setTipo] = useState("manutenzione_mensile");
  const [quantita, setQuantita] = useState(3);
  const [prev, setPrev] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    fetch("/api/v1/subscription")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Errore"); setStato(j); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  useEffect(() => {
    setPrev(null);
    fetch("/api/v1/subscription", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, quantita }) })
      .then((r) => r.json())
      .then((j) => { if (!j.error) setPrev(j); })
      .catch(() => {});
  }, [tipo, quantita]);

  useEffect(() => {
    const e = new URLSearchParams(window.location.search).get("esito");
    if (e === "ok") setMsg("Pagamento ricevuto: il servizio risulta attivo.");
    if (e === "annullato") setMsg("Pagamento annullato: puoi riprovare quando vuoi.");
  }, []);

  const paga = async () => {
    setBusy(true); setErr("");
    const r = await fetch("/api/v1/subscription", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tipo, quantita }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Pagamento non disponibile"); return; }
    if (j.url) window.location.href = j.url;
  };

  const seleziona = (t: string) => {
    setTipo(t);
    setQuantita(t === "attivazione" ? 1 : t === "manutenzione_stagionale" ? 1 : 3);
  };

  const unitario = stato ? (tipo === "attivazione" ? stato.listino.attivazioneCent : tipo === "manutenzione_stagionale" ? stato.listino.stagionaleCent : stato.listino.mensileCent) : 0;
  const max = tipo === "manutenzione_stagionale" ? 10 : 24;

  return (
    <div className="mx-auto grid max-w-3xl gap-4">
      <div><p className="text-sm text-muted">Servizi NaBoat</p><h1 className="text-2xl">Gestionale e marketplace, separati.</h1></div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      {stato && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <div className={`card p-4 text-sm ${stato.manutenzione ? "border-[#bfe4dc] bg-[#e1f5f1]" : stato.obbligatorio ? "border-[#ffe0a3] bg-[#fff8e6]" : ""}`}>
              <p className="text-xs tracking-widest text-muted">GESTIONALE</p>
              {stato.attivazione ? (
                <p className="mt-1"><b>Attivazione pagata</b>{stato.attivazione.pagataAt ? ` il ${dataIt(stato.attivazione.pagataAt)}` : ""}.</p>
              ) : (
                <p className="mt-1"><b>Attivazione da fare</b> — comprende installazione, caricamento delle imbarcazioni iniziali e formazione: {stato.listino.attivazioneCent > 0 ? euro(stato.listino.attivazioneCent) : "da definire"}.</p>
              )}
              {stato.manutenzione ? (
                <p className="mt-2"><b>Manutenzione attiva</b> fino al <b>{dataIt(stato.manutenzione.fineAt)}</b> ({stato.manutenzione.giorniResidui} giorni residui).</p>
              ) : (
                <p className="mt-2"><b>Manutenzione non attiva.</b> {stato.obbligatorio ? "Per usare il portale serve attivare un canone." : "Il canone non è obbligatorio in questo momento."}</p>
              )}
            </div>

            <div className="card p-4 text-sm">
              <p className="text-xs tracking-widest text-muted">MARKETPLACE</p>
              {stato.marketplace.attivo ? (
                <>
                  <p className="mt-1"><b>Attivo</b>: la tua attività può ricevere prenotazioni dal canale NaBoat.</p>
                  <p className="mt-2">Su quelle prenotazioni si applica una fee del <b>{stato.marketplace.feePct}%</b>. Sulle prenotazioni dirette <b>nessuna fee</b>.</p>
                </>
              ) : (
                <p className="mt-1"><b>Non attivo</b>: usi solo il gestionale. Nessuna pubblicazione su NaBoat e <b>nessuna fee</b> sulle tue prenotazioni. Per attivarlo, contatta NaBoat.</p>
              )}
            </div>
          </div>

          <div className="card grid gap-3 p-5 text-sm">
            <h2 className="text-lg">Attiva o rinnova</h2>
            {!sonoProprietario ? (
              <p className="text-muted">Solo il proprietario dell'azienda può attivare o rinnovare i servizi. Qui puoi consultare lo stato.</p>
            ) : (
              <>
            <div className="flex flex-wrap gap-2">
              {stato.tipi.map((t) => (
                <button
                  key={t}
                  onClick={() => seleziona(t)}
                  disabled={t === "attivazione" && !!stato.attivazione}
                  className={`rounded-full px-4 py-1.5 text-xs font-bold ${tipo === t ? "bg-deep text-white" : "border border-line bg-white text-muted"} ${t === "attivazione" && stato.attivazione ? "opacity-40" : ""}`}
                >
                  {nomeTipo(t)}
                </button>
              ))}
            </div>

            {stato.tipi.includes(tipo) && tipo !== "attivazione" && (
              <label className="grid gap-1 md:w-48">Quanti {tipo === "manutenzione_stagionale" ? "stagioni" : "mesi"}?
                <input className="rounded-md border border-line p-2" type="number" min={1} max={max} value={quantita} onChange={(e) => setQuantita(Number(e.target.value))} />
              </label>
            )}

            <p className="text-muted">
              Prezzo: {unitario > 0 ? `${euro(unitario)} ${tipo === "attivazione" ? "una volta" : tipo === "manutenzione_stagionale" ? "per stagione" : "al mese"}` : "da definire con NaBoat"}
            </p>

            {prev && !prev.error && (
              <div className="rounded-md bg-[#f7f4ee] p-3">
                <p><b>{prev.etichetta}</b></p>
                {tipo !== "attivazione" && <p>Dal <b>{dataIt(prev.inizioAt)}</b> al <b>{dataIt(prev.fineAt)}</b></p>}
                <p className="text-lg font-bold">Totale: {euro(prev.prezzoCent)}</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button className="btn-primary" disabled={busy || !stato.pagamentoCartaDisponibile} onClick={paga}>Paga con carta</button>
              {!stato.pagamentoCartaDisponibile && <span className="text-xs text-muted">Pagamento con carta non disponibile: contatta NaBoat per il bonifico.</span>}
            </div>
            <p className="text-xs text-muted">Il pagamento va a NaBoat. Se hai già una manutenzione attiva, il nuovo periodo si aggiunge dopo la scadenza.</p>
              </>
            )}
          </div>

          {stato.storico?.length > 0 && (
            <div className="card overflow-x-auto">
              <div className="border-b border-line p-3 text-sm font-bold">Storico</div>
              <table className="w-full text-sm">
                <thead className="text-muted"><tr className="text-left">
                  <th className="p-2">Creato</th><th className="p-2">Voce</th><th className="p-2">Dal</th><th className="p-2">Al</th><th className="p-2">Importo</th><th className="p-2">Metodo</th><th className="p-2">Stato</th>
                </tr></thead>
                <tbody>
                  {stato.storico.map((s) => (
                    <tr key={s.id} className="border-t border-line">
                      <td className="p-2">{dataIt(s.createdAt)}</td>
                      <td className="p-2">{s.etichetta ?? nomeTipo(s.tipo, s.quantita)}</td>
                      <td className="p-2">{dataIt(s.inizioAt)}</td>
                      <td className="p-2">{s.tipo === "attivazione" ? "—" : dataIt(s.fineAt)}</td>
                      <td className="p-2 font-semibold">{euro(s.prezzoCent)}</td>
                      <td className="p-2">{s.metodo ?? "—"}</td>
                      <td className="p-2"><span className={s.stato === "attivo" ? "badge-ready" : s.stato === "in_attesa" ? "badge-pending" : "badge-block"}>{s.stato}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {!stato && !err && <p className="card p-3 text-sm text-muted">Caricamento…</p>}
    </div>
  );
}
