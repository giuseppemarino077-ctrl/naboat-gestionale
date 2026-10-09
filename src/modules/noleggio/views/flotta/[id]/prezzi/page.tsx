"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

type Tariffa = { id: string; boatId: string | null; tipo: string; stagione: string; prezzoCent: number; nomePiano: string | null; durataOre: number | null; offertaId: string | null; boat?: { nome: string } | null };
type Offerta = { id: string | null; codice: string; attiva: boolean };
const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";
const euro = (c: number) => (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" });

export default function PrezziPage() {
  const { id } = useParams<{ id: string }>();
  const [offerte, setOfferte] = useState<Offerta[]>([]);
  const [tariffe, setTariffe] = useState<Tariffa[]>([]);
  const [nome, setNome] = useState("Giornata intera");
  const [durata, setDurata] = useState("8");
  const [tipo, setTipo] = useState("giornata");
  const [offertaId, setOffertaId] = useState("");
  const [prezzo, setPrezzo] = useState("");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const carica = () => {
    fetch(`/api/v1/boats/${id}/offerte`).then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setOfferte(j.filter((o: Offerta) => o.attiva))).catch(() => {});
    fetch("/api/v1/tariffe").then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setTariffe(j.filter((t: Tariffa) => t.boatId === id || t.boatId === null))).catch(() => {});
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(carica, [id]);

  const salva = async () => {
    setErr(""); setMsg("");
    if (!prezzo.trim()) { setErr("Indica il prezzo."); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/v1/tariffe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boatId: id, tipo, stagione: "tutto_anno", prezzoEuro: prezzo, attivo: true, nomePiano: nome || null, durataOre: durata ? Number(durata) : null, offertaId: offertaId || null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito."); return; }
      setMsg("Tariffa base salvata."); setPrezzo(""); carica();
    } finally { setBusy(false); }
  };

  const elimina = async (tid: string) => {
    await fetch(`/api/v1/tariffe?id=${tid}`, { method: "DELETE" });
    setMsg("Tariffa eliminata."); carica();
  };

  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Tariffa base</h2>
        {offerte.length === 0 ? (
          <p className="rounded-xl bg-warn-soft p-3 text-sm text-warn">Nessuna modalità attiva: configurane una prima di creare un piano. <a className="font-semibold text-ocean" href={`/gestionale/flotta/${id}/modalita`}>Vai a Modalità →</a></p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm font-semibold">Modalità
                <select value={offertaId} onChange={(e) => setOffertaId(e.target.value)} className={campo}>
                  <option value="">Nessuna (generico)</option>
                  {offerte.map((o) => <option key={o.codice} value={o.id ?? ""}>{o.codice.replaceAll("_", " ").toLowerCase()}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">Tipo tariffa
                <select value={tipo} onChange={(e) => setTipo(e.target.value)} className={campo}>
                  <option value="mezza_giornata">Mezza giornata</option>
                  <option value="giornata">Giornata</option>
                  <option value="settimana">Settimana</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm font-semibold">Nome piano<input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} className={campo} /></label>
              <label className="grid gap-1 text-sm font-semibold">Durata base (ore, step 0,5)<input type="number" min={1} max={24} step={0.5} value={durata} onChange={(e) => setDurata(e.target.value)} className={campo} /></label>
              <label className="grid gap-1 text-sm font-semibold">Prezzo base €<input value={prezzo} onChange={(e) => setPrezzo(e.target.value)} placeholder="es. 350,00" className={campo} /></label>
            </div>
            <div><button type="button" disabled={busy} onClick={salva} className="btn-primary">{busy ? "Salvo…" : "Salva tariffa base"}</button></div>
          </>
        )}
      </section>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Tariffe della barca e generali</h2>
        {tariffe.length === 0 ? <p className="text-sm text-muted">Nessuna tariffa registrata.</p> : (
          <ul className="grid gap-2">
            {tariffe.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line p-3">
                <div>
                  <p className="font-semibold">{t.nomePiano ?? t.tipo.replaceAll("_", " ")} · {euro(t.prezzoCent)}{t.durataOre ? ` · ${t.durataOre}h` : ""}</p>
                  <p className="text-xs text-muted">{t.boatId ? `solo questa barca` : "generale"} · {t.stagione.replaceAll("_", " ")} · {t.tipo.replaceAll("_", " ")}</p>
                </div>
                <button type="button" onClick={() => elimina(t.id)} className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-danger">Elimina</button>
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">Listino stagionale completo in <a className="font-semibold text-ocean" href="/gestionale/impostazioni/listino">Impostazioni → Listino</a>.</p>
      </section>
    </div>
  );
}
