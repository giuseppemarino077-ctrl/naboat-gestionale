"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { aggiungiGiorni, giornoDi, oggi, oreDi } from "@/lib/calendario";
import { Avviso } from "@/components/ui/Avviso";
import { useConferma } from "@/components/ui/Dialogo";

type Blocco = { id: string; startAt: string; endAt: string; motivo: string | null };
const daInput = (v: string) => (v ? { g: v.slice(0, 10), o: v.slice(11, 16) } : null);
const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

export default function DisponibilitaPage() {
  const { id } = useParams<{ id: string }>();
  const conferma = useConferma();
  const [blocchi, setBlocchi] = useState<Blocco[]>([]);
  const [inizio, setInizio] = useState(`${oggi()}T09:00`);
  const [fine, setFine] = useState(`${aggiungiGiorni(oggi(), 1)}T18:00`);
  const [motivo, setMotivo] = useState("");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const carica = useCallback(() => {
    const from = aggiungiGiorni(oggi(), -365);
    const to = aggiungiGiorni(oggi(), 730);
    fetch(`/api/v1/blocks?boatId=${id}&from=${encodeURIComponent(`${from}T00:00:00.000Z`)}&to=${encodeURIComponent(`${to}T00:00:00.000Z`)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((j) => Array.isArray(j) && setBlocchi(j))
      .catch(() => {});
  }, [id]);
  useEffect(carica, [carica]);

  const crea = async () => {
    setErr(""); setMsg("");
    const i = daInput(inizio); const f = daInput(fine);
    if (!i || !f) { setErr("Indica inizio e fine."); return; }
    const { istante } = await import("@/lib/calendario");
    const start = istante(i.g, i.o); const end = istante(f.g, f.o);
    if (!(start < end)) { setErr("La fine deve essere successiva all'inizio."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/blocks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boatId: id, startAt: start.toISOString(), endAt: end.toISOString(), motivo: motivo || undefined }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Non è stato possibile creare il blocco."); return; }
      setMsg("Periodo reso non disponibile."); setMotivo(""); carica();
    } finally { setBusy(false); }
  };

  const rimuovi = async (b: Blocco) => {
    const ok = await conferma.chiedi({ titolo: "Rimuovere il periodo?", messaggio: "Il blocco viene eliminato completamente.", confermaLabel: "Rimuovi", pericoloso: true });
    if (!ok) return;
    await fetch(`/api/v1/blocks/${b.id}`, { method: "DELETE" });
    setMsg("Periodo rimosso."); carica();
  };

  const liberaGiorno = async (b: Blocco, giorno: string) => {
    const r = await fetch(`/api/v1/blocks/${b.id}/giorno`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ giorno }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); return; }
    setMsg("Giorno liberato."); carica();
  };

  const fmt = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" });
  void giornoDi; void oreDi;

  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Aggiungi un periodo di indisponibilità</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Inizio<input type="datetime-local" value={inizio} onChange={(e) => setInizio(e.target.value)} className={campo} /></label>
          <label className="grid gap-1 text-sm font-semibold">Fine<input type="datetime-local" value={fine} onChange={(e) => setFine(e.target.value)} className={campo} /></label>
        </div>
        <label className="grid gap-1 text-sm font-semibold">Motivo (facoltativo)<textarea rows={2} maxLength={1000} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={campo + " py-2"} /></label>
        <div><button type="button" disabled={busy} onClick={crea} className="btn-primary">{busy ? "Salvo…" : "Rendi non disponibile"}</button></div>
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Periodi ({blocchi.length})</h2>
        {blocchi.length === 0 ? <p className="text-sm text-muted">Nessun periodo di indisponibilità.</p> : (
          <ul className="grid gap-2">
            {blocchi.map((b) => {
              const multiday = giornoDi(b.startAt) !== giornoDi(b.endAt);
              const giornoOggi = oggi();
              const interno = giornoOggi >= giornoDi(b.startAt) && giornoOggi <= giornoDi(b.endAt);
              return (
                <li key={b.id} className="rounded-2xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{fmt(b.startAt)} → {fmt(b.endAt)}</p>
                      {b.motivo && <p className="text-sm text-muted">{b.motivo}</p>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {multiday && interno && <button type="button" onClick={() => liberaGiorno(b, giornoOggi)} className="rounded-xl border border-danger-line bg-white px-3 py-1.5 text-xs font-semibold text-danger">Libera solo oggi</button>}
                      <button type="button" onClick={() => rimuovi(b)} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ocean">Rimuovi tutto</button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {conferma.dialogo}
    </div>
  );
}
