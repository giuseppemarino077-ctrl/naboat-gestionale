"use client";
import { useEffect, useState } from "react";

type Patente = {
  accountId: string;
  numero: string | null;
  fotoUrl: string;
  stato: string;
  motivoRifiuto: string | null;
  createdAt: string;
  account: { nome: string; email: string; telefono: string | null } | null;
};

export default function AdminPatentiPage() {
  const [patenti, setPatenti] = useState<Patente[]>([]);
  const [filtro, setFiltro] = useState("in_verifica");
  const [err, setErr] = useState("");
  const [motivo, setMotivo] = useState<Record<string, string>>({});

  const carica = () => {
    fetch(`/api/v1/admin/patenti${filtro ? `?stato=${filtro}` : ""}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (Array.isArray(j)) { setPatenti(j); setErr(""); } else setErr("Riservato a NaBoat (superadmin)."); })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."));
  };
  useEffect(carica, [filtro]);

  const verifica = async (accountId: string, azione: "approva" | "rifiuta") => {
    const body: any = { accountId, azione };
    if (azione === "rifiuta") body.motivo = (motivo[accountId] ?? "").trim();
    const r = await fetch("/api/v1/admin/patenti", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); carica();
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Verifica patenti.</h1>
        <p className="mt-1 text-sm text-muted">Foto in archivio privato e numero cifrato: qui lo staff lo vede in chiaro solo per la verifica.</p>
      </div>

      <div className="flex gap-2 text-sm">
        {["in_verifica", "approvata", "rifiutata", ""].map((s) => (
          <button key={s || "tutte"} onClick={() => setFiltro(s)} className={"rounded-full px-4 py-1.5 font-bold " + (filtro === s ? "bg-deep text-white" : "border border-line bg-white text-muted")}>
            {s === "" ? "Tutte" : s === "in_verifica" ? "Da verificare" : s === "approvata" ? "Approvate" : "Rifiutate"}
          </button>
        ))}
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="grid gap-3 md:grid-cols-2">
        {patenti.map((p) => (
          <div key={p.accountId} className="card grid gap-3 p-4 text-sm md:grid-cols-[140px_1fr]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/v1/patenti/foto/${p.accountId}`} alt="patente" className="h-24 w-full rounded-xl border border-line object-cover md:h-full" loading="lazy" />
            <div>
              <div className="flex items-center justify-between gap-2">
                <b>{p.account?.nome ?? "Cliente"}</b>
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold " + (p.stato === "approvata" ? "bg-[#d8f3ea] text-[#177469]" : p.stato === "rifiutata" ? "bg-[#fdeeea] text-coral" : "bg-[#fff0cc] text-[#9a6406]")}>{p.stato.replace("_", " ")}</span>
              </div>
              <p className="text-xs text-muted">{p.account?.email}{p.account?.telefono ? ` · ${p.account.telefono}` : ""}</p>
              <p className="mt-1">Numero: <b>{p.numero ?? "—"}</b></p>
              {p.motivoRifiuto && <p className="text-xs text-coral">Motivo: {p.motivoRifiuto}</p>}
              {p.stato === "in_verifica" && (
                <div className="mt-3 grid gap-2">
                  <div className="flex gap-2">
                    <button className="rounded-full border border-[#a9e0d0] px-4 py-2 font-bold text-[#177469]" onClick={() => verifica(p.accountId, "approva")}>Approva</button>
                    <input className="flex-1 rounded-2xl border border-line p-2" placeholder="Motivo rifiuto *" value={motivo[p.accountId] ?? ""} onChange={(e) => setMotivo((m) => ({ ...m, [p.accountId]: e.target.value }))} />
                    <button className="rounded-full border border-coral px-4 py-2 font-bold text-coral" onClick={() => verifica(p.accountId, "rifiuta")}>Rifiuta</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        {patenti.length === 0 && !err && <p className="text-sm text-muted">Nessuna patente in questo filtro.</p>}
      </div>
    </div>
  );
}
