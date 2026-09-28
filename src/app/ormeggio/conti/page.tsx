"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

// Riga del conto con dettaglio espandibile per barca/permanenza (senza perdere il dettaglio).
function FragmentRow({ c, aperto, onToggle }: { c: any; aperto: boolean; onToggle: () => void }) {
  return (
    <>
      <tr className="border-t border-line">
        <td className="p-2 font-semibold">
          <button className="mr-2 font-bold text-ocean" onClick={onToggle} title="Mostra il dettaglio per barca">{aperto ? "▾" : "▸"}</button>
          {c.nome}
        </td>
        <td className="p-2 text-muted">{c.telefono ?? c.email ?? "—"}</td>
        <td className="p-2">{c.barche}</td>
        <td className="p-2">{c.permanenze} <span className="text-muted">({c.aperte} attive)</span></td>
        <td className="p-2">{euro(c.addebitiCent)}</td>
        <td className="p-2 text-[#177469]">{euro(c.incassatoCent)}</td>
        <td className={`p-2 font-bold ${c.residuoCent > 0 ? "text-coral" : "text-[#177469]"}`}>{euro(c.residuoCent)}</td>
      </tr>
      {aperto && (
        <tr className="bg-[#faf6f2]">
          <td colSpan={7} className="p-3">
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="p-1">Barca</th><th className="p-1">Tipo</th><th className="p-1">Stato</th><th className="p-1">Addebitato</th><th className="p-1">Incassato</th><th className="p-1">Residuo</th></tr></thead>
              <tbody>
                {(c.dettaglio ?? []).map((d: any) => (
                  <tr key={d.permanenzaId} className="border-t border-line">
                    <td className="p-1"><a className="font-bold text-ocean" href={`/ormeggio/permanenza/${d.permanenzaId}`}>{d.boat}</a></td>
                    <td className="p-1">{d.tipo === "rimessaggio_custodia" ? "Rimessaggio" : "Ormeggio"}</td>
                    <td className="p-1">{d.stato}</td>
                    <td className="p-1">{euro(d.addebitiCent)}</td>
                    <td className="p-1 text-[#177469]">{euro(d.incassatoCent)}</td>
                    <td className="p-1 font-bold">{euro(d.residuoCent)}</td>
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
  const [conti, setConti] = useState<any[]>([]);
  const [err, setErr] = useState("");
  const [vedeImporti, setVedeImporti] = useState(true);
  const [aperto, setAperto] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => { if (j?.user?.vedeImporti === false) setVedeImporti(false); }).catch(() => {});
    fetch("/api/v1/ormeggio/conti")
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) setConti(j); else setErr(j.error ?? "Errore"); })
      .catch(() => setErr("Errore"));
  }, []);

  const totale = (k: string) => conti.reduce((s, c) => s + (c[k] ?? 0), 0);

  if (!vedeImporti) {
    return (
      <div className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><p className="text-sm text-muted">Ormeggio</p><h1 className="text-2xl">Conti per proprietario.</h1></div>
          <Link className="rounded-full border border-line px-3 py-2 text-sm font-bold text-ocean" href="/ormeggio">← Griglia</Link>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="text-sm text-muted">Ormeggio</p><h1 className="text-2xl">Conti per proprietario.</h1><p className="text-sm text-muted">Somma di addebiti e incassi di tutte le barche dello stesso proprietario.</p></div>
        <Link className="rounded-[7px] border border-line px-3 py-2 text-sm font-bold text-ocean" href="/ormeggio">← Griglia</Link>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="card p-4"><p className="text-xs text-muted">ADDEBITATO</p><p className="text-2xl font-bold">{euro(totale("addebitiCent"))}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">INCASSATO</p><p className="text-2xl font-bold text-[#177469]">{euro(totale("incassatoCent"))}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">RESIDUO</p><p className="text-2xl font-bold text-coral">{euro(totale("residuoCent"))}</p></div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-muted"><tr className="text-left"><th className="p-2">Proprietario</th><th className="p-2">Contatto</th><th className="p-2">Barche</th><th className="p-2">Soste</th><th className="p-2">Addebitato</th><th className="p-2">Incassato</th><th className="p-2">Residuo</th></tr></thead>
          <tbody>
            {conti.map((c) => (
              <FragmentRow key={c.id} c={c} aperto={!!aperto[c.id]} onToggle={() => setAperto((a) => ({ ...a, [c.id]: !a[c.id] }))} />
            ))}
            {conti.length === 0 && <tr><td className="p-3 text-muted" colSpan={7}>Nessun proprietario in anagrafica.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
