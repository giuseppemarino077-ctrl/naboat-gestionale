"use client";
import { useEffect, useState } from "react";
export default function AziendePage() {
  const [aziende, setAziende] = useState<{ tenantId: string; role: string; tenant: { nome: string; status: string } }[]>([]);
  const [attiva, setAttiva] = useState<string | null>(null);
  const [errore, setErrore] = useState("");
  useEffect(() => { fetch("/api/v1/auth/aziende", { cache: "no-store" }).then((r) => r.json()).then((j) => { setAziende(j.aziende ?? []); setAttiva(j.attiva); }).catch(() => setErrore("Connessione interrotta")); }, []);
  return <div className="mx-auto grid max-w-2xl gap-4"><h1 className="text-2xl">Scegli azienda</h1><p className="text-sm text-muted">Ogni struttura ha dati e permessi separati.</p>{errore && <p role="alert" className="text-coral">{errore}</p>}{aziende.map((m) => <button key={m.tenantId} disabled={m.tenant.status !== "active"} className="card flex items-center justify-between gap-3 p-4 text-left disabled:opacity-50" onClick={async () => { try { const r = await fetch("/api/v1/auth/aziende", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: m.tenantId }) }); const j = await r.json(); if (!r.ok) { setErrore(j.error); return; } window.location.href = j.destinazione; } catch { setErrore("Connessione interrotta"); } }}><b>{m.tenant.nome}</b><span className="text-sm text-muted">{m.tenantId === attiva ? "Attuale" : m.tenant.status !== "active" ? "Non disponibile" : "Apri →"}</span></button>)}</div>;
}
