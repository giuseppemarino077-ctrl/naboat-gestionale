"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { Icona } from "@/components/ui/Icona";
import { attivitaInRitardo, puoCambiareStato, STATI_ATTIVITA, type AttivitaOperativa, type OrdineAttivita, type StatoAttivita } from "@/modules/ormeggio/attivita";
import { SceltaPriorita, StellePriorita } from "@/modules/ormeggio/components/PrioritaAttivita";

type Props = {
  attivita: AttivitaOperativa[];
  oggi: string;
  ordine: OrdineAttivita;
  busy: string | null;
  puoModificare: boolean;
  vedeImporti: boolean;
  vuoto: string;
  onCambia: (attivita: AttivitaOperativa, stato: StatoAttivita) => void;
  onPriorita: (attivita: AttivitaOperativa, priorita: number) => void;
  onNote: (attivita: AttivitaOperativa, note: string | null) => Promise<boolean>;
};

function href(a: AttivitaOperativa) {
  return `/gestionale/ormeggio/permanenza/${a.permanenzaId}?tab=attivita`;
}

function DataAttivita({ attivita: a, oggi }: { attivita: AttivitaOperativa; oggi: string }) {
  return <span className={attivitaInRitardo(a, oggi) ? "font-semibold text-coral" : ""}>
    {a.dataPrevista ? new Date(a.dataPrevista).toLocaleDateString("it-IT") : "Da programmare"}
  </span>;
}

function NoteAttivita({ attivita: a, busy, onNote }: Pick<Props, "busy" | "onNote"> & { attivita: AttivitaOperativa }) {
  const [bozza, setBozza] = useState<string | null>(null);
  const revisioneBozza = useRef(a.revisione);
  const note = bozza ?? a.note ?? "";
  const modificate = note.trim() !== (a.note ?? "");
  return <form className="grid min-w-0 gap-1.5" onDragStart={(e) => e.stopPropagation()} onSubmit={async (e) => {
    e.preventDefault();
    if (modificate && await onNote({ ...a, revisione: revisioneBozza.current }, note.trim() || null)) setBozza(null);
  }}>
    <label className="grid min-w-0 gap-1">
      <span className="font-semibold text-muted">Note</span>
      <textarea aria-label={`Note di ${a.tipo}`} className="campo min-h-0 resize-y !p-2 !text-xs !leading-snug" rows={2} maxLength={1000} value={note} disabled={!!busy} draggable={false} placeholder="Aggiungi indicazioni per questa attività…" onChange={(e) => { if (bozza === null) revisioneBozza.current = a.revisione; setBozza(e.target.value); }} />
    </label>
    <div className="flex flex-wrap gap-2">
      <button type="submit" className="rounded-lg bg-ocean px-2 py-1 font-semibold text-white disabled:opacity-50" disabled={!!busy || !modificate}>Salva note</button>
      {modificate && <button type="button" className="rounded-lg px-2 py-1 text-muted hover:bg-foam disabled:opacity-50" disabled={!!busy} onClick={() => setBozza(null)}>Annulla</button>}
    </div>
  </form>;
}

function StatoAttivitaSelect({ attivita: a, busy, puoModificare, vedeImporti, onCambia }: Pick<Props, "busy" | "puoModificare" | "vedeImporti" | "onCambia"> & { attivita: AttivitaOperativa }) {
  return <select aria-label={`Stato di ${a.tipo}`} title={a.addebito?.stato === "pagato" || a.addebito?.pagamentoPresente ? "Voce collegata a incassi: conserva lo storico e registra una rettifica separata." : "Cambia stato"} value={a.stato} disabled={!!busy || !puoModificare} onChange={(e) => onCambia(a, e.target.value as StatoAttivita)} className="h-5 max-w-[110px] rounded-md border border-ocean/25 bg-white px-1 text-xs font-semibold leading-none text-ocean">
    {STATI_ATTIVITA.map((s) => <option key={s.valore} value={s.valore} disabled={s.valore !== a.stato && !puoCambiareStato(a, s.valore, vedeImporti)}>{s.nome}</option>)}
  </select>;
}

function GruppoAttivita({ chiave, ordine, oggi }: { chiave: string; ordine: OrdineAttivita; oggi: string }) {
  if (ordine === "priorita") return <><span className="block text-lg leading-tight text-gold" aria-label={`Priorità: ${chiave} su 3`}>{"★".repeat(Number(chiave))}</span><span className="text-xs font-bold text-deep">{["Bassa", "Normale", "Alta"][Number(chiave) - 1]}</span></>;
  if (!chiave) return <span className="break-words text-xs font-bold text-deep">Da programmare</span>;
  const giorno = new Date(`${chiave}T12:00:00`);
  return <time dateTime={chiave} className="grid gap-0.5"><span className="text-2xl font-bold leading-none text-ocean">{giorno.getDate()}</span><span className="text-xs font-bold uppercase text-deep">{giorno.toLocaleDateString("it-IT", { month: "short", year: "numeric" })}</span><span className="text-xs font-medium capitalize text-deep">{chiave === oggi ? "Oggi" : giorno.toLocaleDateString("it-IT", { weekday: "long" })}</span></time>;
}

