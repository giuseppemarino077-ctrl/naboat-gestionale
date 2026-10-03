"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { Icona } from "@/components/ui/Icona";
import { testoCondizioniPredefinito } from "@/lib/contratto-testo";

type Pren = {
  id: string; clienteNome: string | null; telefono: string | null; email: string | null;
  startAt: string; endAt: string; passeggeri: number; destinazione: string | null; formula: string | null;
  prezzoCent: number | null; cauzioneCent: number | null; patenteOk: boolean;
  contrattoTesto: string | null; contrattoFirmatoAt: string | null; contrattoFirmaNome: string | null;
  boat: { nome: string; tipo: string | null; capienza: number | null; potenzaCv: number | null; patenteRichiesta: boolean } | null;
  skipper: { nome: string } | null;
  customer: { telefono: string | null; email: string | null } | null;
};
type Tenant = { nome: string; indirizzoPartenza: string | null; telefonoContatto: string | null; logoUrl: string | null };

const euro = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));
const quando = (iso: string) => new Date(iso).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "long", timeStyle: "short" });
const campo = "min-h-11 w-full rounded-xl border border-line bg-white px-3 text-base outline-none focus:border-ocean focus:ring-2 focus:ring-ocean/15 sm:text-sm";

export default function ContrattoPrenotazionePage() {
  const { id } = useParams<{ id: string }>();
  const [pren, setPren] = useState<Pren | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [testo, setTesto] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

  const carica = () => fetch(`/api/v1/bookings/${id}`).then((r) => (r.ok ? r.json() : Promise.reject())).then((j: Pren) => {
    setPren(j);
    setTesto(j.contrattoTesto?.trim() ? j.contrattoTesto : testoCondizioniPredefinito());
  }).catch(() => setErr("Non è stato possibile caricare la prenotazione."));

  useEffect(() => {
    carica();
    fetch("/api/v1/tenant").then((r) => (r.ok ? r.json() : null)).then((j) => j && setTenant(j)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const condizioni = useMemo(() => testo.split("\n").map((r) => r.trim()).filter(Boolean), [testo]);

  const salvaTesto = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/bookings/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contrattoTesto: testo.trim() ? testo : null }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Salvataggio non riuscito."); return; }
      setMsg("Testo del contratto salvato. Genera un nuovo link per applicarlo."); carica();
    } finally { setBusy(false); }
  };

  const generaLink = async (): Promise<string | null> => {
    const r = await fetch(`/api/v1/bookings/${id}/contratto`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Generazione link non riuscita."); return null; }
    setLink(j.url); setErr("");
    return j.url as string;
  };

  const apriAnteprima = async () => {
    setBusy(true);
    try { const url = link || await generaLink(); if (url) window.open(url, "_blank", "noopener"); }
    finally { setBusy(false); }
  };

  const inviaWhatsApp = async () => {
    setBusy(true);
    try {
      const url = link || await generaLink();
      if (!url) return;
      const tel = (pren?.telefono ?? pren?.customer?.telefono ?? "").replace(/[^\d+]/g, "").replace(/^\+/, "");
      const testo = encodeURIComponent(`Ciao ${pren?.clienteNome ?? "cliente"}, ecco il contratto di noleggio da leggere e firmare: ${url}`);
      const wa = tel ? `https://wa.me/${tel}?text=${testo}` : `https://wa.me/?text=${testo}`;
      window.open(wa, "_blank", "noopener");
      setMsg("WhatsApp aperto con il link del contratto.");
    } finally { setBusy(false); }
  };

  const inviaEmail = async () => {
    setBusy(true); setErr(""); setMsg("");
    try {
      const r = await fetch(`/api/v1/bookings/${id}/contratto/invia`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ canale: "email" }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Invio non riuscito."); return; }
      setLink(j.url ?? link);
      setMsg(j.messaggio ?? `Contratto inviato a ${j.email}.`);
    } finally { setBusy(false); }
  };

  if (!pren) return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento />;

  const azienda = tenant?.nome ?? "";

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href={`/gestionale/prenotazioni/${id}`} className="text-sm font-semibold text-ocean">← Torna alla prenotazione</Link>
          <h1 className="mt-1 font-display text-2xl font-semibold text-ink">Contratto di noleggio</h1>
          <p className="text-sm text-muted">{pren.clienteNome ?? "Cliente"} · {pren.boat?.nome ?? "Imbarcazione"} · {quando(pren.startAt)}</p>
        </div>
        {pren.contrattoFirmatoAt && <span className="badge-ready">Firmato da {pren.contrattoFirmaNome ?? "cliente"} il {quando(pren.contrattoFirmatoAt)}</span>}
      </div>

      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card grid gap-4 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-ink">Testo del contratto</h2>
            <button type="button" className="text-xs font-bold text-ocean" onClick={() => setTesto(testoCondizioniPredefinito())}>Ripristina predefinite</button>
          </div>
          <label className="grid gap-2 text-sm font-semibold">Condizioni (una clausola per riga)
            <textarea rows={12} value={testo} onChange={(e) => setTesto(e.target.value)} maxLength={20000} className={campo + " py-3 font-normal"} />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={salvaTesto} className="btn-primary">Salva testo</button>
            <button type="button" disabled={busy} onClick={generaLink} className="btn-soft">Genera / aggiorna link</button>
          </div>
          <p className="text-xs text-muted">Salvando il testo, il contratto già firmato non viene modificato: alla generazione successiva nasce una nuova revisione da far firmare.</p>
        </section>

        <section className="card grid gap-3 p-5 text-sm">
          <h2 className="font-display text-lg font-bold text-ink">Anteprima</h2>
          <div className="rounded-2xl border border-line bg-sand p-4">
            <p className="font-display text-base font-bold text-ink">{azienda || "Azienda"}</p>
            {tenant?.indirizzoPartenza && <p className="text-muted">{tenant.indirizzoPartenza}</p>}
            {tenant?.telefonoContatto && <p className="text-muted">Tel. {tenant.telefonoContatto}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-2">
              <div><dt className="text-xs text-muted">Cliente</dt><dd className="font-semibold">{pren.clienteNome ?? "—"}</dd></div>
              <div><dt className="text-xs text-muted">Passeggeri</dt><dd className="font-semibold">{pren.passeggeri}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted">Periodo</dt><dd className="font-semibold">{quando(pren.startAt)} → {quando(pren.endAt)}</dd></div>
              <div className="col-span-2"><dt className="text-xs text-muted">Imbarcazione</dt><dd className="font-semibold">{pren.boat?.nome ?? "—"}{pren.boat?.tipo ? ` (${pren.boat.tipo})` : ""}</dd></div>
              {pren.skipper?.nome && <div className="col-span-2"><dt className="text-xs text-muted">Skipper</dt><dd className="font-semibold">{pren.skipper.nome}</dd></div>}
              {pren.destinazione && <div className="col-span-2"><dt className="text-xs text-muted">Destinazione</dt><dd className="font-semibold">{pren.destinazione}</dd></div>}
              <div><dt className="text-xs text-muted">Prezzo noleggio</dt><dd className="font-semibold">{euro(pren.prezzoCent)}</dd></div>
              <div><dt className="text-xs text-muted">Cauzione</dt><dd className="font-semibold">{euro(pren.cauzioneCent)}</dd></div>
            </dl>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-muted">Condizioni</p>
            <ol className="mt-1 grid gap-1">
              {condizioni.map((c, i) => <li key={i} className="text-ink/85">{c}</li>)}
            </ol>
          </div>
        </section>
      </div>

      <section className="card grid gap-3 p-5">
        <h2 className="font-display text-lg font-bold text-ink">Azioni</h2>
        {link && <p className="break-all text-xs text-muted">Link di firma: {link}</p>}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={apriAnteprima} className="btn-soft gap-1.5"><Icona nome="occhio" className="h-4 w-4" /> Apri anteprima cliente</button>
          <a href={`/api/v1/bookings/${id}/contratto/pdf`} target="_blank" rel="noreferrer" className="btn-soft gap-1.5"><Icona nome="documento" className="h-4 w-4" /> Scarica PDF</a>
          <button type="button" disabled={busy} onClick={inviaWhatsApp} className="btn-soft gap-1.5"><Icona nome="mail" className="h-4 w-4" /> Invia WhatsApp</button>
          <button type="button" disabled={busy} onClick={inviaEmail} className="btn-primary gap-1.5"><Icona nome="mail" className="h-4 w-4" /> Invia via email</button>
        </div>
        <p className="text-xs text-muted">Salva il testo prima di generare il link: l&apos;anteprima e l&apos;invio usano la versione generata.</p>
      </section>
    </div>
  );
}
