"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { aData, aggiungiGiorni, fineGiorno, giornoDi, inizioGiorno, istante, oggi as oggiKeyFn, oreDi } from "@/lib/calendario";
import { useAggiornamenti, segnalaCambiamento } from "@/lib/aggiorna";
import {
  aspettoCella, cellaKey, fineGiornoEsclusiva, finestraGiorni,
  indicizza, primoElemento,
  type PlanningBlock, type PlanningBoat, type PlanningBooking, type PlanningItem, type PlanningOfferta,
} from "@/lib/planning";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";
import { useConferma } from "@/components/ui/Dialogo";
import CruscottoOggi from "@/components/calendario/CruscottoOggi";
import FormCellaNuova from "@/components/calendario/FormCellaNuova";
import SchedaPrenotazione from "@/components/calendario/SchedaPrenotazione";

const HORIZON = 45;

type Cal = {
  boats: PlanningBoat[];
  bookings: PlanningBooking[];
  blocks: PlanningBlock[];
  porti: { id: string; nome: string }[];
  offerte: PlanningOfferta[];
};

type Sel = { boatId: string; giorno: string } | null;

export default function PlanningCalendario({ start, onVai }: { start: string; onVai: (g: string) => void }) {
  const giorni = useMemo(() => finestraGiorni(start, HORIZON), [start]);
  const oggi = useMemo(() => oggiKeyFn(), []);
  const [dati, setDati] = useState<Cal | null>(null);
  const [datiOggi, setDatiOggi] = useState<Cal | null>(null);
  const [skippers, setSkippers] = useState<any[]>([]);
  const [me, setMe] = useState<any>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [fPorto, setFPorto] = useState("");
  const [fBarca, setFBarca] = useState("");
  const [fTipo, setFTipo] = useState<"tutti" | "prenotazioni" | "blocchi">("tutti");
  const [sel, setSel] = useState<Sel>(null);
  const [mobileGiorno, setMobileGiorno] = useState<string>(
    giorni.includes(oggi) ? oggi : giorni[0],
  );
  const [ricaricaTick, setRicaricaTick] = useState(0);
  const conferma = useConferma();
  const dialogRef = useRef<HTMLElement | null>(null);

  const from = inizioGiorno(start).toISOString();
  // L'API misura la finestra in giorni UTC: si passa l'inizio del giorno dopo l'ultimo.
  const fineApi = istante(aggiungiGiorni(giorni[giorni.length - 1], 1), "00:00").toISOString();

  const carica = useCallback(async () => {
    try {
      const r = await fetch(`/api/v1/calendar?from=${from}&to=${fineApi}`);
      if (!r.ok) { setErr("Non è stato possibile caricare il planning."); return; }
      const j = await r.json();
      if (j && Array.isArray(j.boats)) { setDati(j); setErr(""); }
      else setErr("Non è stato possibile caricare il planning.");
    } catch {
      setErr("Non è stato possibile caricare il planning.");
    }
  }, [from, fineApi]);

  // Il cruscotto riguarda sempre oggi: se oggi è fuori dalla finestra serve una seconda
  // richiesta, senza unire i due intervalli (limite dei 180 giorni dell'API).
  const caricaOggi = useCallback(async () => {
    if (giorni.includes(oggi)) { setDatiOggi(null); return; }
    try {
      const r = await fetch(`/api/v1/calendar?from=${inizioGiorno(oggi).toISOString()}&to=${fineGiorno(oggi).toISOString()}`);
      if (r.ok) setDatiOggi(await r.json());
    } catch { /* il cruscotto mostra un avviso, non blocca il planning */ }
  }, [giorni, oggi]);

  useEffect(() => { carica(); }, [carica, ricaricaTick]);
  useEffect(() => { caricaOggi(); }, [caricaOggi, ricaricaTick]);
  useEffect(() => {
    fetch("/api/v1/skippers").then((r) => (r.ok ? r.json() : [])).then((j) => Array.isArray(j) && setSkippers(j)).catch(() => {});
    fetch("/api/v1/auth/me").then((r) => (r.ok ? r.json() : null)).then((j) => setMe(j?.user ?? null)).catch(() => {});
  }, []);

  // Allineamento con le altre viste (prenotazioni, Oggi): non si sovrascrive una
  // cella aperta mentre c'è una bozza in corso.
  useAggiornamenti(() => { if (sel) return; setRicaricaTick((n) => n + 1); }, ["prenotazioni"]);

  // Il giorno selezionato del mobile resta coerente quando cambia la finestra.
  useEffect(() => {
    if (!giorni.includes(mobileGiorno)) setMobileGiorno(giorni.includes(oggi) ? oggi : giorni[0]);
  }, [giorni, mobileGiorno, oggi]);

  if (!dati) {
    return err ? <Avviso tono="errore">{err}</Avviso> : <Caricamento testo="Carico il planning…" />;
  }

  const barche = dati.boats.filter((b) => (!fPorto || b.portoId === fPorto) && (!fBarca || b.id === fBarca));
  const items: PlanningItem[] = [
    ...(fTipo !== "blocchi" ? dati.bookings.map((b) => ({ ...b, kind: "BOOKING" as const })) : []),
    ...(fTipo !== "prenotazioni" ? dati.blocks.map((b) => ({ ...b, kind: "BLOCK" as const })) : []),
  ];
  const indice = indicizza(items, giorni);
  const barcaDi = (id: string) => dati.boats.find((b) => b.id === id);

  const itemsCruscotto: PlanningItem[] = datiOggi
    ? [
        ...datiOggi.bookings.map((b) => ({ ...b, kind: "BOOKING" as const })),
        ...datiOggi.blocks.map((b) => ({ ...b, kind: "BLOCK" as const })),
      ]
    : items;
  const barcheCruscotto = datiOggi ? datiOggi.boats : dati.boats;

  const apriCella = (boatId: string, giorno: string) => { setErr(""); setMsg(""); setSel({ boatId, giorno }); };

  const dopoAzione = async (esito: string) => {
    setMsg(esito);
    setRicaricaTick((n) => n + 1);
    segnalaCambiamento("prenotazioni");
    return true;
  };

  const chiama = async (metodo: string, url: string, body?: any): Promise<{ ok: boolean; j: any }> => {
    setBusy(true); setErr("");
    try {
      const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(j.error ?? "Operazione non riuscita."); return { ok: false, j }; }
      await dopoAzione("");
      return { ok: true, j };
    } finally {
      setBusy(false);
    }
  };

  const selBoat = sel ? barcaDi(sel.boatId) : null;
  const selItems = sel ? indice.get(cellaKey(sel.boatId, sel.giorno)) ?? [] : [];
  const selAttiva = selBoat?.stato === "disponibile";
  const nessunaBarca = dati.boats.length === 0;
  const filtroVuoto = !nessunaBarca && barche.length === 0;

  // Celle mobile: conteggi del giorno selezionato.
  const celleMobile = barche.map((b) => ({ boat: b, items: indice.get(cellaKey(b.id, mobileGiorno)) ?? [] }));
  const mobilePrenotate = celleMobile.filter(({ items }) => items.some((i) => i.kind === "BOOKING")).length;
  const mobileBloccate = celleMobile.filter(({ items }) => items.length > 0 && items.every((i) => i.kind === "BLOCK")).length;
  const mobileLibere = celleMobile.filter(({ boat, items }) => boat.stato === "disponibile" && items.length === 0).length;

  return (
    <div className="grid gap-4">
      {err && <Avviso tono="errore">{err}</Avviso>}
      {msg && <Avviso tono="ok">{msg}</Avviso>}

      <CruscottoOggi
        items={itemsCruscotto}
        boats={barcheCruscotto}
        oggi={oggi}
        azienda={me?.tenantNome ?? ""}
        timezone="Europe/Rome"
        onApriCella={(boatId) => {
          if (giorni.includes(oggi)) apriCella(boatId, oggi);
          else onVai(oggi);
        }}
      />

      {nessunaBarca ? (
        <div className="card grid place-items-center gap-2 p-10 text-center">
          <p className="font-display text-lg font-bold">La flotta è vuota</p>
          <p className="text-sm text-muted">Aggiungi una barca per attivare il planning.</p>
          <Link className="btn-primary mt-2" href="/gestionale/flotta/nuova">Aggiungi una barca</Link>
        </div>
      ) : (
        <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
          {/* Barra intervallo e legenda */}
          <div className="flex flex-col gap-2 border-b border-line bg-foam px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-3">
            <div>
              <p className="font-display font-bold capitalize">
                {aData(start).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })} –{" "}
                {aData(giorni[giorni.length - 1]).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}
              </p>
              <p className="mt-0.5 hidden text-xs text-muted sm:block">
                {barche.length} imbarcazioni {fPorto || fBarca || fTipo !== "tutti" ? "(filtro attivo)" : ""} · scorri orizzontalmente per esplorare tutti i giorni
              </p>
            </div>
            <div className="hidden flex-wrap gap-3 text-[11px] font-semibold sm:flex">
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-ok-soft ring-1 ring-ok-line" /> Prenotata</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-ok ring-1 ring-[#0f5a50]" /> In mare</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-[#e6efee] ring-1 ring-[#c2d2d0]" /> Rientrata</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded bg-danger-soft ring-1 ring-danger-line" /> Blocco</span>
              <span className="inline-flex items-center gap-1.5"><i className="h-3 w-3 rounded border border-line bg-white" /> Libera</span>
            </div>
            <details className="group sm:hidden">
              <summary className="cursor-pointer list-none text-[10px] font-semibold text-ocean">Legenda colori</summary>
              <div className="mt-2 flex flex-wrap gap-2 text-[9px] font-semibold">
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-ok-soft ring-1 ring-ok-line" /> Prenotata</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-ok" /> In mare</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-[#e6efee]" /> Rientrata</span>
                <span className="inline-flex items-center gap-1"><i className="h-2.5 w-2.5 rounded bg-danger-soft ring-1 ring-danger-line" /> Blocco</span>
              </div>
            </details>
          </div>

          {/* Filtri NaBoat, in posizione secondaria */}
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-white px-3 py-2 text-sm sm:px-5">
            {dati.porti.length > 0 && (
              <select className="rounded-full border border-line bg-white px-3 py-1.5" aria-label="Filtra per porto" value={fPorto} onChange={(e) => { setFPorto(e.target.value); setFBarca(""); }}>
                <option value="">Tutti i porti</option>
                {dati.porti.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            )}
            <select className="rounded-full border border-line bg-white px-3 py-1.5" aria-label="Filtra per barca" value={fBarca} onChange={(e) => setFBarca(e.target.value)}>
              <option value="">Tutte le barche</option>
              {dati.boats.filter((b) => !fPorto || b.portoId === fPorto).map((b) => <option key={b.id} value={b.id}>{b.nome}</option>)}
            </select>
            <select className="rounded-full border border-line bg-white px-3 py-1.5" aria-label="Filtra per tipo" value={fTipo} onChange={(e) => setFTipo(e.target.value as any)}>
              <option value="tutti">Tutti gli eventi</option>
              <option value="prenotazioni">Solo prenotazioni</option>
              <option value="blocchi">Solo blocchi</option>
            </select>
          </div>

          {filtroVuoto && (
            <div className="p-8 text-center">
              <p className="font-semibold">Nessun risultato con i filtri attuali.</p>
              <button className="btn-soft mt-2" onClick={() => { setFPorto(""); setFBarca(""); setFTipo("tutti"); }}>Azzera i filtri</button>
            </div>
          )}

          {/* Mobile */}
          {!filtroVuoto && (
            <div className="sm:hidden">
              <div className="border-b border-line bg-white px-3 pb-3 pt-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[9px] font-bold uppercase tracking-widest text-ocean">Scegli il giorno</p>
                    <h2 className="mt-0.5 text-sm font-semibold capitalize text-ink">
                      {aData(mobileGiorno).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })}
                    </h2>
                  </div>
                  {mobileGiorno === oggi && <span className="rounded-full bg-foam px-2.5 py-1 text-[10px] font-bold text-ocean">OGGI</span>}
                </div>
                <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-1">
                  {giorni.map((g) => {
                    const attivo = g === mobileGiorno;
                    const d = aData(g);
                    const weekend = [0, 6].includes(d.getDay());
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setMobileGiorno(g)}
                        aria-pressed={attivo}
                        className={"min-w-[58px] snap-start rounded-2xl border px-2 py-2 text-center transition " +
                          (attivo ? "border-ocean bg-ocean text-white shadow"
                            : weekend ? "border-[#f7d9c9] bg-foam text-ocean"
                            : "border-line bg-white text-ink")}
                      >
                        <span className="block text-[9px] font-bold uppercase">{d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</span>
                        <span className="mt-0.5 block text-lg font-semibold leading-none">{d.getDate()}</span>
                        <span className="mt-1 block text-[8px] font-bold uppercase opacity-80">{d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-ok-soft px-2 py-2 text-center"><span className="block text-lg font-semibold leading-none text-ok">{mobilePrenotate}</span><span className="mt-1 block text-[9px] font-bold uppercase text-ok">Prenotate</span></div>
                  <div className="rounded-xl bg-danger-soft px-2 py-2 text-center"><span className="block text-lg font-semibold leading-none text-danger">{mobileBloccate}</span><span className="mt-1 block text-[9px] font-bold uppercase text-danger">Bloccate</span></div>
                  <div className="rounded-xl bg-white px-2 py-2 text-center ring-1 ring-inset ring-line"><span className="block text-lg font-semibold leading-none text-ink">{mobileLibere}</span><span className="mt-1 block text-[9px] font-bold uppercase text-muted">Libere</span></div>
                </div>
              </div>
              <div className="space-y-2.5 p-3">
                {celleMobile.map(({ boat, items: cellItems }) => {
                  const attiva = boat.stato === "disponibile";
                  const app = aspettoCella(cellItems, attiva);
                  const first = primoElemento(cellItems);
                  const booking = cellItems.find((i) => i.kind === "BOOKING") as PlanningBooking | undefined;
                  const tone = booking
                    ? booking.stato === "in_mare" ? "border-[#0f5a50] bg-ok text-white"
                      : booking.stato === "rientrata" ? "border-[#c2d2d0] bg-[#e6efee] text-[#3f4a49]"
                      : "border-ok-line bg-ok-soft text-ink"
                    : cellItems.length > 0 ? "border-danger-line bg-danger-soft text-ink"
                    : attiva ? "border-line bg-white text-ink" : "border-line bg-[#efeaf0] text-muted";
                  return (
                    <button key={boat.id} type="button" onClick={() => apriCella(boat.id, mobileGiorno)} className={`w-full rounded-2xl border p-3.5 text-left shadow-sm ${tone}`}>
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block truncate text-base font-semibold">{boat.nome}</span>
                          <span className="mt-0.5 block truncate text-[10px] opacity-70">{dettaglioBarca(boat)}</span>
                        </span>
                        <span className="shrink-0 rounded-full bg-white/80 px-2.5 py-1 text-[9px] font-bold uppercase text-current shadow-sm">{app.label}</span>
                      </span>
                      {first ? (
                        <span className="mt-3 block rounded-xl bg-white/60 p-2.5 text-xs">
                          <span className="flex items-center justify-between gap-3">
                            <strong className="truncate">{first.kind === "BOOKING" ? first.clienteNome ?? "Cliente" : first.motivo || "Non disponibile"}</strong>
                            {first.kind === "BOOKING" && <span className="shrink-0 font-semibold">{oreDi(first.startAt)}–{oreDi(first.endAt)}</span>}
                          </span>
                          {cellItems.length > 1 && <span className="mt-1.5 block font-semibold">+ {cellItems.length - 1} altro elemento</span>}
                        </span>
                      ) : (
                        <span className="mt-3 flex items-center justify-between text-xs opacity-75">
                          <span>{attiva ? "Tocca per prenotare o bloccare" : "Barca non disponibile"}</span><span aria-hidden>›</span>
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Desktop */}
          {!filtroVuoto && (
            <div className="hidden max-h-[calc(100dvh-14rem)] overflow-auto overscroll-contain sm:block lg:max-h-[70vh]">
              <table className="min-w-max border-separate border-spacing-0 text-left">
                <thead>
                  <tr>
                    <th className="sticky left-0 top-0 z-40 w-44 min-w-44 border-b border-r border-line bg-deep px-3 py-3 text-[10px] font-bold uppercase tracking-wide text-white sm:w-56 sm:min-w-56 sm:px-4">
                      Imbarcazione
                    </th>
                    {giorni.map((g) => {
                      const d = aData(g);
                      const weekend = [0, 6].includes(d.getDay());
                      const isOggi = g === oggi;
                      return (
                        <th key={g} scope="col" className={"sticky top-0 z-30 w-[86px] min-w-[86px] border-b border-r border-line px-2 py-2 text-center " +
                          (isOggi ? "bg-ocean text-white" : weekend ? "bg-foam text-ocean" : "bg-white text-ink")}>
                          <span className="block text-[10px] font-bold uppercase tracking-wide">{d.toLocaleDateString("it-IT", { weekday: "short" }).replace(".", "")}</span>
                          <span className="mt-0.5 block text-lg font-semibold leading-none">{d.getDate()}</span>
                          <span className="mt-1 block text-[9px] font-semibold uppercase">{d.toLocaleDateString("it-IT", { month: "short" }).replace(".", "")}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {barche.map((boat) => {
                    const attiva = boat.stato === "disponibile";
                    return (
                      <tr key={boat.id}>
                        <th scope="row" className="sticky left-0 z-20 w-44 min-w-44 border-b border-r border-line bg-white px-3 py-2 text-left align-middle shadow-[5px_0_10px_-10px_rgba(51,36,28,.55)] sm:w-56 sm:min-w-56 sm:px-4 sm:py-3">
                          <Link href={`/gestionale/flotta/${boat.id}`} className="block rounded-lg transition hover:bg-foam">
                            <span className="block truncate text-xs font-semibold text-ink sm:text-sm">{boat.nome}</span>
                            <span className="mt-1 hidden truncate text-[10px] text-muted sm:block">{dettaglioBarca(boat)}</span>
                            <span className={"mt-1.5 inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold " + (attiva ? "bg-ok-soft text-ok" : "bg-[#efeaf0] text-muted")}>
                              {attiva ? "DISPONIBILE" : "NON DISPONIBILE"}
                            </span>
                          </Link>
                        </th>
                        {giorni.map((g) => {
                          const cellItems = indice.get(cellaKey(boat.id, g)) ?? [];
                          const app = aspettoCella(cellItems, attiva);
                          const first = primoElemento(cellItems);
                          const weekend = [0, 6].includes(aData(g).getDay());
                          return (
                            <td key={g} className={"h-[82px] w-[86px] min-w-[86px] border-b border-r border-line p-1 align-middle " + (weekend ? "bg-sand" : "bg-white")}>
                              <button
                                type="button"
                                onClick={() => apriCella(boat.id, g)}
                                aria-label={`${boat.nome}, ${g}: ${app.label}`}
                                className={`flex h-full min-h-[70px] w-full flex-col items-center justify-center rounded-xl px-1.5 py-2 text-center text-[10px] font-bold transition hover:brightness-[1.03] ${app.className}`}
                              >
                                <span>{app.label}</span>
                                {first ? (
                                  <>
                                    {first.kind === "BOOKING" && first.note ? <span className="mt-1 max-w-full truncate text-[9px] font-medium leading-3 opacity-80">{first.note}</span> : first.kind === "BOOKING" ? <span className="mt-1 max-w-full truncate text-[9px] font-semibold leading-3 opacity-90">{first.clienteNome ?? "Cliente"}</span> : null}
                                    {first.kind === "BOOKING" && !first.note && <span className="mt-1 max-w-full truncate text-[9px] font-medium opacity-80">{oreDi(first.startAt)}</span>}
                                    {first.kind === "BOOKING" && (first.skipper?.nome || first.skipperStato === "UNASSIGNED") && (
                                      <span className="mt-1 max-w-full truncate text-[8px] font-semibold leading-3 opacity-90">{first.skipper?.nome ? `⛵ ${first.skipper.nome}` : "⛵ Da assegnare"}</span>
                                    )}
                                  </>
                                ) : null}
                              </button>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Dialogo cella */}
      {sel && selBoat && (
        <div
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-5"
          role="presentation"
          onMouseDown={(e) => { if (e.currentTarget === e.target) setSel(null); }}
        >
          <section
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="cella-titolo"
            className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7"
          >
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-ocean">Planning flotta</p>
                <h2 id="cella-titolo" className="mt-2 font-display text-2xl font-semibold text-ink">{selBoat.nome}</h2>
                <p className="mt-1 text-sm capitalize text-muted">{aData(sel.giorno).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
              </div>
              <button type="button" onClick={() => setSel(null)} aria-label="Chiudi dettaglio" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand text-xl text-ink hover:bg-foam">×</button>
            </div>

            {err && <Avviso tono="errore" className="mt-4">{err}</Avviso>}
            {msg && <Avviso tono="ok" className="mt-4">{msg}</Avviso>}

            <div className="mt-6 space-y-4">
              {selItems.length === 0 ? (
                <>
                  <div className={"rounded-2xl border p-5 " + (selAttiva ? "border-ok-line bg-ok-soft" : "border-line bg-sand")}>
                    <p className={"font-semibold " + (selAttiva ? "text-ok" : "text-ink")}>{selAttiva ? "Barca libera per l'intera giornata" : "Barca non disponibile"}</p>
                    <p className="mt-1 text-sm text-muted">{selAttiva ? "Crea qui la prenotazione oppure rendi la barca non disponibile per questa giornata." : "Rendi disponibile la barca dalla Flotta prima di prenotarla."}</p>
                  </div>
                  {selAttiva && (
                    <FormCellaNuova
                      boat={selBoat}
                      giorno={sel.giorno}
                      offerte={dati.offerte.filter((o) => o.boatId === selBoat.id && o.attiva)}
                      porti={dati.porti}
                      skippers={skippers}
                      busy={busy}
                      oggi={oggi}
                      onCrea={async (payload) => { const esito = await chiama("POST", "/api/v1/bookings", payload); if (esito.ok) setSel(null); return esito.ok; }}
                      onBlocca={async (motivo) => {
                        const esito = await chiama("POST", "/api/v1/blocks", { boatId: selBoat.id, startAt: inizioGiorno(sel.giorno).toISOString(), endAt: fineGiorno(sel.giorno).toISOString(), motivo: motivo || undefined });
                        if (esito.ok) setSel(null);
                        return esito.ok;
                      }}
                    />
                  )}
                </>
              ) : (
                selItems.map((item) =>
                  item.kind === "BOOKING" ? (
                    <SchedaPrenotazione
                      key={item.id}
                      pren={item}
                      boat={selBoat}
                      giorno={sel.giorno}
                      oggi={oggi}
                      skippers={skippers}
                      porti={dati.porti}
                      offerte={dati.offerte.filter((o) => o.boatId === selBoat.id && o.attiva)}
                      azienda={me?.tenantNome ?? ""}
                      busy={busy}
                      puòImporti={me?.vedeImporti !== false}
                      puoGestire={me?.role !== "skipper"}
                      onAzione={chiama}
                      onRicarica={dopoAzione}
                    />
                  ) : (
                    <BloccoCella
                      key={item.id}
                      blocco={item}
                      giorno={sel.giorno}
                      busy={busy}
                      onRilascia={async (scope) => {
                        const url = scope === "giorno"
                          ? `/api/v1/blocks/${item.id}/giorno`
                          : `/api/v1/blocks/${item.id}`;
                        const esito = await chiama("POST", url, { giorno: sel.giorno });
                        if (esito.ok) setSel(null);
                        return esito.ok;
                      }}
                    />
                  ),
                )
              )}
            </div>

            <div className="mt-6 grid gap-3 border-t border-line pt-5 sm:grid-cols-2">
              <Link href={`/gestionale/flotta/${selBoat.id}`} className="inline-flex min-h-12 items-center justify-center rounded-xl border border-line px-4 text-sm font-semibold text-ink hover:bg-foam">Gestisci barca</Link>
              <button type="button" onClick={() => setSel(null)} className="min-h-12 rounded-xl bg-ink px-4 text-sm font-semibold text-white hover:bg-deep">Chiudi</button>
            </div>
          </section>
        </div>
      )}
      {conferma.dialogo}
    </div>
  );
}

function dettaglioBarca(b: PlanningBoat): string {
  const parti = [
    b.modello?.marca && b.modello?.modello ? `${b.modello.marca} ${b.modello.modello}` : b.modello?.modello,
    b.tipo,
    b.codiceInterno,
  ].filter(Boolean);
  return parti.join(" · ") || "Scheda tecnica da completare";
}

// Blocco della cella: libera l'intero periodo oppure il solo giorno (split).
function BloccoCella({
  blocco, giorno, busy, onRilascia,
}: {
  blocco: PlanningBlock;
  giorno: string;
  busy: boolean;
  onRilascia: (scope: "giorno" | "tutto") => Promise<boolean>;
}) {
  const multiday = giornoDi(blocco.startAt) !== giornoDi(blocco.endAt) ||
    new Date(blocco.startAt).getTime() < inizioGiorno(giorno).getTime() ||
    new Date(blocco.endAt).getTime() > fineGiornoEsclusiva(giorno).getTime();
  return (
    <article className="rounded-2xl border border-danger-line bg-danger-soft p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-muted">Indisponibilità</p>
      <h3 className="mt-1 font-semibold text-ink">Non disponibile</h3>
      <p className="mt-2 text-sm text-ink/80">
        {blocco.startAt ? new Date(blocco.startAt).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : ""} →{" "}
        {blocco.endAt ? new Date(blocco.endAt).toLocaleString("it-IT", { timeZone: "Europe/Rome", dateStyle: "short", timeStyle: "short" }) : ""}
      </p>
      {blocco.motivo && <p className="mt-2 rounded-xl bg-white/70 p-3 text-sm">{blocco.motivo}</p>}
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {multiday ? (
          <>
            <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-danger-line bg-white px-4 text-sm font-semibold text-danger hover:bg-danger-soft" onClick={() => onRilascia("giorno")}>Libera solo questo giorno</button>
            <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ocean hover:bg-foam" onClick={() => onRilascia("tutto")}>Rimuovi tutto il periodo</button>
          </>
        ) : (
          <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-line bg-white px-4 text-sm font-semibold text-ocean hover:bg-foam sm:col-span-2" onClick={() => onRilascia("tutto")}>Rendi di nuovo libera</button>
        )}
      </div>
    </article>
  );
}
