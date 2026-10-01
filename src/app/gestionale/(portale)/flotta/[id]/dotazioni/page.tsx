"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { CATEGORIE_DOTAZIONI, ETICHETTA_CATEGORIA } from "@/lib/dotazioni";

type Voce = { nome: string; categoria: string; descrizione: string | null };
type Assoc = { dotazioneId: string; nota: string | null };

export default function DotazioniPage() {
  const { id } = useParams<{ id: string }>();
  const [catalogo, setCatalogo] = useState<Voce[] | null>(null);
  const [sel, setSel] = useState<Map<string, string>>(new Map());
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const carica = () => fetch(`/api/v1/boats/${id}/dotazioni`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j) => {
    const voci = j.catalogo.map((c: any) => ({ nome: c.nome, categoria: c.categoria, descrizione: c.descrizione ?? null }));
    setCatalogo(voci);
    const associati = new Map<string, string>();
    // Le associazioni reference per dotazioneId: si mappano ai nomi del catalogo.
    const perId = new Map<string, string>(j.catalogo.filter((c: any) => c.id).map((c: any) => [c.id, c.nome]));
    for (const a of j.associazioni as Assoc[]) { const nome = perId.get(a.dotazioneId); if (nome) associati.set(nome, a.nota ?? ""); }
    // Voci legacy riconosciute nel catalogo ma non associate strutturalmente.
    for (const l of (j.legacy ?? []) as string[]) if (!associati.has(l) && voci.some((v: Voce) => v.nome === l)) associati.set(l, "");
    setSel(associati);
  }).catch(() => setErr("Non è stato possibile caricare le dotazioni."));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { carica(); }, [id]);

  const perCategoria = useMemo(() => {
    const out = new Map<string, Voce[]>();
    for (const v of catalogo ?? []) { const a = out.get(v.categoria) ?? []; a.push(v); out.set(v.categoria, a); }
    return out;
  }, [catalogo]);

  const toggle = (nome: string) => setSel((m) => { const n = new Map(m); if (n.has(nome)) n.delete(nome); else n.set(nome, ""); return n; });

  const salva = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const voci = [...sel.entries()].map(([nome, nota]) => ({ nome, categoria: (catalogo ?? []).find((v) => v.nome === nome)?.categoria ?? "OTHER", nota: nota || null }));
      const r = await fetch(`/api/v1/boats/${id}/dotazioni`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ voci }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito."); return; }
      setMsg("Dotazioni salvate."); carica();
    } finally { setBusy(false); }
  };

  if (!catalogo) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;
  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      <p className="text-sm text-muted">{sel.size} dotazioni selezionate. Le voci personalizzate già presenti restano nella scheda pubblica.</p>

      {CATEGORIE_DOTAZIONI.filter((c) => perCategoria.has(c)).map((cat) => (
        <section key={cat} className="card p-5">
          <h2 className="font-display text-lg font-bold text-ink">{ETICHETTA_CATEGORIA[cat] ?? cat}</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(perCategoria.get(cat) ?? []).map((v) => {
              const attiva = sel.has(v.nome);
              return (
                <div key={v.nome} className={"rounded-xl border p-3 " + (attiva ? "border-ocean bg-foam" : "border-line bg-white")}>
                  <label className="flex items-start gap-2 text-sm font-semibold">
                    <input type="checkbox" checked={attiva} onChange={() => toggle(v.nome)} className="mt-1" />
                    <span>
                      {v.nome}
                      {v.descrizione && <span className="block text-xs font-normal text-muted">{v.descrizione}</span>}
                    </span>
                  </label>
                  {attiva && (
                    <input value={sel.get(v.nome) ?? ""} onChange={(e) => setSel((m) => new Map(m).set(v.nome, e.target.value))} maxLength={300} placeholder="Nota (facoltativa)" className="mt-2 w-full rounded-lg border border-line px-2 py-1.5 text-sm" />
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
      <div><button type="button" disabled={busy} onClick={salva} className="btn-primary">{busy ? "Salvo…" : "Salva dotazioni"}</button></div>
    </div>
  );
}
