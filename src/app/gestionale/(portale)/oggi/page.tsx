"use client";
import { copiaTesto } from "@/lib/browser";
import { etichettaGiorno, oggi as giornoOggi } from "@/lib/calendario";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import { useEffect, useState } from "react";
import { Avviso } from "@/components/ui/Avviso";
import { StatoVuoto } from "@/components/ui/StatoVuoto";
import { Icona, type NomeIcona } from "@/components/ui/Icona";
import { useModulo } from "@/components/ui/ModuloDialogo";

type Partenza = {
  id: string; ora: string; barca: string; cliente: string; dest: string; stato: string;
  checkinFatto: boolean; checkoutFatto: boolean; contrattoFirmato: boolean;
  telefono: string | null; prezzoCent: number | null; cauzioneStato: string;
};
type Today = { uscite: number; rientri: number; barcheBloccate: number; attenzioni: number; partenze: Partenza[] };

const euro = (c: number | null) => (c == null ? "—" : (c / 100).toLocaleString("it-IT", { style: "currency", currency: "EUR" }));

export default function OggiPage() {
  const [data, setData] = useState<Today | null>(null);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [link, setLink] = useState("");
  const modulo = useModulo();

  const load = () => {
    fetch("/api/v1/today").then((r) => { if (!r.ok) throw new Error(); return r.json(); }).then(setData).catch(() => setErr("Non autorizzato: accedi per vedere i dati reali."));
  };

  useEffect(() => {
    fetch("/api/v1/auth/me").then((r) => r.json()).then((j) => setMe(j.user)).catch(() => {});
    load();
  }, []);
  useAggiornamenti(load, ["prenotazioni"]);

  const api = async (url: string, method: string, body?: any) => {
    setMsg("");
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErr(j.error ?? "Errore"); return null; }
    setErr(""); load();
    segnalaCambiamento("prenotazioni");
    return j;
  };

  const checkin = async (p: Partenza) => {
    const v = await modulo.apri(`Check-in · ${p.cliente}`, [
      { nome: "note", etichetta: "Note del check-in", tipo: "textarea", placeholder: "Dotazioni, stato generale…" },
    ], { confermaLabel: "Registra check-in" });
    if (!v) return;
    const r = await api(`/api/v1/bookings/${p.id}/checkin`, "POST", {
      note: v.note || null,
    });
    if (r) setMsg(`Check-in registrato per ${p.cliente}.`);
  };

  const checkout = async (p: Partenza) => {
    const v = await modulo.apri(`Check-out · ${p.cliente}`, [
      { nome: "danni", etichetta: "Importo danni in euro", placeholder: "Vuoto = nessun danno" },
      { nome: "note", etichetta: "Note del rientro", tipo: "textarea" },
    ], { confermaLabel: "Registra check-out" });
    if (!v) return;
    const r = await api(`/api/v1/bookings/${p.id}/checkout`, "POST", {
      danniEuro: v.danni.trim() || null,
      note: v.note || null,
    });
    if (r) setMsg(`Check-out registrato per ${p.cliente}.${v.danni.trim() ? " Danni registrati: se la cauzione è autorizzata puoi addebitarla da Pagamenti." : ""}`);
  };

  const contratto = async (p: Partenza) => {
    const r = await api(`/api/v1/bookings/${p.id}/contratto`, "POST");
    if (r?.url) {
      setLink(r.url);
      await copiaTesto(r.url);
      setMsg("Link del contratto copiato: invialo al cliente (WhatsApp o email).");
    }
  };

  const promemoriaOggi = async () => {
    const r = await api("/api/v1/promemoria/invia", "POST", { data: giornoOggi() });
    if (r) setMsg(`Promemoria: ${r.inviati} inviati, ${r.senzaEmail} senza email, ${r.falliti} non inviati.`);
  };

  const dataOggi = etichettaGiorno(giornoOggi(), { weekday: "long", day: "numeric", month: "long" });

  const kpi: { nome: string; valore?: number; icona: NomeIcona; colore: string; nota?: string }[] = [
    { nome: "Uscite oggi", valore: data?.uscite, icona: "barca", colore: "text-ocean" },
    { nome: "Rientri oggi", valore: data?.rientri, icona: "ancora", colore: "text-ok" },
    { nome: "Barche bloccate", valore: data?.barcheBloccate, icona: "pausa", colore: "text-warn" },
    { nome: "Da attenzionare", valore: data?.attenzioni, icona: "avviso", colore: "text-danger", nota: "Manutenzioni e blocchi" },
  ];

  return (
    <div className="grid gap-5">
      <div className="rounded-3xl bg-gradient-to-br from-ocean to-sea px-6 py-6 text-white shadow-[0_18px_40px_-18px_rgba(194,65,12,0.75)]">
        <p className="text-xs font-semibold uppercase tracking-widest text-white/75">{dataOggi}</p>
        <h1 className="mt-1 text-3xl">Buongiorno{me?.nome ? `, ${me.nome}` : ""}.</h1>
        <p className="mt-1 text-sm text-white/85">{me?.tenantNome ? me.tenantNome : "La tua giornata è sotto controllo."}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button className="flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-sm font-bold backdrop-blur hover:bg-white/25" onClick={promemoriaOggi}>
            <Icona nome="mail" className="h-4 w-4" /> Promemoria di oggi
          </button>
          <a href="/gestionale/calendario" className="flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-bold text-ocean hover:brightness-105">
            <Icona nome="piu" className="h-4 w-4" /> Nuova prenotazione
          </a>
        </div>
      </div>

      {me?.tenantStatus === "pending" && (
        <Avviso tono="attenzione">Account in attesa di approvazione NaBoat. L&apos;operatività si sblocca all&apos;attivazione.</Avviso>
      )}
      {err && me?.role === "superadmin" ? (
        <div className="card p-4 text-sm">
          <b>Sei collegato come NaBoat.</b> Questa pagina mostra la giornata di una singola azienda: dal pannello scegli l&apos;azienda e i suoi dati reali.
          <a className="ml-1 font-bold text-ocean" href="/admin">Vai ad Aziende →</a>
        </div>
      ) : (
        err && <Avviso tono="errore">{err}</Avviso>
      )}
      {msg && <Avviso tono="ok">{msg}</Avviso>}
      {link && <p className="card break-all p-3 text-xs text-muted">Contratto: {link}</p>}

      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
        {kpi.map((k) => (
          <div key={k.nome} className="card p-5">
            <div className="flex items-center justify-between">
              <small className="text-xs font-semibold uppercase tracking-wide text-muted">{k.nome}</small>
              <Icona nome={k.icona} className={"h-5 w-5 " + k.colore} />
            </div>
            <div className="mt-2 font-display text-4xl">{k.valore ?? "–"}</div>
            {k.nota && <em className="text-xs not-italic text-muted">{k.nota}</em>}
          </div>
        ))}
      </div>

      <div className="grid gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl">Prossime partenze</h2>
          <a href="/gestionale/calendario" className="text-sm font-bold text-ocean">Vedi calendario →</a>
        </div>

        {(data?.partenze ?? []).map((p) => (
          <div key={p.id} className="card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-foam font-display text-lg font-bold text-ocean">{p.ora}</span>
                <div>
                  <p className="text-lg font-extrabold">{p.barca}</p>
                  <p className="text-sm text-muted">{p.cliente}{p.dest ? ` · ${p.dest}` : ""}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={p.stato === "In mare" ? "badge-pending" : "badge-ready"}>{p.stato}</span>
                {p.prezzoCent != null && <span className="chip font-bold">{euro(p.prezzoCent)}</span>}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className={p.contrattoFirmato ? "chip border-ok-line bg-ok-soft text-ok" : "chip text-muted"}>{p.contrattoFirmato ? "contratto firmato" : "contratto da firmare"}</span>
              <span className={p.checkinFatto ? "chip border-ok-line bg-ok-soft text-ok" : "chip text-muted"}>{p.checkinFatto ? "check-in fatto" : "check-in da fare"}</span>
              <span className={p.checkoutFatto ? "chip border-ok-line bg-ok-soft text-ok" : "chip text-muted"}>{p.checkoutFatto ? "check-out fatto" : "check-out da fare"}</span>
              {p.cauzioneStato !== "non_richiesta" && <span className="badge-block">cauzione: {p.cauzioneStato.replace("_", " ")}</span>}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className="btn-soft" onClick={() => contratto(p)}>Contratto link</button>
              {!p.checkinFatto && <button className="btn-primary" onClick={() => checkin(p)}>Check-in</button>}
              {p.checkinFatto && !p.checkoutFatto && <button className="btn-primary" onClick={() => checkout(p)}>Check-out</button>}
              {p.telefono && <a className="btn-soft" href={`tel:${p.telefono}`}>Chiama {p.telefono}</a>}
            </div>
          </div>
        ))}

        {data && data.partenze.length === 0 && (
          <StatoVuoto
            icona="barca"
            titolo="Nessuna uscita oggi"
            testo={<>Aggiungi le barche in <b>Flotta</b> e crea una prenotazione dal Calendario per iniziare.</>}
            azione={{ label: "Nuova prenotazione", href: "/gestionale/calendario" }}
            secondaria={{ label: "Vai a Flotta", href: "/gestionale/flotta" }}
          />
        )}
      </div>
      {modulo.dialogo}
    </div>
  );
}
