"use client";
import { useEffect, useState } from "react";

type Contratto = {
  azienda: string; logo: string | null; puntoPartenza: string | null; telefono: string | null;
  cliente: string | null; passeggeri: number; inizioAt: string; fineAt: string; destinazione: string | null;
  formula: string | null; barca: { nome: string; tipo: string | null; capienza: number; potenzaCv: number | null; patenteRichiesta: boolean };
  skipper: string | null; patenteOk: boolean; prezzoCent: number | null; cauzioneCent: number | null;
  firmatoAt: string | null; firmaNome: string | null;
};

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const quando = (s: string) => new Date(s).toLocaleString("it-IT", { dateStyle: "full", timeStyle: "short" });

export default function ContrattoPage({ params }: { params: Promise<{ token: string }> }) {
  const [token, setToken] = useState("");
  const [c, setC] = useState<Contratto | null>(null);
  const [err, setErr] = useState("");
  const [nome, setNome] = useState("");
  const [accettato, setAccettato] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fatto, setFatto] = useState(false);

  useEffect(() => { params.then((p) => setToken(p.token)); }, [params]);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/v1/contratto/public/${token}`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error ?? "Link non valido"); setC(j); setNome(j.firmaNome ?? ""); })
      .catch((e) => setErr(e.message));
  }, [token]);

  const firma = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/v1/contratto/public/${token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome, accettato }),
    });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Firma non riuscita"); return; }
    setFatto(true);
    setC((cur) => (cur ? { ...cur, firmatoAt: j.firmatoAt, firmaNome: j.firmaNome } : cur));
  };

  return (
    <div className="mx-auto grid max-w-2xl gap-4 p-5 text-sm">
      <div className="flex items-center gap-2 font-display font-extrabold">
        {c?.logo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={c.logo} alt={c.azienda} className="h-8 rounded border border-line bg-white object-contain p-0.5" />
        ) : (
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ocean"><img src="/img/logo-naboat-bianco.png" alt="" className="h-5 w-auto" /></span>
        )}
        {c?.azienda ?? "NaBoat"}
      </div>

      {err && <p className="card p-3 font-semibold text-coral">{err}</p>}

      {c && (
        <div className="card grid gap-4 p-5">
          <div>
            <p className="text-muted">Contratto di noleggio</p>
            <h1 className="text-2xl">Imbarcazione {c.barca.nome}</h1>
          </div>

          <div className="grid gap-1">
            <p><b>Noleggiante:</b> {c.azienda}{c.puntoPartenza ? ` — ${c.puntoPartenza}` : ""}{c.telefono ? ` — ${c.telefono}` : ""}</p>
            <p><b>Cliente:</b> {c.cliente ?? "—"}</p>
            <p><b>Periodo:</b> dal {quando(c.inizioAt)} al {quando(c.fineAt)}</p>
            <p><b>Passeggeri:</b> {c.passeggeri}</p>
            {c.destinazione ? <p><b>Destinazione:</b> {c.destinazione}</p> : null}
            {c.formula ? <p><b>Formula:</b> {c.formula}</p> : null}
          </div>

          <div className="grid gap-1 border-t border-line pt-3">
            <p><b>Imbarcazione:</b> {c.barca.nome}{c.barca.tipo ? ` (${c.barca.tipo})` : ""} · capienza {c.barca.capienza}{c.barca.potenzaCv ? ` · ${c.barca.potenzaCv} CV` : ""}</p>
            <p><b>Conduzione:</b> {c.skipper ? `con skipper ${c.skipper}` : c.patenteOk ? "con patente del cliente" : c.barca.patenteRichiesta ? "patente richiesta" : "senza patente"}</p>
            {c.prezzoCent ? <p><b>Prezzo del noleggio:</b> {euro(c.prezzoCent)}</p> : null}
            {c.cauzioneCent ? <p><b>Cauzione:</b> {euro(c.cauzioneCent)} (blocco sulla carta, non incassata salvo danni)</p> : null}
          </div>

          <div className="grid gap-2 border-t border-line pt-3 text-xs text-muted">
            <p className="font-bold text-ink">Condizioni</p>
            <p>1. Il cliente dichiara di aver ricevuto l'imbarcazione in buono stato e di riconsegnarla nelle stesse condizioni, salvo normale usura.</p>
            <p>2. Il cliente si impegna a rispettare le norme di navigazione, la capienza massima e a non condurre l'imbarcazione in condizioni meteomarine sfavorevoli.</p>
            <p>3. I danni causati da uso improprio sono a carico del cliente; eventuali addebiti vengono trattenuti dalla cauzione.</p>
            <p>4. Il carburante mancante al rientro è a carico del cliente.</p>
            <p>5. L'uscita può essere annullata per motivi di sicurezza o condizioni meteo sfavorevoli.</p>
          </div>

          {c.firmatoAt ? (
            <div className="rounded-md bg-[#e1f5f1] p-3">
              <p className="font-semibold text-[#177469]">Contratto firmato il {quando(c.firmatoAt)}</p>
              <p>Firma: <b>{c.firmaNome}</b></p>
              {fatto ? <p className="text-xs">Grazie, puoi chiudere questa pagina.</p> : null}
            </div>
          ) : (
            <form className="grid gap-3 border-t border-line pt-3" onSubmit={firma}>
              <label className="flex items-start gap-2">
                <input type="checkbox" checked={accettato} onChange={(e) => setAccettato(e.target.checked)} className="mt-1" />
                <span>Dichiaro di aver letto e di accettare le condizioni del contratto di noleggio.</span>
              </label>
              <label className="grid gap-1">Firma scrivendo nome e cognome
                <input className="rounded-md border border-line p-2" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Es. Mario Rossi" />
              </label>
              <button className="btn-primary w-fit" disabled={busy || !accettato || nome.trim().length < 3} type="submit">Firma il contratto</button>
              <p className="text-xs text-muted">La firma viene registrata con data, ora e indirizzo di rete del dispositivo.</p>
            </form>
          )}
        </div>
      )}

      {!c && !err && <p className="card p-3 text-muted">Caricamento…</p>}
    </div>
  );
}
