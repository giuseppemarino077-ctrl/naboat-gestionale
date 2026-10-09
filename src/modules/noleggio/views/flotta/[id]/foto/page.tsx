"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

type Boat = { id: string; nome: string; fotoCopertina: string | null; fotoGallery: string[]; pubblicata: boolean; inPausa: boolean; archiviato: boolean; bloccataAdmin: boolean };

export default function FotoPage() {
  const { id } = useParams<{ id: string }>();
  const [b, setB] = useState<Boat | null>(null);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const carica = () => fetch(`/api/v1/boats/${id}`).then((r) => (r.ok ? r.json() : Promise.reject())).then(setB).catch(() => setErr("Barca non trovata."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carica(); }, [id]);

  const patch = async (dati: Record<string, unknown>, esito: string) => {
    setErr(""); setMsg("");
    const r = await fetch(`/api/v1/boats/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(dati) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); return; }
    setMsg(esito); carica();
  };

  const carica_foto = async (files: FileList) => {
    setBusy(true); setErr(""); setMsg("");
    try {
      for (const f of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", f);
        fd.append("boatId", id);
        const r = await fetch("/api/v1/uploads", { method: "POST", body: fd });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) { setErr(j.error ?? "Caricamento non riuscito."); break; }
      }
      setMsg("Foto caricate."); carica();
    } finally { setBusy(false); if (file.current) file.current.value = ""; }
  };

  const muovi = (i: number, dir: -1 | 1) => {
    if (!b) return;
    const galleria = [...b.fotoGallery];
    const j = i + dir;
    if (j < 0 || j >= galleria.length) return;
    [galleria[i], galleria[j]] = [galleria[j], galleria[i]];
    patch({ ordineFoto: galleria }, "Ordine aggiornato.");
  };

  if (!b) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;
  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Galleria</h2>
        <p className="text-sm text-muted">Max 5 MB per foto, jpeg/png/webp. La prima foto è la copertina se non ne scegli un'altra.</p>
        <input ref={file} type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(e) => e.target.files && carica_foto(e.target.files)} className="text-sm" />
        {busy && <p className="text-sm text-muted">Caricamento…</p>}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {b.fotoGallery.map((u, i) => (
            <div key={u} className={"overflow-hidden rounded-xl border " + (b.fotoCopertina === u ? "border-ocean" : "border-line")}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={u} alt="" className="h-28 w-full object-cover" />
              <div className="flex flex-wrap items-center gap-1 p-1.5 text-[11px]">
                <button type="button" onClick={() => muovi(i, -1)} className="rounded bg-sand px-1.5 py-0.5">◀</button>
                <button type="button" onClick={() => muovi(i, 1)} className="rounded bg-sand px-1.5 py-0.5">▶</button>
                <button type="button" onClick={() => patch({ fotoCopertina: u }, "Copertina aggiornata.")} className="rounded bg-sand px-1.5 py-0.5 font-semibold text-ocean">Copertina</button>
                <button type="button" onClick={() => patch({ rimuoviFoto: u }, "Foto rimossa.")} className="rounded bg-danger-soft px-1.5 py-0.5 text-danger">Elimina</button>
              </div>
            </div>
          ))}
        </div>
        {b.fotoGallery.length === 0 && <p className="text-sm text-muted">Nessuna foto.</p>}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Pubblicazione</h2>
        {b.bloccataAdmin && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">Barca bloccata da NaBoat: la pubblicazione resta sospesa.</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy || b.pubblicata} onClick={() => patch({ pubblicata: true, inPausa: false }, "Barca pubblicata.")} className="btn-primary">Pubblica nel catalogo</button>
          <button type="button" disabled={busy || !b.pubblicata} onClick={() => patch({ pubblicata: false }, "Barca ritirata dal catalogo.")} className="btn-soft">Ritira dal catalogo</button>
          <button type="button" disabled={busy} onClick={() => patch({ inPausa: !b.inPausa }, b.inPausa ? "Pausa rimossa." : "Barca in pausa.")} className="btn-soft">{b.inPausa ? "Rimuovi pausa" : "Metti in pausa"}</button>
          <button type="button" disabled={busy} onClick={() => patch({ archiviato: !b.archiviato }, b.archiviato ? "Barca ripristinata." : "Barca archiviata.")} className="btn-soft">{b.archiviato ? "Ripristina da archivio" : "Archivia"}</button>
        </div>
        <p className="text-xs text-muted">Per pubblicare servono almeno una foto e un prezzo attivo. Duplicare o rendere disponibile una barca non equivale a pubblicarla.</p>
      </section>
    </div>
  );
}
