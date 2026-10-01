"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

type Boat = {
  id: string; nome: string; tipo?: string | null; codiceInterno?: string | null;
  capienza: number | null; potenzaCv: number | null; patenteRichiesta: boolean; stato: string;
  fotoCopertina?: string | null; pubblicata?: boolean; inPausa?: boolean; archiviato?: boolean;
  eliminazioneRichiestaAt?: string | null; updatedAt?: string;
  porto?: { id: string; nome: string } | null; modello?: { id: string; modello: string; marca: string | null } | null;
};

const STATO: Record<string, string> = { disponibile: "Disponibile", non_disponibile: "Non disponibile", manutenzione: "In manutenzione" };

export default function FlottaPage() {
  const [boats, setBoats] = useState<Boat[] | null>(null);
  const [me, setMe] = useState<{ tenantNome?: string; role?: string; tenantStatus?: string } | null>(null);
  const [ricerca, setRicerca] = useState("");
  const [archiviate, setArchiviate] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(() => {
    fetch(`/api/v1/boats?uso=noleggio${archiviate ? "&archiviate=1" : ""}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j) => { if (Array.isArray(j)) { setBoats(j); setErr(""); } else { setErr("Serve login con azienda attiva."); setBoats([]); } })
      .catch(() => { setErr("Serve login con azienda attiva."); setBoats([]); });
  }, [archiviate]);
  useEffect(load, [load]);
  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => (r.ok ? r.json() : null)).then((j) => setMe(j?.user ?? null)).catch(() => {});
  }, []);

  const q = ricerca.trim().toLowerCase();
  const filtrate = useMemo(() => (boats ?? []).filter((b) =>
    !q || b.nome.toLowerCase().includes(q) || (b.tipo ?? "").toLowerCase().includes(q) || (b.porto?.nome ?? "").toLowerCase().includes(q)
  ).sort((a, b) => new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime()), [boats, q]);

  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {!boats && !err && <Caricamento testo="Carico la flotta…" />}

      <section className="card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-ink">La tua flotta</h1>
            <p className="text-sm text-muted">
              {me?.tenantNome ?? "Azienda"}
              {me?.tenantStatus && <span className="ml-2 rounded-full bg-foam px-2 py-0.5 text-[11px] font-semibold text-ocean">{me.tenantStatus}</span>}
              {me?.role && <span className="ml-2 text-[11px] uppercase tracking-wide">{me.role}</span>}
              <span className="ml-2">· {(boats ?? []).length} barche</span>
            </p>
          </div>
          <Link href="/gestionale/flotta/nuova" className="btn-primary">+ Aggiungi barca</Link>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <input value={ricerca} onChange={(e) => setRicerca(e.target.value)} placeholder="Cerca per nome, tipo o porto…" className="rounded-full border border-line bg-white px-4 py-2 text-sm" />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={archiviate} onChange={(e) => setArchiviate(e.target.checked)} />
          Solo archiviate
        </label>
        <Link href="/gestionale/turni" className="ml-auto text-sm font-semibold text-ocean">Skipper e turni →</Link>
      </div>

      {boats && filtrate.length === 0 ? (
        <div className="card grid place-items-center gap-2 p-10 text-center">
          <p className="font-semibold">{q ? "Nessuna barca corrisponde alla ricerca." : archiviate ? "Nessuna barca archiviata." : "La flotta è vuota."}</p>
          {!q && !archiviate && <Link href="/gestionale/flotta/nuova" className="btn-primary mt-2">Aggiungi la prima barca</Link>}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtrate.map((b) => (
            <article key={b.id} className="card flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-muted">{b.tipo ?? "Imbarcazione"}{b.codiceInterno ? ` · ${b.codiceInterno}` : ""}</p>
                  <h2 className="truncate font-display text-lg font-bold text-ink">{b.nome}</h2>
                  <p className="mt-0.5 truncate text-sm text-muted">
                    {[b.modello ? `${b.modello.marca ?? ""} ${b.modello.modello}`.trim() : null, b.porto?.nome].filter(Boolean).join(" · ") || "Dati tecnici da completare"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {b.eliminazioneRichiestaAt ? <span className="badge-block text-[11px]">Eliminazione in corso</span> : <span className={b.stato === "disponibile" ? "badge-ready text-[11px]" : "badge-pending text-[11px]"}>{STATO[b.stato] ?? b.stato}</span>}
                  {b.archiviato && <span className="text-[11px] text-muted">archiviata</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div><p className="text-xs text-muted">Capacità</p><p className="font-bold">{b.capienza != null ? `${b.capienza} pax` : "Da configurare"}</p></div>
                <div><p className="text-xs text-muted">Potenza</p><p className="font-bold">{b.potenzaCv != null ? `${b.potenzaCv} CV` : "—"}</p></div>
                <div><p className="text-xs text-muted">Patente</p><p className="font-bold">{b.patenteRichiesta ? "Richiesta" : "Non richiesta"}</p></div>
              </div>
              <div className="mt-auto flex items-center gap-2">
                <Link href={`/gestionale/flotta/${b.id}`} className="btn-primary flex-1 text-center">Gestisci barca</Link>
                {b.pubblicata && !b.inPausa && <span className="badge-ready text-[11px]">Nel catalogo</span>}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
