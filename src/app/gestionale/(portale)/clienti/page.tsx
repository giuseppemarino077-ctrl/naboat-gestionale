"use client";
import { useCallback, useEffect, useState } from "react";
import { mostraTelefono, telefonoWhatsApp } from "@/lib/telefono";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

type Cliente = { id: string; nome: string; telefono: string | null; email: string | null; note: string | null; _count?: { bookings: number } };

export default function ClientiPage() {
  const [list, setList] = useState<Cliente[]>([]);
  const [stato, setStato] = useState<"carico" | "ok" | "errore">("carico");
  const [q, setQ] = useState("");
  const [ricercato, setRicercato] = useState(false);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<Cliente | null>(null);
  const PAGE = 100;
  const [totale, setTotale] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [caricandoAltri, setCaricandoAltri] = useState(false);

  const load = useCallback((query = "") => {
    setStato("carico");
    setErr("");
    return fetch(`/api/v1/customers?page=1&limit=${PAGE}${query ? `&q=${encodeURIComponent(query)}` : ""}`)
      .then((r) => { if (!r.ok) throw new Error(String(r.status)); return r.json(); })
      .then((j) => {
        const items = Array.isArray(j) ? j : j?.items;
        if (!Array.isArray(items)) throw new Error("formato");
        setList(items);
        setTotale(Array.isArray(j) ? items.length : (j?.totale ?? items.length));
        setPagina(1);
        setRicercato(!!query);
        setStato("ok");
      })
      .catch(() => { setStato("errore"); setErr("Non è stato possibile caricare i clienti. Controlla la connessione e riprova."); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const mostraAltri = async () => {
    setCaricandoAltri(true);
    try {
      const r = await fetch(`/api/v1/customers?page=${pagina + 1}&limit=${PAGE}${q ? `&q=${encodeURIComponent(q)}` : ""}`);
      if (!r.ok) throw new Error();
      const j = await r.json();
      const items = Array.isArray(j) ? j : (j?.items ?? []);
      if (items.length) {
        setList((prev) => [...prev, ...items]);
        setPagina((p) => p + 1);
        if (j?.totale != null) setTotale(j.totale);
      }
    } catch { setErr("Non è stato possibile caricare altri clienti."); } finally {
      setCaricandoAltri(false);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!edit) return;
    const r = await fetch(`/api/v1/customers/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: edit.nome, telefono: edit.telefono, email: edit.email || null, note: edit.note || null }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErr(j.error ?? "Non è stato possibile salvare."); return; }
    setEdit(null); setErr(""); load(q);
  };

  const wa = (c: Cliente) => {
    const n = telefonoWhatsApp(c.telefono);
    return n ? `https://wa.me/${n}?text=${encodeURIComponent(`Ciao ${c.nome}, ti scriviamo da NaBoat per la tua prenotazione.`)}` : null;
  };

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">Clienti</p>
        <h1 className="text-2xl">Anagrafica dalle prenotazioni.</h1>
      </div>

      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); load(q); }}>
        <input className="card flex-1 p-2" placeholder="Cerca nome o telefono (anche con spazi o +39)" value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn-primary" type="submit">Cerca</button>
      </form>

      {err && (
        <Avviso tono="errore">
          {err} <button type="button" className="ml-2 font-bold underline" onClick={() => load(q)}>Riprova</button>
        </Avviso>
      )}

      {stato === "carico" && <Caricamento testo="Carico i clienti…" />}

      {stato === "ok" && list.length === 0 && (
        <div className="card grid place-items-center gap-1 p-8 text-center">
          <p className="font-semibold">{ricercato ? "Nessun cliente corrisponde alla ricerca." : "Nessun cliente."}</p>
          <p className="text-sm text-muted">I clienti si creano automaticamente dalle prenotazioni.</p>
        </div>
      )}

      {stato === "ok" && list.map((c) => {
        const linkWa = wa(c);
        return (
          <div key={c.id} className="card p-4 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <b>{c.nome}</b>{" "}
                <span className="text-muted">
                  {c.telefono ? mostraTelefono(c.telefono) : "senza telefono"}
                  {c.email ? ` · ${c.email}` : ""}
                  {c._count ? ` · ${c._count.bookings} pren.` : ""}
                </span>
              </div>
              <div className="flex gap-3 text-sm font-bold">
                {linkWa && <a className="text-[#177469]" target="_blank" rel="noreferrer" href={linkWa}>WhatsApp →</a>}
                <button className="text-ocean" onClick={() => setEdit({ ...c })}>Modifica</button>
              </div>
            </div>
            {edit?.id === c.id && (
              <form className="mt-3 grid gap-2 md:grid-cols-4" onSubmit={save}>
                <input className="rounded-md border border-line p-2" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} />
                <input className="rounded-md border border-line p-2" placeholder="Telefono" value={edit.telefono ?? ""} onChange={(e) => setEdit({ ...edit, telefono: e.target.value })} />
                <input className="rounded-md border border-line p-2" placeholder="Email" value={edit.email ?? ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} />
                <input className="rounded-md border border-line p-2" placeholder="Note" value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} />
                <button className="btn-primary" type="submit">Salva</button>
              </form>
            )}
          </div>
        );
      })}

      {stato === "ok" && list.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted">{list.length < totale ? `mostrati ${list.length} di ${totale} clienti` : `${totale} clienti`}</p>
          {list.length < totale && (
            <button className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ocean hover:bg-foam disabled:opacity-60" onClick={mostraAltri} disabled={caricandoAltri}>
              {caricandoAltri ? "Carico…" : `Mostra altri (${totale - list.length})`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
