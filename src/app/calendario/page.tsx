"use client";
import { useEffect, useState } from "react";

type Cal = { boats: any[]; bookings: any[]; blocks: any[] };
const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const sameDay = (a: string, d: Date) => new Date(a).toISOString().slice(0, 10) === isoDay(d);

export default function CalendarioPage() {
  const [offset, setOffset] = useState(0);
  const [data, setData] = useState<Cal | null>(null);
  const [err, setErr] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showBlock, setShowBlock] = useState(false);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [f, setF] = useState({ boatId: "", data: isoDay(new Date()), dalle: "10:00", alle: "18:00", clienteNome: "", telefono: "", passeggeri: 2, destinazione: "", patenteOk: false, skipperId: "", prezzoEuro: "" });
  const [b, setB] = useState({ boatId: "", dal: isoDay(new Date()), al: isoDay(new Date()), motivo: "" });

  const monday = new Date();
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) + offset * 7);
  const days = [...Array(7)].map((_, i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; });

  const load = () => {
    const from = new Date(days[0]); from.setHours(0, 0, 0, 0);
    const to = new Date(days[6]); to.setHours(23, 59, 59, 999);
    fetch(`/api/v1/calendar?from=${from.toISOString()}&to=${to.toISOString()}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((j) => {
        if (j && Array.isArray(j.boats) && Array.isArray(j.bookings)) { setData(j); setErr(""); }
        else setErr("Serve login con azienda attiva.");
      })
      .catch(() => setErr("Serve login con azienda attiva."));
    fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
  };
  useEffect(load, [offset]);

  const post = async (url: string, method: string, body: any) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) setErr(j.error ?? "Errore");
    else { setErr(""); load(); }
  };

  const creaPrenotazione = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await fetch("/api/v1/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        boatId: f.boatId,
        startAt: new Date(`${f.data}T${f.dalle}`).toISOString(),
        endAt: new Date(`${f.data}T${f.alle}`).toISOString(),
        clienteNome: f.clienteNome, telefono: f.telefono,
        passeggeri: Number(f.passeggeri), destinazione: f.destinazione || undefined,
        patenteOk: f.patenteOk, skipperId: f.skipperId || undefined,
        idempotencyKey: crypto.randomUUID(),
      }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    if (f.prezzoEuro.trim() && j?.id) {
      await fetch(`/api/v1/bookings/${j.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prezzoEuro: f.prezzoEuro }) });
    }
    setErr(""); setShowForm(false); setF({ ...f, prezzoEuro: "" }); load();
  };

  // Propone il prezzo dal listino in base a barca, data e durata.
  const proponiPrezzo = async (boatId: string, data: string, dalle: string, alle: string) => {
    if (!boatId || !data) return;
    const ore = (Number(alle.slice(0, 2)) + Number(alle.slice(3)) / 60) - (Number(dalle.slice(0, 2)) + Number(dalle.slice(3)) / 60);
    const tipo = ore <= 5 ? "mezza_giornata" : "giornata";
    const r = await fetch(`/api/v1/tariffe?boatId=${boatId}&data=${data}&tipo=${tipo}`);
    const j = await r.json().catch(() => ({}));
    if (r.ok && j?.prezzoCent) setF((cur) => ({ ...cur, prezzoEuro: (j.prezzoCent / 100).toFixed(2).replace(".", ",") }));
  };

  const creaBlocco = (e: React.FormEvent) => {
    e.preventDefault();
    const s = new Date(`${b.dal}T00:00`); const en = new Date(`${b.al}T23:59`);
    post("/api/v1/blocks", "POST", { boatId: b.boatId, startAt: s.toISOString(), endAt: en.toISOString(), motivo: b.motivo || undefined })
      .then(() => setShowBlock(false));
  };

  const statoColor = (s: string) => s === "in_mare" ? "bg-[#dcf1ee] text-[#16675f]" : s === "rientrata" ? "bg-[#e1f5f1] text-[#177469]" : "bg-[#dceff4] text-[#145c72]";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><p className="text-sm text-muted">Calendario centrale</p><h1 className="text-2xl">Barche e disponibilità, insieme.</h1></div>
        <div className="flex gap-2">
          <button className="btn-primary" onClick={() => setShowBlock(!showBlock)}>＋ Blocca risorsa</button>
          <button className="btn-primary" onClick={() => setShowForm(!showForm)}>＋ Nuova prenotazione</button>
        </div>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}

      {showForm && (
        <form className="card grid gap-2 p-4 md:grid-cols-4" onSubmit={creaPrenotazione}>
          <select className="rounded-md border border-line p-2" value={f.boatId} onChange={(e) => { setF({ ...f, boatId: e.target.value }); proponiPrezzo(e.target.value, f.data, f.dalle, f.alle); }} required>
            <option value="">Barca *</option>{(data?.boats ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <input className="rounded-md border border-line p-2" type="date" value={f.data} onChange={(e) => { setF({ ...f, data: e.target.value }); proponiPrezzo(f.boatId, e.target.value, f.dalle, f.alle); }} required />
          <input className="rounded-md border border-line p-2" type="time" value={f.dalle} onChange={(e) => { setF({ ...f, dalle: e.target.value }); proponiPrezzo(f.boatId, f.data, e.target.value, f.alle); }} required />
          <input className="rounded-md border border-line p-2" type="time" value={f.alle} onChange={(e) => { setF({ ...f, alle: e.target.value }); proponiPrezzo(f.boatId, f.data, f.dalle, e.target.value); }} required />
          <input className="rounded-md border border-line p-2" placeholder="Cliente *" value={f.clienteNome} onChange={(e) => setF({ ...f, clienteNome: e.target.value })} required />
          <input className="rounded-md border border-line p-2" placeholder="Telefono *" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} required />
          <input className="rounded-md border border-line p-2" type="number" min={1} placeholder="Pax" value={f.passeggeri} onChange={(e) => setF({ ...f, passeggeri: Number(e.target.value) })} />
          <input className="rounded-md border border-line p-2" placeholder="Destinazione" value={f.destinazione} onChange={(e) => setF({ ...f, destinazione: e.target.value })} />
          <select className="rounded-md border border-line p-2" value={f.skipperId} onChange={(e) => setF({ ...f, skipperId: e.target.value })}>
            <option value="">Skipper (se serve)</option>{skippers.map((s: any) => <option key={s.id} value={s.id}>{s.nome}</option>)}
          </select>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.patenteOk} onChange={(e) => setF({ ...f, patenteOk: e.target.checked })} /> Patente ok</label>
          <input className="rounded-md border border-line p-2" placeholder="Prezzo € (dal listino)" value={f.prezzoEuro} onChange={(e) => setF({ ...f, prezzoEuro: e.target.value })} />
          <button className="btn-primary" type="submit">Salva</button>
        </form>
      )}

      {showBlock && (
        <form className="card grid gap-2 p-4 md:grid-cols-5" onSubmit={creaBlocco}>
          <select className="rounded-md border border-line p-2" value={b.boatId} onChange={(e) => setB({ ...b, boatId: e.target.value })} required>
            <option value="">Barca *</option>{(data?.boats ?? []).map((x: any) => <option key={x.id} value={x.id}>{x.nome}</option>)}
          </select>
          <input className="rounded-md border border-line p-2" type="date" value={b.dal} onChange={(e) => setB({ ...b, dal: e.target.value })} required />
          <input className="rounded-md border border-line p-2" type="date" value={b.al} onChange={(e) => setB({ ...b, al: e.target.value })} required />
          <input className="rounded-md border border-line p-2" placeholder="Motivo" value={b.motivo} onChange={(e) => setB({ ...b, motivo: e.target.value })} />
          <button className="btn-primary" type="submit">Blocca</button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <div className="flex items-center gap-2 border-b border-line p-3">
          <button className="rounded-md border border-line px-2" onClick={() => setOffset(offset - 1)}>‹</button>
          <strong className="text-sm">Settimana {isoDay(days[0])} – {isoDay(days[6])}</strong>
          <button className="rounded-md border border-line px-2" onClick={() => setOffset(offset + 1)}>›</button>
          <button className="ml-auto text-sm font-bold text-ocean" onClick={() => setOffset(0)}>Oggi</button>
        </div>
        <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `1.4fr repeat(7,1fr)` }}>
          <div className="border-b border-line p-2 text-xs text-muted">IMBARCAZIONE</div>
          {days.map((d) => <div key={+d} className="border-b border-line p-2 text-center text-xs text-muted">{d.toLocaleDateString("it", { weekday: "short" })} {d.getDate()}</div>)}
          {(data?.boats ?? []).map((bt: any) => (
            <>
              <div key={bt.id} className="border-b border-line p-3 text-sm"><strong>{bt.nome}</strong><br /><small className="text-muted">{bt.capienza} persone</small></div>
              {days.map((d) => (
                <div key={bt.id + +d} className="grid content-start gap-1 border-b border-l border-line/60 p-1">
                  {(data?.bookings ?? []).filter((k: any) => k.boatId === bt.id && sameDay(k.startAt, d)).map((k: any) => (
                    <div key={k.id} className={`rounded p-1.5 text-[11px] font-semibold ${statoColor(k.stato)}`}>
                      {new Date(k.startAt).toISOString().slice(11, 16)} {k.clienteNome}
                      <div className="mt-1 flex gap-1 font-bold">
                        {k.stato === "prenotata" && <button onClick={() => post(`/api/v1/bookings/${k.id}`, "PATCH", { stato: "in_mare" })}>⛵</button>}
                        {k.stato === "in_mare" && <button onClick={() => post(`/api/v1/bookings/${k.id}`, "PATCH", { stato: "rientrata" })}>✓</button>}
                        {k.stato !== "rientrata" && k.stato !== "cancellata" && <button onClick={() => confirm("Cancellare?") && post(`/api/v1/bookings/${k.id}`, "PATCH", { stato: "cancellata" })}>✕</button>}
                      </div>
                    </div>
                  ))}
                  {(data?.blocks ?? []).filter((x: any) => x.boatId === bt.id && (sameDay(x.startAt, d) || sameDay(x.endAt, d))).map((x: any) => (
                    <div key={x.id} className="rounded bg-[#e8ecec] p-1.5 text-[11px] text-[#5d696b]">
                      Blocco{x.motivo ? `: ${x.motivo}` : ""}
                      <button className="ml-1 font-bold" onClick={() => post(`/api/v1/blocks/${x.id}`, "DELETE", {})}>✕</button>
                    </div>
                  ))}
                </div>
              ))}
            </>
          ))}
        </div>
      </div>
      {data && data.boats.length === 0 && <p className="text-sm text-muted">Aggiungi barche in Flotta per popolare il calendario.</p>}
    </div>
  );
}
