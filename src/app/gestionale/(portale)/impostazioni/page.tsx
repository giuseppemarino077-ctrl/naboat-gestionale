"use client";
import { useEffect, useState } from "react";

// Editor del profilo pubblico dell'azienda: gli stessi dati mostrati su
// /azienda/<slug>. Lo slug lo assegna NaBoat con la SEO: qui è in sola lettura.
type Profilo = {
  id: string;
  nome: string;
  logoUrl: string | null;
  slug: string | null;
  verificata: boolean;
  copertinaUrl: string | null;
  indirizzoPartenza: string | null;
  telefonoContatto: string | null;
  citta: string | null;
  annoFondazione: number | null;
  descrizione: string | null;
  lingue: string | null;
  orarioImbarco: string | null;
  orarioRientro: string | null;
  politicaCancellazione: string | null;
  sito: string | null;
  social: string | null;
  mostraEmail: boolean;
  mostraTelefono: boolean;
  mostraSocial: boolean;
  mostraRecensioni: boolean;
  mostraChiSiamo: boolean;
  mostraPorti: boolean;
};

const campi = [
  "nome", "indirizzoPartenza", "telefonoContatto", "citta", "annoFondazione", "descrizione",
  "lingue", "orarioImbarco", "orarioRientro", "politicaCancellazione", "sito", "social",
  "mostraEmail", "mostraTelefono", "mostraSocial", "mostraRecensioni", "mostraChiSiamo", "mostraPorti",
] as const;

