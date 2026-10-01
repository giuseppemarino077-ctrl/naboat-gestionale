"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

export default function StatoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [b, setB] = useState<{ nome: string; stato: string; archiviato: boolean; eliminazioneAt: string | null; pagamentiOnline: string } | null>(null);
  const [pag, setPag] = useState<{ impostazione: string; abilitati: boolean; motivo: string | null; azienda: { pagamentiAttivi: boolean; bloccatiNaBoat: boolean; providerConfigurato: boolean; status: string } } | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [nomeConferma, setNomeConferma] = useState("");
  const [busy, setBusy] = useState(false);
  const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

  const carica = () => {
    fetch(`/api/v1/boats/${id}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => setB({ nome: j.nome, stato: j.stato, archiviato: j.archiviato, eliminazioneAt: j.eliminazioneAt, pagamentiOnline: j.pagamentiOnline ?? "eredita" })).catch(() => setErr("Barca non trovata."));
    fetch(`/api/v1/payments/abilitazione?boatId=${id}`).then((r) => (r.ok ? r.json() : null)).then((j) => j && setPag(j)).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carica(); }, [id]);

  const salvaPagamenti = async (impostazione: string) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/boats/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pagamentiOnline: impostazione }) });
      if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Operazione non riuscita."); return; }
      setMsg("Impostazione pagamenti aggiornata."); carica();
    } finally { setBusy(false); }
  };

  const cambiaStato = async (stato: string, esito: string) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/boats/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stato }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); return; }
      setMsg(esito);
      carica();
    } finally { setBusy(false); }
  };

  const richiediRimozione = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/boats/${id}/rimozione`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confermaNome: nomeConferma }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Rimozione non consentita."); return; }
      setMsg("Rimozione richiesta: la barca sparisce dalla gestione ordinaria entro pochi minuti, lo storico resta.");
      carica();
    } finally { setBusy(false); }
  };

  const annullaRimozione = async () => {
    setBusy(true);
    try {
      await fetch(`/api/v1/boats/${id}/rimozione`, { method: "DELETE" });
      setMsg("Richiesta di rimozione annullata.");
      carica();
    } finally { setBusy(false); }
  };

  if (!b) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;

  const disponibile = b.stato === "disponibile";
  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Disponibilità operativa</h2>
        <p className={"text-sm font-semibold " + (disponibile ? "text-ok" : "text-warn")}>Stato attuale: {disponibile ? "Disponibile" : b.stato === "manutenzione" ? "In manutenzione" : "Non disponibile"}</p>
        <p className="text-sm text-muted">Riguarda il calendario e le nuove prenotazioni. Non cancella le prenotazioni esistenti e non tocca manutenzione, archivio, pausa o blocco amministrativo.</p>
        <div className="flex flex-wrap gap-2">
          {disponibile
            ? <button type="button" disabled={busy} onClick={() => cambiaStato("non_disponibile", "Barca segnata come non disponibile.")} className="rounded-xl border border-warn-line bg-warn-soft px-4 py-2.5 text-sm font-semibold text-warn">Segna come non disponibile</button>
            : <button type="button" disabled={busy} onClick={() => cambiaStato("disponibile", "Barca resa disponibile.")} className="btn-primary">Rendi disponibile</button>}
          {b.stato === "manutenzione" && <span className="rounded-xl bg-sand px-4 py-2.5 text-sm text-muted">In manutenzione: gestisci gli interventi da Manutenzione.</span>}
        </div>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Pagamenti online su questa barca</h2>
        {pag ? (
          <>
            <p className={"text-sm font-semibold " + (pag.abilitati ? "text-ok" : "text-warn")}>
              {pag.abilitati ? "Pagamenti online attivi per questa barca." : `Non disponibili: ${pag.motivo ?? "motivo non specificato"}.`}
            </p>
            {(!pag.azienda.pagamentiAttivi || !pag.azienda.providerConfigurato) && (
              <p className="rounded-xl bg-warn-soft p-3 text-xs text-warn">
                Azienda: pagamenti {pag.azienda.pagamentiAttivi ? "attivi" : "disattivati"}
                {pag.azienda.bloccatiNaBoat ? " · bloccati da NaBoat" : ""}
                {pag.azienda.providerConfigurato ? "" : " · provider non configurato"}.
                L'impostazione della barca non può aggirare questo stato.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-3">
              {([
                ["eredita", "Usa impostazione azienda"],
                ["attivi", "Attivi per questa barca"],
                ["disattivati", "Disattivati per questa barca"],
              ] as const).map(([v, label]) => (
                <label key={v} className={"flex min-h-11 cursor-pointer items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold " + (b.pagamentiOnline === v ? "border-ocean bg-foam text-ocean" : "border-line bg-white text-ink")}>
                  <input type="radio" className="sr-only" checked={b.pagamentiOnline === v} disabled={busy} onChange={() => salvaPagamenti(v)} />
                  {label}
                </label>
              ))}
            </div>
          </>
        ) : <p className="text-sm text-muted">Calcolo dell'abilitazione…</p>}
      </section>

      <section className="card grid gap-3 border border-danger-line p-5">
        <h2 className="font-display text-lg font-bold text-ink">Eliminazione</h2>
        <p className="text-sm text-muted">La barca diventa subito indisponibile e viene rimossa dalla gestione ordinaria (flotta e calendario) dopo circa due minuti. Lo storico di contratti, conti e report resta intatto. La richiesta è persistita e funziona anche chiudendo la scheda.</p>
        {b.eliminazioneAt ? (
          <div className="grid gap-2">
            <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">Eliminazione in corso: rimozione operativa prevista per {new Date(b.eliminazioneAt).toLocaleString("it-IT")}.</p>
            <button type="button" disabled={busy} onClick={annullaRimozione} className="btn-soft w-fit">Annulla richiesta</button>
          </div>
        ) : (
          <div className="grid gap-2">
            <label className="grid gap-1 text-sm font-semibold">Digita esattamente il nome «{b.nome}» per confermare<input value={nomeConferma} onChange={(e) => setNomeConferma(e.target.value)} className={campo} /></label>
            <button type="button" disabled={busy || nomeConferma.trim() !== b.nome} onClick={richiediRimozione} className="w-fit rounded-xl bg-danger px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Elimina barca</button>
          </div>
        )}
      </section>
    </div>
  );
}
