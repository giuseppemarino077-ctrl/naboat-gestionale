"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { StatoVuoto } from "@/components/ui/StatoVuoto";
import { Icona } from "@/components/ui/Icona";
import { Dialogo, useConferma } from "@/components/ui/Dialogo";
import { useModulo } from "@/components/ui/ModuloDialogo";

type Boat = { id: string; nome: string; tipo?: string; capienza: number; potenzaCv?: number; patenteRichiesta: boolean; stato: string; fotoCopertina?: string | null; fotoGallery: string[]; lat?: number | null; lon?: number | null; pubblicata?: boolean; inPausa?: boolean; archiviato?: boolean; portoId?: string | null; modelloId?: string | null; porto?: { id: string; nome: string } | null; modello?: { id: string; modello: string } | null };

export default function FlottaPage() {
  const [boats, setBoats] = useState<Boat[] | null>(null);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [extras, setExtras] = useState<any[]>([]);
  const [porti, setPorti] = useState<any[]>([]);
  const [modelli, setModelli] = useState<any[]>([]);
  const [tariffe, setTariffe] = useState<any[]>([]);
  const [ricerca, setRicerca] = useState("");
  const [archiviate, setArchiviate] = useState(false);
  const [tab, setTab] = useState<"barche" | "skipper" | "extra">("barche");
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [uploading, setUploading] = useState<string | null>(null);
  const [avanzati, setAvanzati] = useState(false);
  const [form, setForm] = useState({ nome: "", tipo: "", capienza: 6, potenzaCv: 100, patenteRichiesta: false });
  const [foto, setFoto] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const [extra, setExtra] = useState({ nome: "", prezzo: "" });
  const [skipper, setSkipper] = useState({ nome: "", telefono: "" });
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ nome: "", tipo: "", capienza: 1, potenzaCv: 0, patenteRichiesta: false, portoId: "", modelloId: "" });
  const [requisiti, setRequisiti] = useState<{ barca: Boat; mancanti: string[] } | null>(null);
  const conferma = useConferma();
  const modulo = useModulo();

  const load = () => {
    fetch(`/api/v1/boats${archiviate ? "?archiviate=1" : ""}`)
      .then((r) => r.json())
      .then((j) => { if (Array.isArray(j)) { setBoats(j); setErr(""); } else { setErr("Serve login con azienda attiva."); setBoats([]); } })
      .catch(() => { setErr("Serve login con azienda attiva."); setBoats([]); });
    fetch("/api/v1/skippers").then((r) => r.json()).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
    fetch("/api/v1/extras").then((r) => r.json()).then((j) => Array.isArray(j) && setExtras(j)).catch(() => {});
    fetch("/api/v1/porti").then((r) => r.json()).then((j) => Array.isArray(j) && setPorti(j)).catch(() => {});
    fetch("/api/v1/modelli").then((r) => r.json()).then((j) => Array.isArray(j) && setModelli(j)).catch(() => {});
    fetch("/api/v1/tariffe").then((r) => r.json()).then((j) => Array.isArray(j) && setTariffe(j)).catch(() => {});
  };
  useEffect(load, [archiviate]);

  const q = ricerca.trim().toLowerCase();
  const barcheFiltrate = (boats ?? []).filter((b) =>
    !q || b.nome.toLowerCase().includes(q) || (b.tipo ?? "").toLowerCase().includes(q) || (b.porto?.nome ?? "").toLowerCase().includes(q),
  );

  const haPrezzo = (b: Boat) => tariffe.some((t) => t.attivo && (t.boatId === b.id || t.boatId == null));
  const requisitiMancanti = (b: Boat) => {
    const mancanti: string[] = [];
    if ((b.fotoGallery?.length ?? 0) === 0) mancanti.push("almeno una foto dell'imbarcazione");
    if (!haPrezzo(b)) mancanti.push("un prezzo attivo nel listino (generale o della barca)");
    return mancanti;
  };

  const upload = async (boatId: string, file: File) => {
    setUploading(boatId); setErr("");
    const fd = new FormData();
    fd.append("file", file); fd.append("boatId", boatId);
    const r = await fetch("/api/v1/uploads", { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    setUploading(null);
    if (!r.ok) setErr(j.error ?? "Upload fallito");
    else load();
  };

  const api = async (url: string, method: string, body?: any) => {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    return j;
  };

  const creaBarca = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const r = await fetch("/api/v1/boats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, potenzaCv: Number(form.potenzaCv) || undefined }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    for (const f of foto) {
      const fd = new FormData();
      fd.append("file", f);
      fd.append("boatId", j.id);
      await fetch("/api/v1/uploads", { method: "POST", body: fd }).catch(() => {});
    }
    setForm({ nome: "", tipo: "", capienza: 6, potenzaCv: 100, patenteRichiesta: false });
    setFoto([]);
    setAvanzati(false);
    if (fileInput.current) fileInput.current.value = "";
    setMsg(`Imbarcazione «${j.nome ?? form.nome}» aggiunta. Pubblicala quando ha foto e prezzo.`);
    load();
  };

  const cambiaPubblicazione = async (b: Boat) => {
    setMsg("");
    if (!b.pubblicata) {
      const mancanti = requisitiMancanti(b);
      if (mancanti.length > 0) { setRequisiti({ barca: b, mancanti }); return; }
    }
    await api(`/api/v1/boats/${b.id}`, "PATCH", { pubblicata: !b.pubblicata });
  };

  const posizione = async (b: Boat) => {
    const v = await modulo.apri(`Posizione di ${b.nome}`, [
      { nome: "lat", etichetta: "Latitudine", valore: b.lat?.toString() ?? "", placeholder: "es. 40.8397" },
      { nome: "lon", etichetta: "Longitudine", valore: b.lon?.toString() ?? "", placeholder: "es. 14.2524" },
    ], { confermaLabel: "Salva posizione", descrizione: "Serve al meteo per questa barca. Lascia vuoto per rimuovere la posizione." });
    if (!v) return;
    const nLat = v.lat.trim() === "" ? null : Number(v.lat.replace(",", "."));
    const nLon = v.lon.trim() === "" ? null : Number(v.lon.replace(",", "."));
    if ((nLat !== null && !Number.isFinite(nLat)) || (nLon !== null && !Number.isFinite(nLon))) { setErr("Coordinate non valide"); return; }
    await api(`/api/v1/boats/${b.id}`, "PATCH", { lat: nLat, lon: nLon });
  };

  const rimuoviFoto = async (b: Boat, u: string) => {
    const ok = await conferma.chiedi({
      titolo: "Eliminare la foto?",
      messaggio: "La foto verrà rimossa dalla galleria e dalle schede pubbliche.",
      confermaLabel: "Elimina foto",
      pericoloso: true,
    });
    if (ok) await api(`/api/v1/boats/${b.id}`, "PATCH", { rimuoviFoto: u });
  };

  const eliminaBarca = async (b: Boat) => {
    const ok = await conferma.chiedi({
      titolo: `Eliminare «${b.nome}»?`,
      messaggio: "La barca verrà rimossa dall'elenco, dalle schede pubbliche e dal listino. L'operazione non è reversibile.",
      dettaglio: "Se vuoi solo toglierla dal sito, usa «Archivia» o «Ritira dal sito».",
      confermaLabel: "Elimina barca",
      pericoloso: true,
    });
    if (ok) await api(`/api/v1/boats/${b.id}`, "DELETE");
  };

  const rimuoviSkipper = async (s: any) => {
    const ok = await conferma.chiedi({
      titolo: `Rimuovere ${s.nome}?`,
      messaggio: "Lo skipper non sarà più assegnabile alle nuove prenotazioni.",
      confermaLabel: "Rimuovi skipper",
      pericoloso: true,
    });
    if (ok) await api(`/api/v1/skippers/${s.id}`, "DELETE");
  };

  return (
    <div className="grid gap-4">
      <div className="flex items-end justify-between">
        <div><p className="text-sm text-muted">Flotta</p><h1 className="text-2xl">Ogni risorsa, con il suo stato.</h1></div>
      </div>

      {err && boats !== null && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <div className="flex gap-2 text-sm">
        {(["barche", "skipper", "extra"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 font-bold capitalize ${tab === t ? "bg-deep text-white" : "bg-white text-muted border border-line"}`}>{t}</button>
        ))}
      </div>

      {tab === "barche" && (
        <>
          <form className="card grid gap-3 p-4 md:grid-cols-12 md:items-end" onSubmit={creaBarca}>
            <p className="text-sm font-bold md:col-span-12">Inserimento rapido</p>
            <label className="grid gap-1 text-sm md:col-span-5">
              <span className="text-xs font-semibold text-muted">Nome imbarcazione *</span>
              <input className="campo" placeholder="es. Gozzo Sorrentino 7.5" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} required />
            </label>
            <label className="grid gap-1 text-sm md:col-span-4">
              <span className="text-xs font-semibold text-muted">Tipo</span>
              <input className="campo" placeholder="es. gozzo, open, gommone" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} />
            </label>
            <label className="grid gap-1 text-sm md:col-span-3">
              <span className="text-xs font-semibold text-muted">Capienza (persone)</span>
              <input className="campo" type="number" min={1} value={form.capienza} onChange={(e) => setForm({ ...form, capienza: Number(e.target.value) })} />
            </label>

            <button
              type="button"
              aria-expanded={avanzati}
              onClick={() => setAvanzati((v) => !v)}
              className="flex items-center gap-1.5 text-sm font-bold text-ocean md:col-span-12"
            >
              <Icona nome={avanzati ? "freccia-giu" : "freccia-destra"} className="h-4 w-4" />
              {avanzati ? "Nascondi i dettagli avanzati" : "Aggiungi dettagli avanzati (motore, patente, foto)"}
            </button>

            {avanzati && (
              <>
                <label className="grid gap-1 text-sm md:col-span-3">
                  <span className="text-xs font-semibold text-muted">Potenza motore (CV)</span>
                  <input className="campo" type="number" min={0} value={form.potenzaCv} onChange={(e) => setForm({ ...form, potenzaCv: Number(e.target.value) })} />
                </label>
                <label className="flex items-center gap-2 pb-2 text-sm md:col-span-4">
                  <input type="checkbox" checked={form.patenteRichiesta} onChange={(e) => setForm({ ...form, patenteRichiesta: e.target.checked })} />
                  Richiesta la <b>patente nautica</b>
                </label>
                <label className="grid gap-1 text-sm md:col-span-5">
                  <span className="text-xs font-semibold text-muted">Foto (facoltative · jpeg/png/webp · max 5 MB)</span>
                  <input ref={fileInput} className="campo file:mr-3 file:rounded-md file:border-0 file:bg-foam file:px-3 file:py-1.5 file:font-bold file:text-ocean" type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={(e) => setFoto(Array.from(e.target.files ?? []))} />
                </label>
              </>
            )}

            <div className="md:col-span-3">
              <button className="btn-primary w-full" type="submit">
                <Icona nome="piu" className="mr-1.5 h-4 w-4" /> Aggiungi imbarcazione
              </button>
            </div>
          </form>

          <div className="flex flex-wrap items-center gap-3">
            <input className="campo max-w-sm" placeholder="Cerca per nome, tipo o porto…" value={ricerca} onChange={(e) => setRicerca(e.target.value)} />
            <label className="flex w-fit items-center gap-2 rounded-2xl border border-line bg-white px-3 py-2 text-sm"><input type="checkbox" checked={archiviate} onChange={(e) => setArchiviate(e.target.checked)} /> Mostra archiviate</label>
          </div>

          {boats === null ? (
            <Caricamento testo="Carico la flotta…" />
          ) : boats.length === 0 ? (
            <StatoVuoto icona="barca" titolo="Nessuna barca in flotta" testo="Aggiungi la prima imbarcazione dal modulo qui sopra: bastano nome, tipo e capienza." />
          ) : barcheFiltrate.length === 0 ? (
            <StatoVuoto icona="cerca" titolo="Nessuna barca corrisponde alla ricerca" azione={{ label: "Azzera la ricerca", onClick: () => setRicerca("") }} />
          ) : (
            <div className="grid gap-3 md:grid-cols-3">
              {barcheFiltrate.map((b) => {
                const mancanti = requisitiMancanti(b);
                return (
                  <article key={b.id} className="card overflow-hidden">
                    <div className="relative flex h-28 items-start justify-end bg-gradient-to-br from-foam to-[#e6f3f0] p-2">
                      {b.fotoCopertina && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={b.fotoCopertina} alt={b.nome} className="absolute inset-0 h-full w-full cursor-zoom-in object-cover" onClick={() => setLightbox(b.fotoCopertina!)} />
                      )}
                      <select aria-label={`Stato di ${b.nome}`} className="relative rounded-full bg-white/90 px-2 py-1 text-xs font-bold text-ocean" value={b.stato} onChange={(e) => api(`/api/v1/boats/${b.id}`, "PATCH", { stato: e.target.value })}>
                        <option value="disponibile">Disponibile</option>
                        <option value="non_disponibile">Non disponibile</option>
                        <option value="manutenzione">Manutenzione</option>
                      </select>
                    </div>
                    <div className="p-4">
                      <p className="text-xs tracking-widest text-muted">{b.tipo ?? "BARCA"}{b.patenteRichiesta ? " · PATENTE" : ""}{b.porto?.nome ? ` · ${b.porto.nome}` : ""}</p>
                      <h2 className="mb-2">{b.nome}</h2>
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
                        <span className={"rounded-full px-2 py-0.5 font-semibold " + (b.pubblicata ? "bg-ok-soft text-ok" : "bg-[#efe9e3] text-muted")}>{b.pubblicata ? "Pubblicata" : "Bozza"}</span>
                        {b.inPausa && <span className="rounded-full bg-warn-soft px-2 py-0.5 font-semibold text-warn">In pausa</span>}
                        {b.archiviato && <span className="rounded-full bg-[#e8ecec] px-2 py-0.5 font-semibold text-[#5d696b]">Archiviata</span>}
                      </div>

                      <div className="rounded-2xl border border-line bg-[#faf6f2] p-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Pubblicazione sul sito</p>
                        {mancanti.length === 0 ? (
                          <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-ok"><Icona nome="check" className="h-4 w-4" /> Pronta: foto e prezzo presenti</p>
                        ) : (
                          <ul className="mt-1 grid gap-0.5 text-sm text-muted">
                            {mancanti.map((m) => <li key={m} className="flex items-start gap-1.5"><Icona nome="avviso" className="mt-0.5 h-4 w-4 shrink-0 text-warn" /> Manca {m}.</li>)}
                          </ul>
                        )}
                        <div className="mt-2 flex flex-wrap gap-2 text-sm font-bold">
                          <button className={b.pubblicata ? "text-muted" : "text-ocean"} onClick={() => cambiaPubblicazione(b)}>{b.pubblicata ? "Ritira dal sito" : "Pubblica sul sito"}</button>
                          {b.pubblicata && <button className="text-ocean" onClick={() => api(`/api/v1/boats/${b.id}`, "PATCH", { inPausa: !b.inPausa })}>{b.inPausa ? "Riprendi" : "Metti in pausa"}</button>}
                          {mancanti.length > 0 && <Link className="text-ocean" href="/gestionale/impostazioni/listino">Listino →</Link>}
                        </div>
                      </div>

                      <dl className="mt-3 grid grid-cols-2 text-sm">
                        <div><dt className="text-xs text-muted">Capienza</dt><dd className="font-bold">{b.capienza}</dd></div>
                        <div><dt className="text-xs text-muted">Potenza</dt><dd className="font-bold">{b.potenzaCv ? `${b.potenzaCv} CV` : "–"}</dd></div>
                      </dl>
                      <button className="mt-2 text-xs font-bold text-ocean" onClick={() => posizione(b)}>
                        {b.lat && b.lon ? `Posizione: ${b.lat}, ${b.lon} — modifica` : "Aggiungi posizione per il meteo"}
                      </button>
                      <div className="mt-3">
                        <p className="text-xs font-bold text-muted">FOTO DELL&apos;IMBARCAMENTO ({b.fotoGallery?.length ?? 0})</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {(b.fotoGallery ?? []).map((u) => (
                            <span key={u} className={`relative inline-block ${u === b.fotoCopertina ? "ring-2 ring-ocean" : ""}`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={u} alt="" className="h-12 w-16 cursor-zoom-in rounded object-cover" onClick={() => setLightbox(u)} />
                              <span className="absolute bottom-0 left-0 flex gap-1 bg-white/90 p-0.5 text-[10px] font-bold">
                                <button className="text-muted" aria-label="Sposta indietro" onClick={() => { const g = [...b.fotoGallery]; const i = g.indexOf(u); const j = i - 1; if (j < 0) return; [g[i], g[j]] = [g[j], g[i]]; api(`/api/v1/boats/${b.id}`, "PATCH", { ordineFoto: g }); }}><Icona nome="freccia-sinistra" className="h-3 w-3" /></button>
                                <button className="text-muted" aria-label="Sposta avanti" onClick={() => { const g = [...b.fotoGallery]; const i = g.indexOf(u); const j = i + 1; if (j >= g.length) return; [g[i], g[j]] = [g[j], g[i]]; api(`/api/v1/boats/${b.id}`, "PATCH", { ordineFoto: g }); }}><Icona nome="freccia-destra" className="h-3 w-3" /></button>
                                {u !== b.fotoCopertina && <button className="text-ocean" aria-label="Imposta come copertina" onClick={() => api(`/api/v1/boats/${b.id}`, "PATCH", { fotoCopertina: u })}><Icona nome="stella" className="h-3 w-3" /></button>}
                                <button className="text-danger" aria-label="Elimina foto" onClick={() => rimuoviFoto(b, u)}><Icona nome="chiudi" className="h-3 w-3" /></button>
                              </span>
                            </span>
                          ))}
                          <label title="Aggiungi una foto dell'imbarcazione" className="grid h-12 w-16 cursor-pointer place-items-center rounded border border-dashed border-line text-lg text-muted">
                            {uploading === b.id ? "…" : <Icona nome="piu" className="h-5 w-5" />}
                            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(b.id, f); e.target.value = ""; }} />
                          </label>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-3 text-xs">
                        <button className="font-bold text-ocean" onClick={() => { setEditId(editId === b.id ? null : b.id); setEdit({ nome: b.nome, tipo: b.tipo ?? "", capienza: b.capienza, potenzaCv: b.potenzaCv ?? 0, patenteRichiesta: b.patenteRichiesta, portoId: b.portoId ?? "", modelloId: b.modelloId ?? "" }); }}>{editId === b.id ? "Chiudi" : "Modifica"}</button>
                        <button className="font-bold text-ocean" onClick={() => api(`/api/v1/boats/${b.id}/duplicate`, "POST")}>Duplica</button>
                        <button className="font-bold text-muted" onClick={() => api(`/api/v1/boats/${b.id}`, "PATCH", { archiviato: !b.archiviato })}>{b.archiviato ? "Ripristina" : "Archivia"}</button>
                        <button className="font-bold text-danger" onClick={() => eliminaBarca(b)}>Elimina</button>
                      </div>

                      {editId === b.id && (
                        <div className="mt-3 grid gap-2 rounded-2xl border border-line bg-[#faf6f2] p-3 text-sm">
                          <label className="grid gap-1">Nome<input className="campo" value={edit.nome} onChange={(e) => setEdit({ ...edit, nome: e.target.value })} /></label>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1">Tipo<input className="campo" value={edit.tipo} onChange={(e) => setEdit({ ...edit, tipo: e.target.value })} /></label>
                            <label className="grid gap-1">Capienza<input className="campo" type="number" min={1} value={edit.capienza} onChange={(e) => setEdit({ ...edit, capienza: Number(e.target.value) })} /></label>
                            <label className="grid gap-1">Potenza (CV)<input className="campo" type="number" min={0} value={edit.potenzaCv} onChange={(e) => setEdit({ ...edit, potenzaCv: Number(e.target.value) })} /></label>
                            <label className="flex items-end gap-2 pb-2"><input type="checkbox" checked={edit.patenteRichiesta} onChange={(e) => setEdit({ ...edit, patenteRichiesta: e.target.checked })} /> Patente richiesta</label>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <label className="grid gap-1">Porto
                              <select className="campo" value={edit.portoId} onChange={(e) => setEdit({ ...edit, portoId: e.target.value })}>
                                <option value="">— nessuno —</option>
                                {porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                              </select>
                            </label>
                            <label className="grid gap-1">Modello (catalogo)
                              <select className="campo" value={edit.modelloId} onChange={(e) => setEdit({ ...edit, modelloId: e.target.value })}>
                                <option value="">— libero —</option>
                                {modelli.map((m) => <option key={m.id} value={m.id}>{m.marca ? `${m.marca} ` : ""}{m.modello}{m.stato !== "approvato" ? " (in verifica)" : ""}</option>)}
                              </select>
                            </label>
                          </div>
                          <div className="flex gap-2">
                            <button className="btn-primary flex-1" onClick={async () => { await api(`/api/v1/boats/${b.id}`, "PATCH", { nome: edit.nome, tipo: edit.tipo || null, capienza: edit.capienza, potenzaCv: edit.potenzaCv, patenteRichiesta: edit.patenteRichiesta, portoId: edit.portoId || null, modelloId: edit.modelloId || null }); setEditId(null); }}>Salva modifiche</button>
                            <button className="btn-soft" onClick={() => setEditId(null)}>Annulla</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}

      {tab === "skipper" && (
        <div className="grid gap-3">
          <form className="card flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); api("/api/v1/skippers", "POST", skipper); setSkipper({ nome: "", telefono: "" }); }}>
            <input className="campo max-w-xs" placeholder="Nome *" value={skipper.nome} onChange={(e) => setSkipper({ ...skipper, nome: e.target.value })} required />
            <input className="campo max-w-xs" placeholder="Telefono" value={skipper.telefono} onChange={(e) => setSkipper({ ...skipper, telefono: e.target.value })} />
            <button className="btn-primary" type="submit"><Icona nome="piu" className="mr-1.5 h-4 w-4" /> Aggiungi</button>
          </form>
          {skippers.length === 0 ? (
            <StatoVuoto icona="utente" titolo="Nessuno skipper" testo="Aggiungi gli skipper per assegnarli alle uscite." />
          ) : (
            skippers.map((s: any) => (
              <div key={s.id} className="card flex items-center justify-between p-3 text-sm">
                <span><b>{s.nome}</b> <span className="text-muted">{s.telefono ?? ""}</span></span>
                <button className="font-bold text-danger" onClick={() => rimuoviSkipper(s)}>Rimuovi</button>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "extra" && (
        <div className="grid gap-3">
          <form className="card flex flex-wrap gap-2 p-4" onSubmit={(e) => { e.preventDefault(); api("/api/v1/extras", "POST", { nome: extra.nome, prezzo: extra.prezzo ? Number(extra.prezzo) : undefined }); setExtra({ nome: "", prezzo: "" }); }}>
            <input className="campo max-w-xs" placeholder="Nome *" value={extra.nome} onChange={(e) => setExtra({ ...extra, nome: e.target.value })} required />
            <input className="campo max-w-xs" placeholder="Prezzo €" type="number" min={0} value={extra.prezzo} onChange={(e) => setExtra({ ...extra, prezzo: e.target.value })} />
            <button className="btn-primary" type="submit"><Icona nome="piu" className="mr-1.5 h-4 w-4" /> Aggiungi</button>
          </form>
          {extras.length === 0 ? (
            <StatoVuoto icona="pacchetto" titolo="Nessun extra" testo="Gli extra (es. skipper, carburante, sup) si propongono in fase di prenotazione." />
          ) : (
            extras.map((x: any) => (
              <div key={x.id} className="card flex items-center justify-between p-3 text-sm">
                <span><b>{x.nome}</b> <span className="text-muted">{x.prezzo != null ? `€ ${x.prezzo}` : ""}</span></span>
              </div>
            ))
          )}
        </div>
      )}

      {lightbox && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4" onClick={() => setLightbox(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-full max-w-full rounded" />
        </div>
      )}

      <Dialogo aperto={!!requisiti} onChiudi={() => setRequisiti(null)} titolo={requisiti ? `Per pubblicare «${requisiti.barca.nome}»` : ""}>
        <p className="text-sm text-muted">Prima di comparire su NaBoat la barca deve avere:</p>
        <ul className="mt-2 grid gap-1 text-sm">
          {requisiti?.mancanti.map((m) => (
            <li key={m} className="flex items-start gap-2 rounded-2xl border border-warn-line bg-warn-soft p-2 text-warn">
              <Icona nome="avviso" className="mt-0.5 h-4 w-4 shrink-0" /> Manca {m}.
            </li>
          ))}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-soft" onClick={() => setRequisiti(null)}>Chiudi</button>
          <Link className="btn-primary" href="/gestionale/impostazioni/listino">Apri il listino</Link>
        </div>
      </Dialogo>

      {conferma.dialogo}
      {modulo.dialogo}
    </div>
  );
}
