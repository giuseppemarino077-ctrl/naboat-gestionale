"use client";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { RicercaLuogo, type LuogoScelto } from "@/components/ui/RicercaLuogo";

// Sede operativa dell'azienda: base usata dal meteo quando una barca non ha un porto
// localizzato. Non coincide necessariamente con la sede legale.
export function SedeOperativa({ owner }: { owner: boolean }) {
  const [luogo, setLuogo] = useState<LuogoScelto | null>(null);
  const [nome, setNome] = useState("");
  const [caricato, setCaricato] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  useEffect(() => {
    fetch("/api/v1/tenant").then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (!j) return;
      setNome(j.sedeOperativaNome ?? "");
      if (j.sedeOperativaLat != null && j.sedeOperativaLon != null) {
        setLuogo({ placeId: j.sedeOperativaPlaceId ?? "manuale", nome: j.sedeOperativaNome ?? "Sede operativa", indirizzo: null, lat: j.sedeOperativaLat, lon: j.sedeOperativaLon });
      }
      setCaricato(true);
    }).catch(() => setCaricato(true));
  }, []);

  const salva = async () => {
    setErr(""); setMsg("");
    const r = await fetch("/api/v1/tenant", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sedeOperativaNome: nome || luogo?.nome || null,
        sedeOperativaLat: luogo?.lat ?? null,
        sedeOperativaLon: luogo?.lon ?? null,
        sedeOperativaPlaceId: luogo?.placeId ?? null,
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Non è stato possibile salvare."); return; }
    setMsg("Sede operativa salvata.");
  };

  return (
    <section className="card grid gap-3 p-5">
      <div>
        <h2 className="font-display text-lg font-bold text-ink">Sede operativa</h2>
        <p className="text-sm text-muted">Usata dal meteo quando una barca non ha un porto localizzato. Non è la sede legale.</p>
      </div>
      {!owner && <p className="text-xs text-muted">Solo il titolare può modificarla.</p>}
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      {caricato && (
        <>
          <label className="grid gap-1 text-sm">
            <span className="text-xs font-semibold text-muted">Nome della sede</span>
            <input className="rounded-2xl border border-line p-3" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="es. Base di Napoli" />
          </label>
          <div className="grid gap-2">
            <span className="text-xs font-semibold text-muted">Località (ricerca Google)</span>
            <RicercaLuogo valore={luogo} onSeleziona={(l) => { setLuogo(l); if (l?.nome && !nome) setNome(l.nome); }} />
          </div>
          <div><button type="button" className="btn-primary" disabled={!owner} onClick={salva}>Salva sede operativa</button></div>
        </>
      )}
    </section>
  );
}