export function ElencoAttivita(props: Props) {
  const gruppi = new Map<string, AttivitaOperativa[]>();
  for (const a of props.attivita) {
    const chiave = props.ordine === "giorno" ? a.dataPrevista?.slice(0, 10) ?? "" : String(a.priorita);
    const gruppo = gruppi.get(chiave) ?? [];
    gruppo.push(a);
    gruppi.set(chiave, gruppo);
  }
  return <div className="grid min-w-0 grid-cols-[64px_minmax(0,1fr)] items-start gap-x-2 gap-y-2 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-x-3" aria-label="Lista attività">
    {[...gruppi].flatMap(([chiave, lavori], indice) => [
      ...(props.ordine === "giorno" && indice > 0 ? [<div key={`separatore-${chiave}`} aria-hidden="true" className="col-span-2 flex h-4 items-center" data-separatore-giorno><div className="w-full border-t border-dashed border-ocean/20" /></div>] : []),
      <div key={`gruppo-${chiave}`} data-gruppo-attivita={chiave} data-giorno={props.ordine === "giorno" ? chiave : undefined} className="col-start-1 self-stretch border-r border-ocean/20 pr-2" style={{ gridRow: `span ${lavori.length}` }}>
        <h2 id={`gruppo-attivita-${chiave || "senza-data"}`} className="sticky top-4 grid gap-1 py-2"><GruppoAttivita chiave={chiave} ordine={props.ordine} oggi={props.oggi} /></h2>
      </div>,
      ...lavori.map((a) => <details key={a.id} data-attivita-id={a.id} aria-busy={props.busy === a.id} aria-describedby={`gruppo-attivita-${chiave || "senza-data"}`} className="card col-start-2 min-w-0 px-3 py-2" data-dettagli-attivita>
        <summary className="grid cursor-pointer list-none gap-1 !text-[13px] !font-medium !text-deep [&::-webkit-details-marker]:hidden">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1"><h3 className="min-w-0 flex-1 break-words text-sm font-bold leading-tight">{a.tipo}</h3><StellePriorita valore={a.priorita} /><span className={`${STATI_ATTIVITA.find((s) => s.valore === a.stato)?.badge} !text-xs`}>{STATI_ATTIVITA.find((s) => s.valore === a.stato)?.nome}</span></div>
          <div className="flex min-w-0 flex-wrap items-center gap-x-2"><span className="break-words font-bold text-ocean">{a.permanenza.boat.nome}</span><span className="break-words">{a.permanenza.boat.proprietario?.nome ?? "Cliente non indicato"}</span><span className="font-bold">{a.permanenza.posto?.codice ?? "Senza posto"}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-x-2 text-xs"><span className="break-words">Addetto: {a.addetto?.nome ?? "Non assegnata"}</span><span className="font-semibold"><DataAttivita attivita={a} oggi={props.oggi} /></span><span className="font-bold text-ocean">Note e priorità ▾</span></div>
        </summary>
        <div className="mt-2 grid gap-2 border-t border-line pt-2 text-sm">
          {props.puoModificare ? <NoteAttivita attivita={a} busy={props.busy} onNote={props.onNote} /> : <p className="whitespace-pre-wrap break-words text-deep">{a.note || "Nessuna nota per questa attività."}</p>}
          {props.puoModificare && <SceltaPriorita valore={a.priorita} onChange={(v) => props.onPriorita(a, v)} disabled={!!props.busy} />}
          <div className="flex flex-wrap items-center justify-between gap-2"><StatoAttivitaSelect {...props} attivita={a} /><Link className="font-semibold text-ocean hover:underline" href={href(a)}>Scheda barca →</Link></div>
          {!props.vedeImporti && a.daAddebitare && <p className="text-xs text-muted">Completamento con addebito: personale autorizzato</p>}
        </div>
      </details>),
    ])}
    {!props.attivita.length && <p role="status" className="card col-span-2 p-4 text-sm text-muted">{props.vuoto}</p>}
  </div>;
}

