"use client";
import { useEffect, useState } from "react";

type Modello = {
  id: string;
  marca: string | null;
  modello: string;
  tipo: string | null;
  capienza: number | null;
  lunghezzaM: number | null;
  potenzaCv: number | null;
  stato: string;
  creatoDaTenantId: string | null;
  boats: { id: string; nome: string }[];
};

export default function AdminCatalogoPage() {
  const [modelli, setModelli] = useState<Modello[]>([]);
  const [filtro, setFiltro] = useState<string>("in_verifica");
  const [err, setErr] = useState("");

  const carica = () => {
    fetch(`/api/v1/admin/modelli${filtro ? `?stato=${filtro}` : ""}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (Array.isArray(j)) { setModelli(j); setErr(""); } else setErr("Riservato a NaBoat (superadmin)."); })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."));
  };
  useEffect(carica, [filtro]);

  const verifica = async (id: string, azione: "approva" | "rifiuta") => {
    const r = await fetch("/api/v1/admin/modelli", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, azione }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Errore"); return; }
    setErr(""); carica();
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Catalogo modelli.</h1>
        <p className="mt-1 text-sm text-muted">I modelli inseriti dai noleggiatori diventano condivisi dopo la verifica.</p>
      </div>

      <div className="flex gap-2 text-sm">
        {["in_verifica", "approvato", "rifiutato", ""].map((s) => (
          <button key={s || "tutti"} onClick={() => setFiltro(s)} className={"rounded-full px-4 py-1.5 font-bold " + (filtro === s ? "bg-deep text-white" : "border border-line bg-white text-muted")}>
            {s === "" ? "Tutti" : s === "in_verifica" ? "Da verificare" : s === "approvato" ? "Approvati" : "Rifiutati"}
          </button>
        ))}
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {modelli.map((m) => (
          <div key={m.id} className="card p-4 text-sm">
            <div className="flex items-center justify-between gap-2">
              <b>{m.marca ? `${m.marca} ` : ""}{m.modello}</b>
              <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (m.stato === "approvato" ? "bg-[#d8f3ea] text-[#177469]" : m.stato === "rifiutato" ? "bg-[#fdeeea] text-coral" : "bg-[#fff0cc] text-[#9a6406]")}>{m.stato.replace("_", " ")}</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              {[m.tipo, m.capienza ? `${m.capienza} persone` : null, m.lunghezzaM ? `${m.lunghezzaM} m` : null, m.potenzaCv ? `${m.potenzaCv} CV` : null].filter(Boolean).join(" · ") || "dati tecnici da completare"}
            </p>
            {m.boats.length > 0 && <p className="mt-1 text-xs text-muted">Usato da {m.boats.length} barca/e</p>}
            {m.stato === "in_verifica" && (
              <div className="mt-3 flex gap-2">
                <button className="rounded-full border border-[#a9e0d0] px-4 py-2 font-bold text-[#177469]" onClick={() => verifica(m.id, "approva")}>Approva</button>
                <button className="rounded-full border border-coral px-4 py-2 font-bold text-coral" onClick={() => verifica(m.id, "rifiuta")}>Rifiuta</button>
              </div>
            )}
          </div>
        ))}
        {modelli.length === 0 && !err && <p className="text-sm text-muted">Nessun modello in questo filtro.</p>}
      </div>
    </div>
  );
}
