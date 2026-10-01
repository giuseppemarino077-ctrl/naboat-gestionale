"use client";
import { useMemo, useState } from "react";
import { aData, giornoDi, inizioGiorno } from "@/lib/calendario";
import { occupaGiorno, type PlanningBoat, type PlanningBlock, type PlanningBooking, type PlanningItem } from "@/lib/planning";
import { oreDi } from "@/lib/calendario";

type Evento = {
  id: string;
  itemId: string;
  boatId: string;
  at: string;
  kind: "DEPARTURE" | "RETURN" | "RETURNED" | "IN_USE" | "BLOCK";
};

type Gruppo = { id: string; at: string; events: Evento[] };

const ETICHETTE: Record<Evento["kind"], string> = {
  DEPARTURE: "Partenza da confermare",
  RETURN: "Rientro",
  RETURNED: "Rientrata",
  IN_USE: "In navigazione",
  BLOCK: "Non disponibile",
};

function oraLocale(iso: string, tz: string) {
  return new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: tz }).format(new Date(iso));
}

// Costruisce agenda, gruppi e avvisi del giorno reale (indipendenti dalla finestra mostrata).
function costruisci(items: PlanningItem[], oggi: string, tz: string) {
  const start = inizioGiorno(oggi).getTime();
  const end = start + 26 * 3600_000; // margine ampio: il giorno civile dura 23/25 ore
  const fineEsclusiva = new Date(inizioGiorno(oggi)).getTime();
  void fineEsclusiva;
  const delGiorno = items.filter((i) => occupaGiorno(i, oggi));
  const pren = delGiorno.filter((i) => i.kind === "BOOKING") as ({ kind: "BOOKING" } & PlanningBooking)[];
  const blk = delGiorno.filter((i) => i.kind === "BLOCK") as ({ kind: "BLOCK" } & PlanningBlock)[];

  const events: Evento[] = [];
  for (const b of pren) {
    const s = new Date(b.startAt).getTime();
    const e = new Date(b.endAt).getTime();
    const clamp = (v: number) => Math.min(Math.max(v, start), end);
    if (b.stato === "rientrata") {
      events.push({ id: `${b.id}:returned`, itemId: b.id, boatId: b.boatId, at: new Date(clamp(b.checkoutAt ? new Date(b.checkoutAt).getTime() : e)).toISOString(), kind: "RETURNED" });
      continue;
    }
    if (b.stato === "in_mare") {
      events.push({ id: `${b.id}:in-use`, itemId: b.id, boatId: b.boatId, at: new Date(clamp(s)).toISOString(), kind: "IN_USE" });
    } else if (s >= start && s < end) {
      events.push({ id: `${b.id}:departure`, itemId: b.id, boatId: b.boatId, at: b.startAt, kind: "DEPARTURE" });
    }
    if (e > start && e < end) events.push({ id: `${b.id}:return`, itemId: b.id, boatId: b.boatId, at: b.endAt, kind: "RETURN" });
    if (b.stato !== "in_mare" && !(s >= start && s < end) && !(e > start && e < end)) {
      events.push({ id: `${b.id}:in-use2`, itemId: b.id, boatId: b.boatId, at: new Date(clamp(s)).toISOString(), kind: "IN_USE" });
    }
  }
  for (const b of blk) {
    const s = new Date(b.startAt).getTime();
    events.push({ id: `${b.id}:block`, itemId: b.id, boatId: b.boatId, at: new Date(Math.max(s, start)).toISOString(), kind: "BLOCK" });
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  const perOra = new Map<string, Evento[]>();
  for (const ev of events) { const k = ev.at; const cur = perOra.get(k); if (cur) cur.push(ev); else perOra.set(k, [ev]); }
  const groups: Gruppo[] = [...perOra.entries()]
    .sort(([a], [b]) => new Date(a).getTime() - new Date(b).getTime())
    .map(([at, evs]) => ({ id: at, at, events: evs }));

  const avvisi: { id: string; boatId: string; tone: "attention" | "danger"; title: string; detail: string }[] = [];
  for (const b of pren) {
    const boat = b.boat;
    if (!b.telefono && !b.email) avvisi.push({ id: `${b.id}:phone`, boatId: b.boatId, tone: "attention", title: "Telefono non inserito", detail: `${b.clienteNome ?? "Cliente"} · ${boat?.nome ?? "Imbarcazione"}` });
    if (b.skipperStato === "UNASSIGNED") avvisi.push({ id: `${b.id}:skipper`, boatId: b.boatId, tone: "attention", title: "Skipper da assegnare", detail: `${b.clienteNome ?? "Cliente"} · ${boat?.nome ?? "Imbarcazione"}` });
  }
  for (const boat of new Set(pren.map((b) => b.boatId))) {
    const ordinate = pren.filter((b) => b.boatId === boat).sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
    for (let i = 1; i < ordinate.length; i++) {
      const min = Math.round((new Date(ordinate[i].startAt).getTime() - new Date(ordinate[i - 1].endAt).getTime()) / 60000);
      if (min < 60) avvisi.push({ id: `${ordinate[i - 1].id}:${ordinate[i].id}:turnaround`, boatId: boat, tone: min < 0 ? "danger" : "attention", title: min < 0 ? "Orari sovrapposti" : "Rientro e partenza ravvicinati", detail: `${min < 0 ? 0 : min} min di intervallo` });
    }
    if (pren.some((b) => b.boatId === boat) && blk.some((b) => b.boatId === boat)) {
      avvisi.push({ id: `${boat}:booking-block`, boatId: boat, tone: "danger", title: "Prenotazione e blocco nello stesso giorno", detail: "Richiede un controllo" });
    }
  }
  void tz;

  return {
    pren,
    blk,
    groups,
    avvisi,
    clienti: new Set(pren.map((b) => b.customerId ?? b.id)).size,
    senzaTelefono: pren.filter((b) => !b.telefono).length,
    barcheBloccate: new Set(blk.map((b) => b.boatId)).size,
  };
}

export default function CruscottoOggi({
  items, boats, oggi, azienda, timezone, onApriCella,
}: {
  items: PlanningItem[];
  boats: PlanningBoat[];
  oggi: string;
  azienda: string;
  timezone: string;
  onApriCella: (boatId: string) => void;
}) {
  const [pannello, setPannello] = useState<{ tipo: "metric"; key: string } | { tipo: "group"; id: string } | null>(null);
  const boatById = useMemo(() => new Map(boats.map((b) => [b.id, b])), [boats]);
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const vista = useMemo(() => costruisci(items, oggi, timezone), [items, oggi, timezone]);

  const prossimo = vista.groups.find((g) => g.events.some((ev) => {
    const it = itemById.get(ev.itemId);
    return (ev.kind === "DEPARTURE" && it?.kind === "BOOKING" && it.stato === "prenotata")
      || (ev.kind === "RETURN" && it?.kind === "BOOKING" && it.stato === "in_mare");
  }));

  const metriche = [
    { key: "BOOKINGS", label: "Prenotazioni", value: vista.pren.length },
    { key: "BLOCKS", label: "Barche bloccate", value: vista.barcheBloccate },
    { key: "CUSTOMERS", label: "Clienti", value: vista.clienti },
    { key: "MISSING", label: "Senza telefono", value: vista.senzaTelefono },
  ];

  return (
    <section className="overflow-hidden rounded-3xl border border-deep bg-gradient-to-br from-deep via-[#7c2d12] to-ink text-white">
      <div className="px-4 py-4 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#ffd9c2]">Cruscotto operativo · Oggi</p>
            <h2 className="truncate text-base font-semibold capitalize">{aData(oggi).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</h2>
          </div>
          <button
            type="button"
            disabled={!prossimo}
            onClick={() => prossimo && setPannello({ tipo: "group", id: prossimo.id })}
            className={"min-h-10 rounded-xl border border-white/25 bg-white/10 px-4 text-xs font-semibold hover:bg-white/20 " + (prossimo ? "" : "cursor-default opacity-45")}
          >
            {prossimo ? `Prossimo · ${oraLocale(prossimo.at, timezone)}` : "Nessuna operazione da confermare"}
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {metriche.map((m) => (
            <button key={m.key} type="button" onClick={() => setPannello({ tipo: "metric", key: m.key })} className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-left hover:bg-white/20">
              <span className="block truncate text-[9px] font-bold uppercase tracking-wide text-[#e7cfc2]">{m.label}</span>
              <span className="mt-0.5 block text-xl font-semibold leading-none">{m.value}</span>
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 lg:grid-cols-2">
          <div className="rounded-xl border border-white/15 bg-white/5 p-2">
            <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#e7cfc2]">Agenda</p>
            {vista.groups.length ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {vista.groups.map((g) => (
                  <button key={g.id} type="button" onClick={() => setPannello({ tipo: "group", id: g.id })} className="min-w-[220px] rounded-xl border border-white/15 bg-white/10 p-2.5 text-left hover:bg-white/20">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-[10px] font-bold uppercase tracking-wide text-[#ffd9c2]">{g.events.map((e) => ETICHETTE[e.kind]).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}</span>
                      <span className="text-xs font-semibold">{oraLocale(g.at, timezone)}</span>
                    </span>
                    <span className="mt-1 block truncate text-xs text-white/80">
                      {g.events.map((e) => {
                        const it = itemById.get(e.itemId);
                        const b = boatById.get(e.boatId);
                        return `${b?.nome ?? "Imbarcazione"}${it?.kind === "BOOKING" ? ` · ${it.clienteNome ?? "Cliente"}` : ""}`;
                      }).join("  •  ")}
                    </span>
                  </button>
                ))}
              </div>
            ) : <p className="px-1 py-2 text-xs text-white/75">Nessun movimento programmato: la giornata è libera.</p>}
          </div>
          <div className="rounded-xl border border-white/15 bg-white/5 p-2">
            <p className="px-1 pb-1 text-[10px] font-bold uppercase tracking-wide text-[#e7cfc2]">Da controllare</p>
            {vista.avvisi.length ? (
              <div className="flex gap-2 overflow-x-auto pb-1">
                {vista.avvisi.map((a) => (
                  <button key={a.id} type="button" onClick={() => onApriCella(a.boatId)} className={"min-w-[200px] rounded-xl border p-2.5 text-left " + (a.tone === "danger" ? "border-white/20 bg-[#b0301c]/40 hover:bg-[#b0301c]/55" : "border-white/15 bg-white/10 hover:bg-white/20")}>
                    <span className="block truncate text-xs font-semibold">{a.title}</span>
                    <span className="mt-1 block truncate text-[10px] text-white/75">{a.detail}</span>
                  </button>
                ))}
              </div>
            ) : <p className="px-1 py-2 text-xs font-semibold text-emerald-200">✓ Nessuna criticità operativa</p>}
          </div>
        </div>
      </div>

      {pannello && (
        <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-5" role="presentation" onMouseDown={(e) => { if (e.currentTarget === e.target) setPannello(null); }}>
          <section role="dialog" aria-modal="true" aria-labelledby="cruscotto-titolo" className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 text-ink shadow-2xl sm:max-w-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-ocean">Cruscotto operativo · Oggi</p>
                <h2 id="cruscotto-titolo" className="mt-1 font-display text-2xl font-semibold">
                  {pannello.tipo === "group"
                    ? `Impegni delle ${oraLocale(vista.groups.find((g) => g.id === pannello.id)?.at ?? new Date().toISOString(), timezone)}`
                    : metriche.find((m) => m.key === pannello.key)?.label}
                </h2>
              </div>
              <button type="button" onClick={() => setPannello(null)} aria-label="Chiudi pannello" className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand text-xl hover:bg-foam">×</button>
            </div>

            <div className="mt-5 space-y-3">
              {pannello.tipo === "group" ? (
                (() => {
                  const g = vista.groups.find((x) => x.id === pannello.id);
                  if (!g || g.events.length === 0) return <div className="rounded-2xl border border-ok-line bg-ok-soft p-5 text-ok"><p className="font-semibold">Impegno completato.</p><p className="mt-1 text-sm">Non ci sono più operazioni da eseguire per questo orario.</p></div>;
                  return g.events.map((ev) => {
                    const it = itemById.get(ev.itemId);
                    const b = boatById.get(ev.boatId);
                    if (!it) return null;
                    return (
                      <article key={ev.id} className={"rounded-2xl border p-4 " + (ev.kind === "BLOCK" ? "border-danger-line bg-danger-soft" : ev.kind === "IN_USE" ? "border-info-line bg-info-soft" : ev.kind === "RETURNED" ? "border-line bg-sand" : "border-ok-line bg-ok-soft")}>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-muted">{ETICHETTE[ev.kind]}</p>
                            <h3 className="mt-1 text-lg font-semibold">{b?.nome ?? "Imbarcazione"}</h3>
                            <p className="mt-1 text-sm text-ink/80">{it.kind === "BOOKING" ? `${it.clienteNome ?? "Cliente"} · ${it.passeggeri} pax` : it.motivo || "Non disponibile"}</p>
                          </div>
                          <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold shadow-sm">{oraLocale(ev.at, timezone)}</span>
                        </div>
                        {it.kind === "BOOKING" && (
                          <dl className="mt-3 grid gap-2 rounded-xl bg-white/80 p-3 text-sm sm:grid-cols-3">
                            <div><dt className="text-xs text-muted">Contatto</dt><dd className="mt-0.5 font-medium">{it.telefono || it.email || "Nessun contatto inserito"}</dd></div>
                            <div><dt className="text-xs text-muted">Note</dt><dd className="mt-0.5 font-medium">{it.note || "Nessuna nota"}</dd></div>
                            <div><dt className="text-xs text-muted">Skipper</dt><dd className="mt-0.5 font-medium">{it.skipper?.nome ?? (it.skipperStato === "UNASSIGNED" ? "Da assegnare" : "Nessuno")}</dd></div>
                          </dl>
                        )}
                        <button type="button" onClick={() => { setPannello(null); onApriCella(ev.boatId); }} className="mt-3 min-h-11 w-full rounded-xl border border-line bg-white px-4 text-sm font-semibold hover:bg-foam">Apri tutti i dettagli</button>
                      </article>
                    );
                  });
                })()
              ) : (
                (() => {
                  const key = pannello.key;
                  const righe = key === "BLOCKS" ? vista.blk : key === "MISSING" ? vista.pren.filter((b) => !b.telefono) : vista.pren;
                  if (key === "CUSTOMERS") {
                    const unici = new Map<string, PlanningBooking>();
                    for (const b of vista.pren) if (!unici.has(b.customerId ?? b.id)) unici.set(b.customerId ?? b.id, b);
                    return [...unici.values()].length ? [...unici.values()].map((b) => rigaMetrica(b, boatById, timezone, (boatId) => { setPannello(null); onApriCella(boatId); })) : <Vuoto />;
                  }
                  return righe.length ? righe.map((b: any) => b.kind === "BLOCK"
                    ? <button key={b.id} type="button" onClick={() => { setPannello(null); onApriCella(b.boatId); }} className="w-full rounded-2xl border border-line bg-sand p-4 text-left hover:border-ocean">
                        <span className="block text-base font-semibold">{boatById.get(b.boatId)?.nome ?? "Imbarcazione"}</span>
                        <span className="mt-1 block text-sm text-muted">{b.motivo || "Nessun motivo indicato"}</span>
                      </button>
                    : rigaMetrica(b, boatById, timezone, (boatId) => { setPannello(null); onApriCella(boatId); })
                  ) : <Vuoto />;
                })()
              )}
            </div>
          </section>
        </div>
      )}
      {void azienda}
    </section>
  );
}

function rigaMetrica(b: PlanningBooking, boatById: Map<string, PlanningBoat>, tz: string, apri: (boatId: string) => void) {
  return (
    <button key={b.id} type="button" onClick={() => apri(b.boatId)} className="w-full rounded-2xl border border-line bg-sand p-4 text-left hover:border-ocean hover:bg-foam">
      <span className="flex flex-wrap items-start justify-between gap-3">
        <span>
          <span className="block text-base font-semibold">{b.clienteNome ?? "Cliente"}</span>
          <span className="mt-1 block text-sm text-muted">{oraLocale(b.startAt, tz)} · {boatById.get(b.boatId)?.nome ?? "Imbarcazione"} · {b.passeggeri} pax</span>
        </span>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-ocean shadow-sm">Apri →</span>
      </span>
      <span className="mt-3 grid gap-1 rounded-xl bg-white p-3 text-xs text-ink/80 sm:grid-cols-3">
        <span><strong>Contatto:</strong> {b.telefono || "non inserito"}</span>
        <span><strong>Note:</strong> {b.note || "nessuna nota"}</span>
        <span><strong>Skipper:</strong> {b.skipper?.nome ?? (b.skipperStato === "UNASSIGNED" ? "da assegnare" : "nessuno")}</span>
      </span>
    </button>
  );
}

function Vuoto() {
  return <div className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">Nessuna voce da mostrare.</div>;
}

void giornoDi;