export default function ImpostazioniPage() {
  const [p, setP] = useState<Profilo | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [versioneAnteprima, setVersioneAnteprima] = useState(0);
  const [salvando, setSalvando] = useState(false);
  const [caricando, setCaricando] = useState(false);

  const load = () => {
    fetch("/api/v1/tenant")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((j: Profilo) => setP(j))
      .catch(() => setErr("Non riesco a leggere i dati dell'azienda."));
  };
  useEffect(load, []);

  const set = (patch: Partial<Profilo>) => setP((cur) => (cur ? { ...cur, ...patch } : cur));

  const salva = async () => {
    if (!p) return;
    setSalvando(true); setErr(""); setMsg("");
    const body: Record<string, unknown> = {};
    for (const k of campi) body[k] = p[k];
    const r = await fetch("/api/v1/tenant", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito"); return; }
    setP(j as Profilo);
    setMsg("Profilo pubblico aggiornato.");
    setVersioneAnteprima((v) => v + 1);
  };

  const caricaCopertina = async (file: File) => {
    setCaricando(true); setErr(""); setMsg("");
    const fd = new FormData();
    fd.append("file", file);
    const r = await fetch("/api/v1/tenant", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setCaricando(false);
    if (!r.ok) { setErr(j.error ?? "Caricamento non riuscito"); return; }
    set({ copertinaUrl: j.copertinaUrl });
    setMsg("Foto di copertina aggiornata.");
    setVersioneAnteprima((v) => v + 1);
  };

  if (!p) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl">Profilo pubblico</h1>
        {err ? <p className="card p-3 text-sm font-semibold text-coral">{err}</p> : <p className="text-sm text-muted">Caricamento…</p>}
      </div>
    );
  }

  const anteprimaUrl = `/azienda/${p.slug ?? p.id}`;

  return (
    <div className="grid gap-4">
      <div>
        <p className="text-sm text-muted">Impostazioni</p>
        <h1 className="text-2xl">Profilo pubblico dell'azienda.</h1>
        <p className="text-sm text-muted">Questi dati compaiono nella pagina pubblica dell'azienda su NaBoat. Salva per applicare le modifiche.</p>
      </div>

      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="grid gap-4">
          <div className="card grid gap-3 p-5 text-sm">
            <h2 className="text-lg">Presentazione</h2>
            <label className="grid gap-1">Nome pubblico
              <input className="rounded-md border border-line p-2" maxLength={120} value={p.nome} onChange={(e) => set({ nome: e.target.value })} />
            </label>
            <label className="grid gap-1">Descrizione (chi siamo)
              <textarea className="rounded-md border border-line p-2" rows={5} maxLength={2000} value={p.descrizione ?? ""} onChange={(e) => set({ descrizione: e.target.value })} placeholder="Racconta l'azienda, il territorio, il servizio." />
            </label>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">Città / località
                <input className="rounded-md border border-line p-2" maxLength={120} value={p.citta ?? ""} onChange={(e) => set({ citta: e.target.value })} placeholder="Es. Sorrento" />
              </label>
              <label className="grid gap-1">Anno di fondazione
                <input type="number" min={1800} max={2100} className="rounded-md border border-line p-2" value={p.annoFondazione ?? ""} onChange={(e) => set({ annoFondazione: e.target.value === "" ? null : Number(e.target.value) })} />
              </label>
              <label className="grid gap-1">Lingue parlate
                <input className="rounded-md border border-line p-2" maxLength={200} value={p.lingue ?? ""} onChange={(e) => set({ lingue: e.target.value })} placeholder="Es. Italiano, inglese" />
              </label>
              <label className="grid gap-1">Punto di partenza
                <input className="rounded-md border border-line p-2" maxLength={200} value={p.indirizzoPartenza ?? ""} onChange={(e) => set({ indirizzoPartenza: e.target.value })} placeholder="Es. Porto di Sorrento, Molo B" />
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">Orario di imbarco
                <input className="rounded-md border border-line p-2" maxLength={60} value={p.orarioImbarco ?? ""} onChange={(e) => set({ orarioImbarco: e.target.value })} placeholder="Es. 9:00" />
              </label>
              <label className="grid gap-1">Orario di rientro
                <input className="rounded-md border border-line p-2" maxLength={60} value={p.orarioRientro ?? ""} onChange={(e) => set({ orarioRientro: e.target.value })} placeholder="Es. 18:00" />
              </label>
            </div>
            <label className="grid gap-1">Politica di cancellazione
              <textarea className="rounded-md border border-line p-2" rows={3} maxLength={1000} value={p.politicaCancellazione ?? ""} onChange={(e) => set({ politicaCancellazione: e.target.value })} placeholder="Es. Rimborso completo fino a 7 giorni prima dell'uscita." />
            </label>
          </div>

          <div className="card grid gap-3 p-5 text-sm">
            <h2 className="text-lg">Contatti e canali</h2>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-1">Telefono per i clienti
                <input className="rounded-md border border-line p-2" maxLength={40} value={p.telefonoContatto ?? ""} onChange={(e) => set({ telefonoContatto: e.target.value })} placeholder="Es. 081 1234567" />
              </label>
              <label className="grid gap-1">Sito web
                <input className="rounded-md border border-line p-2" maxLength={300} value={p.sito ?? ""} onChange={(e) => set({ sito: e.target.value })} placeholder="Es. www.esempio.it" />
              </label>
              <label className="grid gap-1 md:col-span-2">Pagina social
                <input className="rounded-md border border-line p-2" maxLength={300} value={p.social ?? ""} onChange={(e) => set({ social: e.target.value })} placeholder="Es. instagram.com/latuaazienda" />
              </label>
            </div>
            <h3 className="mt-2 font-bold">Cosa mostrare nella pagina pubblica</h3>
            <div className="grid gap-2 text-xs md:grid-cols-2">
              {([
                ["mostraTelefono", "Telefono"],
                ["mostraEmail", "Modulo contatti (email)"],
                ["mostraSocial", "Sito e social"],
                ["mostraChiSiamo", "Sezione «Chi siamo»"],
                ["mostraPorti", "Porti operativi"],
                ["mostraRecensioni", "Recensioni"],
              ] as const).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2">
                  <input type="checkbox" checked={p[k]} onChange={(e) => set({ [k]: e.target.checked } as Partial<Profilo>)} />
                  <span>{label}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted">La spunta decide solo la visibilità: i dati restano nel profilo e si nascondono quando serve.</p>
          </div>

          <div className="card grid gap-3 p-5 text-sm">
            <h2 className="text-lg">Foto di copertina</h2>
            {p.copertinaUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={p.copertinaUrl} alt="copertina" className="h-40 w-full rounded-2xl border border-line object-cover" />
            ) : (
              <p className="text-muted">Senza copertina si usa la foto di una barca pubblicata (o il logo).</p>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <label className="btn-primary cursor-pointer">
                {caricando ? "Carico…" : "Carica copertina"}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && caricaCopertina(e.target.files[0])} />
              </label>
              {p.copertinaUrl && (
                <button className="rounded-md border border-line px-3 py-2 font-bold text-coral" onClick={async () => {
                  const r = await fetch("/api/v1/tenant", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ copertinaUrl: null }) });
                  if (r.ok) { set({ copertinaUrl: null }); setVersioneAnteprima((v) => v + 1); }
                }}>Rimuovi</button>
              )}
            </div>
            <p className="text-xs text-muted">Jpeg/png/webp, max 5 MB. Lo slug pubblico (<code>{p.slug ?? "assegnato da NaBoat"}</code>) e l&apos;indicatore «verificata» li assegna NaBoat.</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button className="btn-primary" disabled={salvando} onClick={salva}>{salvando ? "Salvo…" : "Salva profilo"}</button>
            <a className="font-bold text-ocean" href={anteprimaUrl} target="_blank" rel="noreferrer">Apri l&apos;anteprima pubblica →</a>
          </div>
        </div>

        <div className="card grid gap-2 p-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold">Anteprima</h2>
            <button className="text-xs font-bold text-ocean" onClick={() => setVersioneAnteprima((v) => v + 1)}>Aggiorna</button>
          </div>
          <iframe key={versioneAnteprima} src={anteprimaUrl} title="Anteprima profilo pubblico" className="h-[70vh] w-full rounded-2xl border border-line bg-white" />
        </div>
      </div>
    </div>
  );
}
