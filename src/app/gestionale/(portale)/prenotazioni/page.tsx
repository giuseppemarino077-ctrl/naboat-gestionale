"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAggiornamenti } from "@/lib/aggiorna";

const euro = (c: number | null | undefined) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const codice = (b: any) => `NB-${new Date(b.startAt).getFullYear()}-${String(b.id).slice(0, 6).toUpperCase()}`;

const STATO: Record<string, { l: string; c: string }> = {
  da_confermare: { l: "Da confermare", c: "bg-[#fff0cc] text-[#9a6406]" },
  prenotata: { l: "Confermata", c: "bg-[#e8f1fb] text-[#145c72]" },
  in_mare: { l: "In navigazione", c: "bg-[#d8f3ea] text-[#177469]" },
  rientrata: { l: "Completata", c: "bg-[#e8ecec] text-[#5d696b]" },
  no_show: { l: "Non presentato", c: "bg-[#fdeeea] text-coral" },
  cancellata: { l: "Annullata", c: "bg-[#fdeeea] text-coral" },
};

export default function PrenotazioniPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [pagamenti, setPagamenti] = useState<Record<string, number>>({});
  const [err, setErr] = useState("");
  const [cerca, setCerca] = useState("");
  const [stato, setStato] = useState("tutte");
  const [fonte, setFonte] = useState("tutte");
  const [pagamento, setPagamento] = useState("tutti");
  const [dal, setDal] = useState("");
  const [al, setAl] = useState("");

  const carica = () =>
    Promise.all([
      fetch("/api/v1/bookings").then((r) => { if (!r.ok) throw new Error(); return r.json(); }),
      fetch("/api/v1/payments").then((r) => r.json()).catch(() => []),
    ])
      .then(([b, p]) => {
        if (Array.isArray(b)) { setBookings(b); setErr(""); } else setErr("Serve login con azienda attiva.");
        if (Array.isArray(p)) {
          const m: Record<string, number> = {};
          for (const x of p) if (x.bookingId && x.stato === "pagato") m[x.bookingId] = (m[x.bookingId] ?? 0) + x.totaleCent;
          setPagamenti(m);
        }
      })
      .catch(() => setErr("Serve login con azienda attiva."));

  useEffect(() => { carica(); }, []);
  // Elenco sempre allineato: i filtri sono locali e non vengono toccati dal ricarico.
  useAggiornamenti(carica, ["prenotazioni"]);

  const q = cerca.trim().toLowerCase();
  const visibili = useMemo(() => {
    return bookings
      .filter((b) => !q || codice(b).toLowerCase().includes(q) || (b.clienteNome ?? "").toLowerCase().includes(q) || (b.telefono ?? "").toLowerCase().includes(q) || (b.boat?.nome ?? "").toLowerCase().includes(q))
      .filter((b) => stato === "tutte" || b.stato === stato)
      .filter((b) => fonte === "tutte" || b.origineCanale === fonte)
      .filter((b) => {
        if (pagamento === "tutti") return true;
        const pagato = (pagamenti[b.id] ?? 0) > 0;
        return pagamento === "pagate" ? pagato : !pagato;
      })
      .filter((b) => (!dal || new Date(b.startAt).toISOString().slice(0, 10) >= dal) && (!al || new Date(b.startAt).toISOString().slice(0, 10) <= al))
      .sort((a, b) => +new Date(b.startAt) - +new Date(a.startAt));
  }, [bookings, q, stato, fonte, pagamento, dal, al, pagamenti]);

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-muted">Noleggio</p>
          <h1 className="text-2xl">Prenotazioni</h1>
          <p className="text-sm text-muted">Marketplace e prenotazioni manuali in un unico elenco.</p>
        </div>
        <Link className="btn-primary" href="/gestionale/calendario">＋ Nuova prenotazione</Link>
      </div>

      {err && <p className="rounded-2xl border border-coral/40 bg-[#fdeeea] p-3 text-sm font-semibold text-coral">{err}</p>}

      <div className="grid gap-3 rounded-3xl border border-line bg-white p-4 shadow-sm md:grid-cols-2 lg:grid-cols-4">
        <input className="rounded-full border border-line bg-[#faf6f2] px-4 py-2.5 text-sm lg:col-span-2" placeholder="Cerca codice, cliente, telefono o barca…" value={cerca} onChange={(e) => setCerca(e.target.value)} />
        <label className="grid gap-1 text-xs text-muted">Dal<input type="date" className="rounded-full border border-line p-2.5 text-sm" value={dal} onChange={(e) => setDal(e.target.value)} /></label>
        <label className="grid gap-1 text-xs text-muted">Al<input type="date" className="rounded-full border border-line p-2.5 text-sm" value={al} onChange={(e) => setAl(e.target.value)} /></label>
        <div className="flex flex-wrap items-center gap-1 lg:col-span-2">
          <span className="pr-1 text-xs font-semibold uppercase tracking-wider text-muted">Stato</span>
          {[["tutte", "Tutte"], ["da_confermare", "Da confermare"], ["prenotata", "Confermate"], ["in_mare", "In navigazione"], ["rientrata", "Completate"], ["no_show", "Non presentati"], ["cancellata", "Annullate"]].map(([v, l]) => (
            <button key={v} className={"rounded-full px-3 py-1.5 text-xs font-bold " + (stato === v ? "bg-ocean text-white" : "text-ocean hover:bg-foam")} onClick={() => setStato(v)}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="pr-1 text-xs font-semibold uppercase tracking-wider text-muted">Fonte</span>
          {[["tutte", "Tutte"], ["naboat", "NaBoat"], ["diretto", "Dirette"]].map(([v, l]) => (
            <button key={v} className={"rounded-full px-3 py-1.5 text-xs font-bold " + (fonte === v ? "bg-ocean text-white" : "text-ocean hover:bg-foam")} onClick={() => setFonte(v)}>{l}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <span className="pr-1 text-xs font-semibold uppercase tracking-wider text-muted">Pagamento</span>
          {[["tutti", "Tutti"], ["pagate", "Pagate"], ["da-pagare", "Da pagare"]].map(([v, l]) => (
            <button key={v} className={"rounded-full px-3 py-1.5 text-xs font-bold " + (pagamento === v ? "bg-ocean text-white" : "text-ocean hover:bg-foam")} onClick={() => setPagamento(v)}>{l}</button>
          ))}
        </div>
      </div>

      <p className="px-1 text-sm text-muted">{visibili.length} {visibili.length === 1 ? "prenotazione" : "prenotazioni"}</p>

      <div className="overflow-x-auto rounded-3xl border border-line bg-white shadow-sm">
        <table className="w-full min-w-[860px] text-sm">
          <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="p-3">Codice</th><th className="p-3">Cliente</th><th className="p-3">Barca</th><th className="p-3">Data / Ora</th>
              <th className="p-3">Fonte</th><th className="p-3">Stato</th><th className="p-3">Pagamento</th><th className="p-3 text-right">Totale</th><th className="p-3"></th>
            </tr>
          </thead>
          <tbody>
            {visibili.map((b) => {
              const st = STATO[b.stato] ?? { l: b.stato, c: "badge-block" };
              const pagato = (pagamenti[b.id] ?? 0) > 0;
              return (
                <tr key={b.id} className="border-t border-line hover:bg-foam/50">
                  <td className="p-3 font-semibold whitespace-nowrap">{codice(b)}</td>
                  <td className="p-3">{b.clienteNome ?? "—"}{b.telefono ? <span className="block text-xs text-muted">{b.telefono}</span> : null}</td>
                  <td className="p-3">{b.boat?.nome ?? "—"}</td>
                  <td className="p-3 whitespace-nowrap">{new Date(b.startAt).toLocaleDateString("it-IT", { day: "2-digit", month: "short" })} · {new Date(b.startAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}–{new Date(b.endAt).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}</td>
                  <td className="p-3"><span className={b.origineCanale === "naboat" ? "badge-ready" : "badge-block"}>{b.origineCanale === "naboat" ? "NaBoat" : "Diretta"}</span></td>
                  <td className="p-3"><span className={"rounded-full px-2.5 py-1 text-xs font-semibold " + st.c}>{st.l}</span></td>
                  <td className="p-3"><span className={pagato ? "badge-ready" : "badge-pending"}>{pagato ? "Pagata" : "Da pagare"}</span></td>
                  <td className="p-3 text-right font-semibold">{euro(b.prezzoCent)}</td>
                  <td className="p-3 text-right"><Link className="font-bold text-ocean whitespace-nowrap" href={`/gestionale/prenotazioni/${b.id}`}>Apri →</Link></td>
                </tr>
              );
            })}
            {visibili.length === 0 && !err && <tr><td className="p-6 text-center text-muted" colSpan={9}>Nessuna prenotazione con questi filtri.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
