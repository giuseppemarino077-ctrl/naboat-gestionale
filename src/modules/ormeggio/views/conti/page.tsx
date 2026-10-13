"use client";
import { richiestaOrmeggio } from "@/modules/ormeggio/richiesta";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Dialogo } from "@/components/ui/Dialogo";
import { useUtente } from "@/components/Utente";
import { IntestazioneOrmeggio, RiepilogoOrmeggio } from "@/modules/ormeggio/components/IntestazioneOrmeggio";
import { TariffeSosta } from "@/modules/ormeggio/components/TariffeSosta";
import { useAggiornamenti } from "@/lib/aggiorna";

type DettaglioConto = { permanenzaId: string; boat: string; tipo: string; stato: string; inizioAt: string; addebitiCent: number; incassatoCent: number; residuoCent: number; creditoCent: number };
type Conto = { id: string; nome: string; telefono: string | null; email: string | null; archiviato: boolean; barche: number; permanenze: number; aperte: number; addebitiCent: number; incassatoCent: number; residuoCent: number; creditoCent: number; dettaglio: DettaglioConto[] };

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

// Riga del conto con dettaglio espandibile per barca/permanenza (senza perdere il dettaglio).
function FragmentRow({ c, aperto, onToggle, onApri }: { c: Conto; aperto: boolean; onToggle: () => void; onApri: () => void }) {
  return (
    <>
      <tr className="border-t border-line">
        <td className="p-2 font-semibold">
          <button className="mr-2 font-bold text-ocean" onClick={onToggle} aria-expanded={aperto} aria-label={`${aperto ? "Chiudi" : "Mostra"} dettaglio di ${c.nome}`} title="Mostra il dettaglio per barca">{aperto ? "▾" : "▸"}</button>
          <button className="text-left text-ocean hover:underline" onClick={onApri}>{c.nome} →</button>{c.archiviato && <span className="ml-2 text-xs text-muted">eliminato · storico</span>}
        </td>
        <td className="p-2 text-muted">{c.telefono ?? c.email ?? "—"}</td>
        <td className="p-2">{c.barche}</td>
        <td className="p-2">{c.permanenze} <span className="text-muted">({c.aperte} attive)</span></td>
        <td className="p-2">{euro(c.addebitiCent)}</td>
        <td className="p-2 text-[#177469]">{euro(c.incassatoCent)}</td>
        <td className={`p-2 font-bold ${c.residuoCent > 0 ? "text-coral" : "text-[#177469]"}`}>{euro(c.residuoCent)}{c.creditoCent > 0 && <span className="block text-xs font-normal text-ocean">Credito {euro(c.creditoCent)}</span>}</td>
      </tr>
      {aperto && (
        <tr className="bg-[#f7faf9]">
          <td colSpan={7} className="p-3">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="p-1">Barca</th><th className="p-1">Tipo</th><th className="p-1">Stato</th><th className="p-1">Addebitato</th><th className="p-1">Incassato</th><th className="p-1">Residuo</th></tr></thead>
              <tbody>
                {(c.dettaglio ?? []).map((d: DettaglioConto) => (
                  <tr key={d.permanenzaId} className="border-t border-line">
                    <td className="p-1"><Link className="font-bold text-ocean" href={`/gestionale/ormeggio/permanenza/${d.permanenzaId}?tab=conto`}>{d.boat}</Link></td>
                    <td className="p-1">{d.tipo === "rimessaggio_custodia" ? "Rimessaggio" : "Ormeggio"}</td>
                    <td className="p-1">{d.stato}</td>
                    <td className="p-1">{euro(d.addebitiCent)}</td>
                    <td className="p-1 text-[#177469]">{euro(d.incassatoCent)}</td>
                    <td className="p-1 font-bold">{euro(d.residuoCent)}{d.creditoCent > 0 && <span className="block text-ocean">Credito {euro(d.creditoCent)}</span>}</td>
                  </tr>
                ))}
                {(c.dettaglio ?? []).length === 0 && <tr><td className="p-1 text-muted" colSpan={6}>Nessuna sosta.</td></tr>}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

export default function ContiPage() {
  const [conti, setConti] = useState<Conto[]>([]);
  const [err, setErr] = useState("");
  const utente = useUtente();
  const vedeImporti = utente?.vedeImporti === true;
  const [q, setQ] = useState("");
  const [soloResidui, setSoloResidui] = useState(false);
  const [caricamento, setCaricamento] = useState(true);
  const [selezionatoId, setSelezionatoId] = useState<string | null>(null);
  const [aperto, setAperto] = useState<Record<string, boolean>>({});

  const carica = useCallback(async () => {
    if (!vedeImporti) return;
    try {
      const r = await richiestaOrmeggio("/api/v1/ormeggio/conti");
      const j = await r.json();
      if (!r.ok || !Array.isArray(j)) { setErr(j.error ?? "Non riesco a leggere i conti."); return; }
      setConti(j);
    } catch { setErr("Connessione interrotta. Riprova."); }
    finally { setCaricamento(false); }
  }, [vedeImporti]);
  useEffect(() => { carica(); }, [carica]);
  useAggiornamenti(carica, ["ormeggio"]);
  const visibili = conti.filter((c) => (!soloResidui || c.residuoCent > 0) && `${c.nome} ${c.telefono ?? ""} ${c.email ?? ""} ${(c.dettaglio ?? []).map((d: DettaglioConto) => d.boat).join(" ")}`.toLowerCase().includes(q.trim().toLowerCase()));

  const selezionato = conti.find((c) => c.id === selezionatoId);
  const totale = (k: "addebitiCent" | "incassatoCent" | "residuoCent" | "creditoCent") => conti.reduce((s, c) => s + (c[k] ?? 0), 0);

  if (!utente) return <p role="status" className="text-sm text-muted">Verifico i permessi…</p>;

  if (!vedeImporti) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm text-muted">Ormeggio</p><h1 className="text-2xl">Conti per proprietario.</h1></div>
          <Link className="rounded-full border border-line px-3 py-2 text-sm font-bold text-ocean" href="/gestionale/ormeggio">← Griglia</Link>
        </div>
        <div className="card grid place-items-center gap-2 p-8 text-center">
          <p className="font-semibold">Importi non visibili.</p>
          <p className="text-sm text-muted">Il tuo profilo non ha il permesso di leggere o modificare i conti. Chiedi al titolare di attivare «Vede importi» da Team.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <IntestazioneOrmeggio titolo="Economia" descrizione="Conti per proprietario, con dettaglio per barca e permanenza." azioni={<button className="btn-soft" onClick={() => { setErr(""); carica(); }}>Aggiorna</button>} />
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <RiepilogoOrmeggio voci={[{ nome: "Addebitato", valore: euro(totale("addebitiCent")) }, { nome: "Incassato", valore: euro(totale("incassatoCent")) }, { nome: "Residuo", valore: euro(totale("residuoCent")) }]} />
      {totale("creditoCent") > 0 && <p className="text-sm text-muted">Crediti sulle singole soste: {euro(totale("creditoCent"))}. Restano separati dagli importi dovuti per altre barche.</p>}
      <TariffeSosta />
      <div className="flex flex-wrap items-center gap-3">
        <input aria-label="Cerca nei conti" className="campo min-w-[180px] flex-1" placeholder="Proprietario, contatto o barca…" value={q} onChange={(e) => setQ(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={soloResidui} onChange={(e) => setSoloResidui(e.target.checked)} /> Solo conti da saldare</label>
        <span className="text-xs text-muted">{visibili.length} proprietari</span>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left"><th className="p-2">Proprietario</th><th className="p-2">Contatto</th><th className="p-2">Barche</th><th className="p-2">Soste</th><th className="p-2">Addebitato</th><th className="p-2">Incassato</th><th className="p-2">Residuo</th></tr></thead>
          <tbody>
            {visibili.map((c) => (
              <FragmentRow key={c.id} c={c} onApri={() => setSelezionatoId(c.id)} aperto={!!aperto[c.id]} onToggle={() => setAperto((a) => ({ ...a, [c.id]: !a[c.id] }))} />
            ))}
            {visibili.length === 0 && <tr><td className="p-3 text-muted" colSpan={7}>{caricamento ? "Carico i conti…" : err ? "Conti non disponibili." : "Nessun conto corrisponde ai filtri."}</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialogo aperto={!!selezionato} onChiudi={() => setSelezionatoId(null)} titolo={`Conto di ${selezionato?.nome ?? ""}`} larghezza="max-w-3xl">
        {selezionato && <div className="grid gap-4">
          <p className="text-sm text-muted">{[selezionato.telefono, selezionato.email].filter(Boolean).join(" · ") || "Nessun recapito registrato"}</p>
          {selezionato.archiviato && <p className="rounded-xl bg-foam p-3 text-sm">Proprietario eliminato dagli elenchi operativi. Qui restano disponibili contabilità e documenti.</p>}
          <RiepilogoOrmeggio voci={[{ nome: "Addebitato", valore: euro(selezionato.addebitiCent) }, { nome: "Incassato", valore: euro(selezionato.incassatoCent) }, { nome: "Residuo", valore: euro(selezionato.residuoCent) }]} />
          <p className="text-sm text-muted">Scegli la sosta per gestire addebiti, incassi, rettifiche, storni e riepilogo PDF.</p>
          {(selezionato.dettaglio ?? []).map((d: DettaglioConto) => <Link key={d.permanenzaId} href={`/gestionale/ormeggio/permanenza/${d.permanenzaId}?tab=conto`} className="grid gap-2 rounded-2xl border border-line p-4 hover:border-ocean hover:bg-foam sm:grid-cols-[1fr_auto]">
            <span><b className="block text-ocean">{d.boat}</b><span className="text-xs text-muted">{new Date(d.inizioAt).toLocaleDateString("it-IT")} · {d.stato === "attiva" ? "Sosta attiva" : "Sosta chiusa"}</span></span>
            <span className="text-sm"><span className="block">Addebiti {euro(d.addebitiCent)} · Incassi {euro(d.incassatoCent)}</span><b className={d.residuoCent > 0 ? "text-coral" : "text-ocean"}>Residuo {euro(d.residuoCent)} · Gestisci conto →</b>{d.creditoCent > 0 && <span className="block text-ocean">Credito {euro(d.creditoCent)}</span>}</span>
          </Link>)}
          {!selezionato.dettaglio?.length && <p className="text-sm text-muted">Nessuna sosta e nessun movimento economico registrati.</p>}
        </div>}
      </Dialogo>
    </div>
  );
}
