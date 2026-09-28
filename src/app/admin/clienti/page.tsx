"use client";
import { useEffect, useState } from "react";

export default function AdminClientiPage() {
  const [dati, setDati] = useState<{ accounts: any[]; clienti: any[] }>({ accounts: [], clienti: [] });
  const [q, setQ] = useState("");
  const [err, setErr] = useState("");

  const carica = () => {
    fetch(`/api/v1/admin/clienti?q=${encodeURIComponent(q)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => { if (j?.accounts) { setDati(j); setErr(""); } else setErr("Riservato a NaBoat (superadmin)."); })
      .catch(() => setErr("Riservato a NaBoat (superadmin)."));
  };
  useEffect(carica, []);

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">NaBoat Admin</p>
        <h1 className="text-2xl">Clienti.</h1>
        <p className="mt-1 text-sm text-muted">Account del sito e clienti registrati dalle aziende.</p>
      </div>
      <div className="flex gap-2">
        <input className="flex-1 rounded-full border border-line bg-white px-4 py-2 text-sm" placeholder="Cerca per nome, email o telefono…" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && carica()} />
        <button className="btn-soft" onClick={carica}>Cerca</button>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      <section className="card overflow-x-auto">
        <div className="border-b border-line p-3 text-sm font-bold">Account sito ({dati.accounts.length})</div>
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Nome</th><th className="p-3">Email</th><th className="p-3">Telefono</th><th className="p-3">Patente</th><th className="p-3">Prenotazioni</th></tr></thead>
          <tbody>
            {dati.accounts.map((a) => (
              <tr key={a.id} className="border-t border-line">
                <td className="p-3 font-semibold">{a.nome}</td>
                <td className="p-3 text-muted">{a.email}</td>
                <td className="p-3 text-muted">{a.telefono ?? "—"}</td>
                <td className="p-3">{a.patente?.stato ?? "—"}</td>
                <td className="p-3">{a._count?.bookings ?? 0}</td>
              </tr>
            ))}
            {dati.accounts.length === 0 && <tr><td className="p-3 text-muted" colSpan={5}>Nessun account.</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="card overflow-x-auto">
        <div className="border-b border-line p-3 text-sm font-bold">Clienti delle aziende ({dati.clienti.length})</div>
        <table className="w-full min-w-[620px] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-muted"><tr><th className="p-3">Nome</th><th className="p-3">Telefono</th><th className="p-3">Azienda</th><th className="p-3">Prenotazioni</th></tr></thead>
          <tbody>
            {dati.clienti.map((c) => (
              <tr key={c.id} className="border-t border-line">
                <td className="p-3 font-semibold">{c.nome}</td>
                <td className="p-3 text-muted">{c.telefono}</td>
                <td className="p-3 text-muted">{c.tenant?.nome ?? "—"}</td>
                <td className="p-3">{c._count?.bookings ?? 0}</td>
              </tr>
            ))}
            {dati.clienti.length === 0 && <tr><td className="p-3 text-muted" colSpan={4}>Nessun cliente.</td></tr>}
          </tbody>
        </table>
      </section>
    </div>
  );
}
