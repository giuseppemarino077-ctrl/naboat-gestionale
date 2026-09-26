"use client";
import { useEffect, useState } from "react";

type Pagina = {
  id: string; tipo: string; refId: string | null; slug: string | null; pubblica: boolean; noindex: boolean;
  titoloAuto: string | null; descrizioneAuto: string | null; keywordsAuto: string | null;
  titolo: string | null; descrizione: string | null; keywords: string | null; immagine: string | null;
  azienda: string | null; nome: string | null; aggiornatoAt: string;
  effettivo: { titolo: string; descrizione: string; keywords: string; pubblica: boolean; noindex: boolean; slug: string | null; manuale: { titolo: boolean; descrizione: boolean; keywords: boolean } };
};
type Impostazioni = {
  seoPubblicheAttive: boolean; seoTitoloDefault: string; seoDescrizioneDefault: string; seoKeywordsDefault: string;
  seoImmagineDefault: string; seoDominioPubblico: string; seoAnalyticsId: string; seoVerificaGoogle: string; seoLocalitaDefault: string;
};

const nomeTipo = (t: string) => (t === "piattaforma" ? "Piattaforma" : t === "azienda" ? "Azienda" : t === "barca" ? "Barca" : "Skipper");

export default function SeoPage() {
  const [imp, setImp] = useState<Impostazioni | null>(null);
  const [pagine, setPagine] = useState<Pagina[]>([]);
  const [conteggi, setConteggi] = useState({ aziende: 0, barche: 0, skipper: 0 });
  const [filtro, setFiltro] = useState("tutte");
  const [aperta, setAperta] = useState<string | null>(null);
  const [bozza, setBozza] = useState<Partial<Pagina>>({});
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch("/api/v1/admin/seo")
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error); setImp(j.impostazioni); setPagine(j.pagine); setConteggi(j.conteggi); })
      .catch((e) => setErr(e.message));
  };
  useEffect(load, []);

  const invia = async (body: any, okMsg: string) => {
    const r = await fetch("/api/v1/admin/seo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return false; }
    setErr(""); setMsg(okMsg); load();
    return true;
  };

  const salvaImpostazioni = () => imp && invia({ azione: "impostazioni", ...imp }, "Impostazioni SEO salvate.");

  const rigenera = async () => {
    const r = await fetch("/api/v1/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "rigenera" }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return; }
    setErr(""); setMsg(`Testi rigenerati: ${j.aziende} aziende, ${j.barche} barche, ${j.skipper} skipper.`); load();
  };

  const salvaPagina = async (p: Pagina) => {
    const b: any = { azione: "pagina", id: p.id };
    for (const k of ["slug", "titolo", "descrizione", "keywords", "immagine"] as const) {
      if (bozza[k] !== undefined) b[k] = bozza[k] === "" ? null : bozza[k];
    }
    if (bozza.pubblica !== undefined) b.pubblica = bozza.pubblica;
    if (bozza.noindex !== undefined) b.noindex = bozza.noindex;
    if (await invia(b, "Pagina aggiornata.")) { setAperta(null); setBozza({}); }
  };

  const visibili = pagine.filter((p) => filtro === "tutte" || p.tipo === filtro);

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-sm text-muted">NaBoat Admin · SEO</p>
          <h1 className="text-2xl">Pagine pubbliche e parole chiave.</h1>
        </div>
        <div className="flex gap-2">
          <a className="rounded-[7px] border border-line px-4 py-2.5 text-sm font-bold text-ocean" href="/admin">← Aziende</a>
          <button className="btn-primary" onClick={rigenera}>↻ Rigenera tutti i testi</button>
        </div>
      </div>
      {err && <p className="card p-3 text-sm font-semibold text-coral">{err}</p>}
      {msg && <p className="card p-3 text-sm font-semibold text-[#177469]">{msg}</p>}

      <div className="box card p-4 text-sm" style={{ background: "#fff8e6", border: "1px solid #e6a73c" }}>
        <b>Il gestionale resta fuori dai motori di ricerca.</b> Questi testi servono alle <b>pagine pubbliche</b> (profilo dell'azienda, schede
        delle barche) che nascono con il modulo Marketplace. Finché l'interruttore «pagine pubbliche attive» è spento, robots.txt continua a
        bloccare tutto e la sitemap resta vuota: nessun rischio di far indicizzare dati di lavoro.
      </div>

      {imp && (
        <div className="card grid gap-3 p-5 text-sm">
          <h2 className="text-lg">Impostazioni generali</h2>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={imp.seoPubblicheAttive} onChange={(e) => setImp({ ...imp, seoPubblicheAttive: e.target.checked })} />
            <b>Pagine pubbliche attive</b> (sblocca robots.txt e sitemap verso le pagine del marketplace)
          </label>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="grid gap-1">Titolo del sito (max 60 caratteri)
              <input className="rounded-md border border-line p-2" value={imp.seoTitoloDefault} onChange={(e) => setImp({ ...imp, seoTitoloDefault: e.target.value })} />
            </label>
            <label className="grid gap-1">Dominio pubblico
              <input className="rounded-md border border-line p-2" value={imp.seoDominioPubblico} onChange={(e) => setImp({ ...imp, seoDominioPubblico: e.target.value })} placeholder="https://naboat.it" />
            </label>
            <label className="grid gap-1 md:col-span-2">Descrizione (max 160 caratteri)
              <textarea className="rounded-md border border-line p-2" rows={2} value={imp.seoDescrizioneDefault} onChange={(e) => setImp({ ...imp, seoDescrizioneDefault: e.target.value })} />
            </label>
            <label className="grid gap-1 md:col-span-2">Parole chiave di base (separate da virgola)
              <textarea className="rounded-md border border-line p-2" rows={2} value={imp.seoKeywordsDefault} onChange={(e) => setImp({ ...imp, seoKeywordsDefault: e.target.value })} />
            </label>
            <label className="grid gap-1">Immagine social di default (indirizzo)
              <input className="rounded-md border border-line p-2" value={imp.seoImmagineDefault} onChange={(e) => setImp({ ...imp, seoImmagineDefault: e.target.value })} />
            </label>
            <label className="grid gap-1">Zona/porto di riferimento
              <input className="rounded-md border border-line p-2" value={imp.seoLocalitaDefault} onChange={(e) => setImp({ ...imp, seoLocalitaDefault: e.target.value })} placeholder="es. Napoli e Golfo" />
            </label>
            <label className="grid gap-1">Codice Analytics (se usato)
              <input className="rounded-md border border-line p-2" value={imp.seoAnalyticsId} onChange={(e) => setImp({ ...imp, seoAnalyticsId: e.target.value })} placeholder="G-XXXXXXX" />
            </label>
            <label className="grid gap-1">Verifica Google Search Console
              <input className="rounded-md border border-line p-2" value={imp.seoVerificaGoogle} onChange={(e) => setImp({ ...imp, seoVerificaGoogle: e.target.value })} />
            </label>
          </div>
          <button className="btn-primary w-fit" onClick={salvaImpostazioni}>Salva impostazioni</button>

          <div className="rounded-md bg-[#f7f4ee] p-3">
            <p className="text-xs tracking-widest text-muted">ANTEPRIMA SU GOOGLE</p>
            <p className="mt-1 text-[#1a0dab]">{imp.seoTitoloDefault || "NaBoat — Noleggio barche e gestione per i noleggiatori"}</p>
            <p className="text-xs text-[#006621]">{(imp.seoDominioPubblico || "https://app.naboat.it").replace(/^https?:\/\//, "").slice(0, 60)}</p>
            <p className="text-sm text-muted">{(imp.seoDescrizioneDefault || "Descrizione non ancora impostata").slice(0, 160)}</p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted">Pagine preparate: {conteggi.aziende} aziende · {conteggi.barche} barche · {conteggi.skipper} skipper</span>
        <div className="ml-auto flex gap-2">
          {["tutte", "piattaforma", "azienda", "barca", "skipper"].map((f) => (
            <button key={f} onClick={() => setFiltro(f)} className={`rounded-full px-3 py-1 text-xs font-bold ${filtro === f ? "bg-deep text-white" : "border border-line bg-white text-muted"}`}>
              {f === "tutte" ? "Tutte" : nomeTipo(f)}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3">
        {visibili.map((p) => {
          const e = p.effettivo;
          const isOpen = aperta === p.id;
          return (
            <div key={p.id} className="card grid gap-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="badge-block">{nomeTipo(p.tipo)}</span>
                <b>{p.tipo === "piattaforma" ? "Sito NaBoat" : p.nome ?? p.azienda ?? "—"}</b>
                {p.azienda && p.tipo !== "azienda" && <span className="text-muted">· {p.azienda}</span>}
                {e.slug && <code className="text-xs">/{e.slug}</code>}
                <span className={`ml-auto ${p.pubblica && !p.noindex ? "badge-ready" : "badge-pending"}`}>
                  {p.pubblica ? (p.noindex ? "pubblica (noindex)" : "pubblica") : "non pubblica"}
                </span>
                <button className="font-bold text-ocean" onClick={() => { setAperta(isOpen ? null : p.id); setBozza({}); }}>{isOpen ? "Chiudi" : "Modifica"}</button>
              </div>

              <div className="rounded-md bg-[#f7f4ee] p-3">
                <p className="text-[#1a0dab]">{e.titolo || "(titolo mancante)"}</p>
                <p className="text-xs text-[#006621]">{(imp?.seoDominioPubblico || "https://app.naboat.it").replace(/^https?:\/\//, "")}{e.slug ? `/${e.slug}` : ""}</p>
                <p className="text-muted">{e.descrizione || "(descrizione mancante)"}</p>
                {e.keywords && <p className="mt-1 text-xs text-muted">Parole chiave: {e.keywords}</p>}
              </div>

              {isOpen && (
                <div className="grid gap-2 border-t border-line pt-3">
                  <p className="text-xs text-muted">
                    I testi generati automaticamente dai dati reali: <b>{p.titoloAuto ? "titolo" : "—"}</b>, <b>{p.descrizioneAuto ? "descrizione" : "—"}</b>, <b>{p.keywordsAuto ? "parole chiave" : "—"}</b>.
                    Compilando i campi qui sotto li sostituisci: svuotandoli torni all'automatico.
                  </p>
                  <label className="grid gap-1">Indirizzo pubblico (slug)
                    <input className="rounded-md border border-line p-2" defaultValue={p.slug ?? ""} onChange={(ev) => setBozza({ ...bozza, slug: ev.target.value })} placeholder="es. golfo-charter" />
                  </label>
                  <label className="grid gap-1">Titolo (max 60 caratteri) {e.manuale.titolo && <span className="badge-pending">personalizzato</span>}
                    <input className="rounded-md border border-line p-2" defaultValue={p.titolo ?? ""} onChange={(ev) => setBozza({ ...bozza, titolo: ev.target.value })} placeholder={p.titoloAuto ?? ""} />
                  </label>
                  <label className="grid gap-1">Descrizione (max 160 caratteri) {e.manuale.descrizione && <span className="badge-pending">personalizzata</span>}
                    <textarea className="rounded-md border border-line p-2" rows={2} defaultValue={p.descrizione ?? ""} onChange={(ev) => setBozza({ ...bozza, descrizione: ev.target.value })} placeholder={p.descrizioneAuto ?? ""} />
                  </label>
                  <label className="grid gap-1">Parole chiave {e.manuale.keywords && <span className="badge-pending">personalizzate</span>}
                    <textarea className="rounded-md border border-line p-2" rows={2} defaultValue={p.keywords ?? ""} onChange={(ev) => setBozza({ ...bozza, keywords: ev.target.value })} placeholder={p.keywordsAuto ?? ""} />
                  </label>
                  <label className="grid gap-1">Immagine social
                    <input className="rounded-md border border-line p-2" defaultValue={p.immagine ?? ""} onChange={(ev) => setBozza({ ...bozza, immagine: ev.target.value })} placeholder={imp?.seoImmagineDefault ?? ""} />
                  </label>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2"><input type="checkbox" defaultChecked={p.pubblica} onChange={(ev) => setBozza({ ...bozza, pubblica: ev.target.checked })} /> Pagina pubblica</label>
                    <label className="flex items-center gap-2"><input type="checkbox" defaultChecked={p.noindex} onChange={(ev) => setBozza({ ...bozza, noindex: ev.target.checked })} /> Escludi dai motori (noindex)</label>
                  </div>
                  <button className="btn-primary w-fit" onClick={() => salvaPagina(p)}>Salva pagina</button>
                </div>
              )}
            </div>
          );
        })}
        {!visibili.length && <p className="card p-3 text-sm text-muted">Nessuna pagina preparata per questo filtro.</p>}
      </div>

      <p className="text-xs text-muted">
        Controlli automatici: <code>/robots.txt</code> e <code>/sitemap.xml</code> seguono queste impostazioni. Con «pagine pubbliche attive» spento, robots blocca tutto.
      </p>
    </div>
  );
}
