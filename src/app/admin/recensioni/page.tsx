"use client";
import { useEffect, useState } from "react";

type Recensione = {
  id: string;
  voto: number;
  commento: string | null;
  risposta: string | null;
  stato: string;
  moderazioneMotivo: string | null;
  createdAt: string;
  tenant: { nome: string } | null;
  booking: { clienteNome: string | null; startAt: string } | null;
};

const stelle = (n: number) => "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);

export default function AdminRecensioniPage() {
  const [recensioni, setRecensioni] = useState<Recensione[]>([]);
  const [filtro, setFiltro] = useState<string>("");
  const [err, setErr] = useState("");
  const [motivo, setMotivo] = useState<Record<string, string>>({});

  const carica = () => {
    fetch(`/api/v1/admin/recensioni${filtro ? `?stato=${filtro}` : ""}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (Array.isArray(j)) { setRecensioni(j); setErr(""); } else setErr("Riservato a NaBoat (superadmin)."); })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."));
  };
  useEffect(carica, [filtro]);

  const modera = async (id: string, azione: "pubblica" | "nascondi") => {
    const body: any = { id, azione };
    if (azione === "nascondi") body.motivo = (motivo[id] ?? "").trim();
    const r = await fetch("/api/v1/admin/recensioni", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); carica();
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Moderazione recensioni.</h1>
        <p className="mt-1 text-sm text-muted">Le recensioni si nascondono solo con una motivazione registrata.</p>
      </div>

      <div className="flex gap-2 text-sm">
        {["", "pubblicata", "nascosta"].map((s) => (
          <button key={s || "tutte"} onClick={() => setFiltro(s)} className={"rounded-full px-4 py-1.5 font-bold " + (filtro === s ? "bg-deep text-white" : "border border-line bg-white text-muted")}>
            {s === "" ? "Tutte" : s === "pubblicata" ? "Pubblicate" : "Nascoste"}
          </button>
        ))}
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="grid gap-3">
        {recensioni.map((r) => (
          <div key={r.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-bold text-gold">{stelle(r.voto)}</span>
              <span className="text-xs text-muted">
                {r.tenant?.nome ?? "—"} · {r.booking?.clienteNome ?? "cliente"} · {new Date(r.createdAt).toLocaleDateString("it-IT")}
                {r.stato === "nascosta" ? " · nascosta" : ""}
              </span>
            </div>
            {r.commento && <p className="mt-2 whitespace-pre-line">{r.commento}</p>}
            {r.risposta && <p className="mt-2 rounded-2xl bg-[#faf6f2] p-2 text-xs"><b>Risposta:</b> {r.risposta}</p>}
            {r.moderazioneMotivo && <p className="mt-1 text-xs text-coral">Motivo moderazione: {r.moderazioneMotivo}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {r.stato === "pubblicata" ? (
                <>
                  <input className="flex-1 rounded-2xl border border-line p-2.5" placeholder="Motivo della rimozione *" value={motivo[r.id] ?? ""} onChange={(e) => setMotivo((m) => ({ ...m, [r.id]: e.target.value }))} />
                  <button className="rounded-full border border-coral px-4 py-2 font-bold text-coral" onClick={() => modera(r.id, "nascondi")}>Nascondi</button>
                </>
              ) : (
                <button className="rounded-full border border-[#a9e0d0] px-4 py-2 font-bold text-[#177469]" onClick={() => modera(r.id, "pubblica")}>Ripubblica</button>
              )}
            </div>
          </div>
        ))}
        {recensioni.length === 0 && !err && <p className="text-sm text-muted">Nessuna recensione.</p>}
      </div>
    </div>
  );
}
