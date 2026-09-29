"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });
const dataIt = (d?: string | null) => (d ? new Date(d).toLocaleDateString("it-IT") : "—");

export default function ContrattoOrmeggioPage() {
  const params = useParams<{ token: string }>();
  const [esito, setEsito] = useState<string | null>(null);
  const token = params.token;
  const [c, setC] = useState<any>(null);
  const [err, setErr] = useState("");
  const [nome, setNome] = useState("");
  const [accettato, setAccettato] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const carica = useCallback(() => {
    fetch(`/api/v1/ormeggio/contratto-public/${token}`)
      .then((r) => r.json())
      .then((j) => { if (j?.barca) setC(j); else setErr(j?.error ?? "Link non valido"); })
      .catch(() => setErr("Link non valido"));
  }, [token]);
  useEffect(() => { carica(); }, [carica]);
  useEffect(() => { setEsito(new URLSearchParams(window.location.search).get("esito")); }, []);

  const firma = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    const r = await fetch(`/api/v1/ormeggio/contratto-public/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome, accettato, versione: c?.versione, hash: c?.hash }) });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Firma non riuscita"); return; }
    setMsg("Contratto firmato. Grazie!");
    carica();
  };

  const paga = async () => {
    setBusy(true); setErr("");
    const r = await fetch(`/api/v1/ormeggio/contratto-public/${token}/paga`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setErr(j.error ?? "Pagamento non disponibile"); return; }
    if (j.url) window.location.href = j.url;
  };

  if (err && !c) return <div className="mx-auto max-w-xl p-6"><p className="card p-4 text-sm font-semibold text-coral">{err}</p></div>;
  if (!c) return <div className="mx-auto max-w-xl p-6"><p className="text-sm text-muted">Carico il contratto…</p></div>;

  const titolo = c.tipo === "rimessaggio_custodia" ? "Contratto di rimessaggio con custodia" : "Contratto di ormeggio con custodia";

  return (
    <div className="mx-auto max-w-2xl p-4 md:p-8">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-lg bg-deep text-white">⚓</span>
        <div><p className="font-display text-lg font-extrabold">{c.azienda}</p>{c.indirizzo && <p className="text-xs text-muted">{c.indirizzo}</p>}</div>
      </div>

      {esito === "ok" && <p className="card mb-3 p-3 text-sm font-semibold text-[#177469]">Pagamento completato. Grazie! L'ormeggiatore riceverà la conferma.</p>}
      {esito === "annullato" && <p className="card mb-3 p-3 text-sm font-semibold text-coral">Pagamento annullato.</p>}
      {msg && <p className="card mb-3 p-3 text-sm font-semibold text-[#177469]">{msg}</p>}
      {err && <p className="card mb-3 p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="card grid gap-3 p-5 text-sm">
        <h1 className="text-xl">{titolo}</h1>
        <p className="text-muted">Tra <b>{c.azienda}</b> (ormeggiatore) e <b>{c.proprietario?.nome ?? "—"}</b> (proprietario della barca).</p>
        <dl className="grid gap-1 rounded-md bg-foam p-3">
          <div>Barca: <b>{c.barca.nome}</b>{c.barca.tipo ? ` (${c.barca.tipo})` : ""}</div>
          <div>Posto: <b>{c.posto}</b> · {c.area}</div>
          <div>Periodo: <b>{dataIt(c.inizioAt)}</b> → <b>{c.finePrevistaAt ? dataIt(c.finePrevistaAt) : "indeterminato"}</b></div>
          <div>Corrispettivo: <b>{c.corrispettivoCent != null ? euro(c.corrispettivoCent) : "da definire"}</b></div>
        </dl>
        {c.servizi?.length > 0 && (
          <div>
            <p className="text-xs font-bold text-muted">SERVIZI AGGIUNTIVI</p>
            {c.servizi.map((s: any, i: number) => (
              <p key={i}>{s.tipo}{s.quantita ? ` — ${s.quantita}${s.unita ? ` ${s.unita}` : ""}` : ""}{s.prezzoCent != null ? ` · ${euro(s.prezzoCent)}` : ""}</p>
            ))}
          </div>
        )}
        <p className="text-xs text-muted">Il presente contratto è compilato automaticamente con i dati concordati. La sola messa a disposizione del posto non implica custodia: le prestazioni di custodia e servizi accessori sono quelle sopra indicate.</p>
        {c.legacy ? (
          <p className="rounded-md bg-[#fff4e5] p-2 text-xs text-muted">
            Documento anteriore all&apos;introduzione dell&apos;impronta digitale: il testo è ricostruito dai dati attuali e non è legato a una versione congelata.
          </p>
        ) : c.versione ? (
          <p className="text-[11px] text-muted">Versione documento {c.versione}{c.hash ? ` · impronta ${String(c.hash).slice(0, 12)}…` : ""}</p>
        ) : null}
      </div>

      <div className="card mt-4 grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Firma</h2>
        {c.firmatoAt ? (
          <p className="font-semibold text-[#177469]">Firmato da {c.firmaNome} il {new Date(c.firmatoAt).toLocaleString("it-IT")}</p>
        ) : (
          <form className="grid gap-3" onSubmit={firma}>
            <label className="grid gap-1">Nome e cognome
              <input className="rounded-md border border-line p-2" value={nome} onChange={(e) => setNome(e.target.value)} required />
            </label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={accettato} onChange={(e) => setAccettato(e.target.checked)} /> Dichiaro di aver letto e accettato le condizioni del contratto.</label>
            <button className="btn-primary w-fit" type="submit" disabled={busy}>{busy ? "Invio…" : "Firma il contratto"}</button>
          </form>
        )}
      </div>

      <div className="card mt-4 grid gap-3 p-5 text-sm">
        <h2 className="text-lg">Pagamento</h2>
        <div className="grid grid-cols-3 gap-2">
          <div><p className="text-xs text-muted">ADDEBITATO</p><p className="font-bold">{euro(c.conto.totaleAddebitiCent)}</p></div>
          <div><p className="text-xs text-muted">INCASSATO</p><p className="font-bold text-[#177469]">{euro(c.conto.incassatoCent)}</p></div>
          <div><p className="text-xs text-muted">RESIDUO</p><p className="font-bold text-coral">{euro(c.conto.residuoCent)}</p></div>
        </div>
        {c.pagato ? (
          <p className="font-semibold text-[#177469]">Risulta tutto pagato. Grazie!</p>
        ) : c.pagamentoAbilitato ? (
          <button className="btn-primary w-fit" onClick={paga} disabled={busy || c.conto.residuoCent <= 0}>{busy ? "Apro il pagamento…" : "Paga online"}</button>
        ) : (
          <p className="text-muted">Pagamento online non disponibile: contatta l'ormeggiatore{c.telefonoAzienda ? ` (${c.telefonoAzienda})` : ""} per il pagamento.</p>
        )}
      </div>

      <div className="mt-4 flex gap-2 text-sm">
        <button className="rounded-[7px] border border-line px-4 py-2 font-bold text-ocean" onClick={() => window.print()}>Stampa / Salva PDF</button>
      </div>
      <p className="mt-4 text-center text-xs text-muted">NaBoat · link riservato, non condividerlo con estranei.</p>
    </div>
  );
}
