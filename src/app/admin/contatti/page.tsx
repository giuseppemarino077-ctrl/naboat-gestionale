"use client";
import { useEffect, useState } from "react";

type Richiesta = {
  id: string;
  nome: string;
  cognome: string;
  telefono: string;
  email: string;
  messaggio: string | null;
  privacyAt: string;
  lettoAt: string | null;
  createdAt: string;
};

// Messaggi arrivati dal form «Contatti» del sito pubblico.
export default function AdminContattiPage() {
  const [righe, setRighe] = useState<Richiesta[]>([]);
  const [nonLette, setNonLette] = useState(0);
  const [err, setErr] = useState("");
  const [carico, setCarico] = useState(true);

  const carica = () => {
    setCarico(true);
    fetch("/api/v1/admin/contatti")
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((j) => {
        setRighe(j.richieste ?? []);
        setNonLette(j.nonLette ?? 0);
        setErr("");
      })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."))
      .finally(() => setCarico(false));
  };
  useEffect(carica, []);

  const segnaLetto = async (id: string, letto: boolean) => {
    await fetch("/api/v1/admin/contatti", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, letto }),
    });
    carica();
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Messaggi dal sito.</h1>
        <p className="mt-1 text-sm text-muted">
          {nonLette > 0 ? `${nonLette} da leggere` : "Tutti letti"} · ultime 300 richieste ricevute dal form dei contatti
        </p>
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {carico && <p className="card p-3 text-sm text-muted">Carico…</p>}
      {!carico && !err && !righe.length && <p className="card p-3 text-sm text-muted">Nessun messaggio.</p>}

      <div className="grid gap-3">
        {righe.map((r) => (
          <div key={r.id} className={r.lettoAt ? "card p-4 text-sm" : "card border-l-4 border-l-gold p-4 text-sm"}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <b>
                {r.nome} {r.cognome}
              </b>
              <span className="text-xs text-muted">{new Date(r.createdAt).toLocaleString("it-IT")}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1">
              <a className="font-bold text-ocean" href={`tel:${r.telefono.replace(/[^\d+]/g, "")}`}>
                ☎ {r.telefono}
              </a>
              <a className="font-bold text-ocean" href={`mailto:${r.email}`}>
                ✉ {r.email}
              </a>
            </div>
            {r.messaggio && <p className="mt-2 whitespace-pre-line rounded-lg bg-[#f7f9f9] p-3 text-[#3c565e]">{r.messaggio}</p>}
            <div className="mt-2 text-xs text-muted">
              Consenso dato il {new Date(r.privacyAt).toLocaleString("it-IT")} · {r.lettoAt ? "letto" : "da leggere"}
            </div>
            <button className="mt-2 font-bold text-ocean" onClick={() => segnaLetto(r.id, !r.lettoAt)}>
              {r.lettoAt ? "Segna come da leggere" : "Segna come letto"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