export function KanbanAttivita(props: Props) {
  const [trascinataId, setTrascinataId] = useState<string | null>(null);
  const trascinata = props.attivita.find((a) => a.id === trascinataId);
  const puoSpostare = (stato: StatoAttivita) => !!trascinata && !props.busy && props.puoModificare && puoCambiareStato(trascinata, stato, props.vedeImporti);

  return <div className="min-w-0" aria-label="Kanban attività">
    <p className="mb-2 text-xs text-muted">{props.puoModificare ? "Trascina le attività tra le colonne, anche per tornare indietro, oppure cambia lo stato sulla scheda." : "Consulta i lavori nelle tre colonne."}</p>
    {!props.attivita.length && <p role="status" className="mb-3 text-sm text-muted">{props.vuoto}</p>}
    <div className="grid auto-cols-[minmax(260px,1fr)] grid-flow-col gap-3 overflow-x-auto pb-2">
      {STATI_ATTIVITA.map((stato) => {
        const lavori = props.attivita.filter((a) => a.stato === stato.valore);
        const destinazione = puoSpostare(stato.valore);
        return <section key={stato.valore} data-stato-kanban={stato.valore} aria-labelledby={`kanban-${stato.valore}`} className={`min-w-0 rounded-2xl border border-t-4 ${stato.bordo} ${stato.fondo} p-3 transition-colors ${destinazione ? "border-ocean ring-1 ring-ocean/30" : "border-line"}`}
          onDragOver={(e) => { if (destinazione) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
          onDrop={(e) => {
            e.preventDefault();
            if (destinazione && trascinata && e.dataTransfer.getData("application/x-naboat-attivita") === trascinata.id) props.onCambia(trascinata, stato.valore);
            setTrascinataId(null);
          }}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 id={`kanban-${stato.valore}`} className="font-semibold text-deep">{stato.nome}</h2>
            <span aria-label={`${lavori.length} attività`} className={stato.badge}>{lavori.length}</span>
          </div>
          <div className="grid min-h-48 content-start gap-3">
            {lavori.map((a) => <article key={a.id} data-attivita-id={a.id} aria-busy={props.busy === a.id} aria-label={`${a.tipo} · ${a.permanenza.boat.nome}`} className={`card grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] gap-x-2 gap-y-0.5 px-2 py-1 text-[13px] leading-4 ${trascinataId === a.id ? "opacity-50" : ""}`}
              draggable={props.puoModificare && !props.busy && STATI_ATTIVITA.some((s) => puoCambiareStato(a, s.valore, props.vedeImporti))}
              onDragStart={(e) => { e.dataTransfer.setData("application/x-naboat-attivita", a.id); e.dataTransfer.effectAllowed = "move"; setTrascinataId(a.id); }}
              onDragEnd={() => setTrascinataId(null)}>
              <div className="col-span-2 flex min-w-0 items-start justify-between gap-1"><h3 title={a.tipo} className="min-w-0 line-clamp-2 break-words text-base font-bold leading-[18px] text-deep">{a.tipo}</h3><StellePriorita valore={a.priorita} /></div>
              <div className="flex min-w-0 items-center gap-1"><Link title={a.permanenza.boat.nome} className="min-w-0 truncate text-sm font-bold leading-[18px] text-ocean hover:underline" href={href(a)}>{a.permanenza.boat.nome}</Link><span className="shrink-0 rounded bg-foam px-1 font-bold text-deep">{a.permanenza.posto?.codice ?? "Senza posto"}</span></div>
              <div className="flex min-w-0 items-center"><StatoAttivitaSelect {...props} attivita={a} /></div>
              <span title={a.permanenza.boat.proprietario?.nome ?? "Cliente non indicato"} className="min-w-0 truncate font-medium text-deep">{a.permanenza.boat.proprietario?.nome ?? "Cliente non indicato"}</span>
              <span title={`Addetto: ${a.addetto?.nome ?? "Non assegnata"}`} aria-label={`Addetto: ${a.addetto?.nome ?? "Non assegnata"}`} className="flex min-w-0 items-center gap-0.5 font-medium text-deep"><Icona nome="utente" className="h-3 w-3 shrink-0 text-ocean" /><span className="min-w-0 truncate">{a.addetto?.nome ?? "Non assegnata"}</span></span>
              <span className="min-w-0 font-semibold"><DataAttivita attivita={a} oggi={props.oggi} /></span>
              <details className="col-start-2 min-w-0 open:col-span-2 open:col-start-1" data-dettagli-attivita>
                <summary className="cursor-pointer !text-[13px] !leading-4 font-bold text-ocean">Note e priorità</summary>
                <div className="mt-2 grid gap-2 border-t border-line pt-2">
                  <p className="break-words font-semibold text-deep">{a.tipo}</p>
                  {props.puoModificare ? <NoteAttivita attivita={a} busy={props.busy} onNote={props.onNote} /> : <p className="whitespace-pre-wrap break-words text-muted">{a.note || "Nessuna nota per questa attività."}</p>}
                  {props.puoModificare && <SceltaPriorita valore={a.priorita} onChange={(v) => props.onPriorita(a, v)} disabled={!!props.busy} />}
                  <Link className="font-semibold text-ocean hover:underline" href={href(a)}>Scheda barca →</Link>
                </div>
              </details>
              {!props.vedeImporti && a.daAddebitare && <p className="col-span-2 text-xs font-medium leading-tight text-deep">Completamento con addebito: personale autorizzato</p>}
            </article>)}
            {!lavori.length && <p className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">Nessuna attività.</p>}
          </div>
        </section>;
      })}
    </div>
  </div>;
}
