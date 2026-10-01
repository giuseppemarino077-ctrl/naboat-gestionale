// Tipi e regole condivise dal planning (calendario flotta) e dal cruscotto Oggi.
// Gli intervalli sono semiaperti [inizio, fine): un elemento appartiene al giorno
// se `inizio < fineGiornoEsclusiva && fine > inizioGiorno`. L'inizio del giorno
// successivo è il confine davvero esclusivo (non mezzanotte meno 1 ms).
import { aggiungiGiorni, giornoDi, inizioGiorno, istante } from "@/lib/calendario";
import type { Giorno } from "@/lib/calendario";

export type PlanningBoat = {
  id: string;
  nome: string;
  tipo: string | null;
  codiceInterno: string | null;
  patenteRichiesta: boolean;
  capienza: number | null;
  potenzaCv: number | null;
  uso: string;
  stato: string;
  portoId: string | null;
  porto: { nome: string } | null;
  modello: { marca: string | null; modello: string } | null;
};

export type PlanningSkipper = { id?: string; nome: string | null; telefono: string | null } | null;

export type PlanningBooking = {
  id: string;
  boatId: string;
  customerId: string | null;
  startAt: string;
  endAt: string;
  stato: string;
  versione: number;
  updatedAt: string;
  passeggeri: number;
  clienteNome: string | null;
  telefono: string | null;
  email: string | null;
  destinazione: string | null;
  formula: string | null;
  offertaId: string | null;
  portoId: string | null;
  skipperId: string | null;
  skipperStato: string | null;
  skipperNote: string | null;
  patenteOk: boolean;
  patenteRisposta: string | null;
  note: string | null;
  prezzoCent: number | null;
  origineCanale: string;
  contrattoFirmatoAt: string | null;
  cauzioneStato: string;
  checkinAt: string | null;
  checkoutAt: string | null;
  skipper: PlanningSkipper;
  boat?: { nome: string };
};

export type PlanningBlock = {
  id: string;
  boatId: string;
  startAt: string;
  endAt: string;
  motivo: string | null;
  versione: number;
  maintenanceId?: string | null;
  maintenance?: { id: string; titolo: string } | null;
  boat?: { nome: string };
};

export type PlanningOfferta = { id: string; boatId: string; codice: string; attiva: boolean };

export type PlanningItem =
  | ({ kind: "BOOKING" } & PlanningBooking)
  | ({ kind: "BLOCK" } & PlanningBlock);

// Insieme dei giorni civili (stringhe YYYY-MM-DD) della finestra.
export function finestraGiorni(start: Giorno, quanti: number): Giorno[] {
  const out: Giorno[] = [];
  let g = start;
  for (let i = 0; i < quanti; i++) {
    out.push(g);
    g = aggiungiGiorni(g, 1);
  }
  return out;
}

// Fine (esclusiva) del giorno civile: inizio del giorno successivo.
export function fineGiornoEsclusiva(g: Giorno): Date {
  return istante(aggiungiGiorni(g, 1), "00:00");
}

// Un elemento appartiene al giorno civile se gli intervalli si sovrappongono.
export function occupaGiorno(item: { startAt: string; endAt: string }, g: Giorno): boolean {
  const s = new Date(item.startAt).getTime();
  const e = new Date(item.endAt).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e)) return false;
  return s < fineGiornoEsclusiva(g).getTime() && e > inizioGiorno(g).getTime();
}

export function cellaKey(boatId: string, g: Giorno) {
  return `${boatId}:${g}`;
}

export type Aspetto = { label: string; className: string };

// Etichetta sintetica della cella, con la priorità del riferimento BOATLY.
export function aspettoCella(items: PlanningItem[], barcaAttiva: boolean): Aspetto {
  if (!barcaAttiva && items.length === 0) {
    return { label: "Non attiva", className: "bg-[#efeaf0] text-muted ring-1 ring-inset ring-line" };
  }
  const pren = items.filter((i) => i.kind === "BOOKING");
  if (pren.length > 0) {
    if (pren.some((b) => b.stato === "in_mare")) return { label: "IN MARE", className: "bg-ok text-white ring-1 ring-inset ring-[#0f5a50]" };
    if (pren.some((b) => b.stato !== "rientrata")) {
      return { label: pren.length === 1 ? "Prenotata" : `${pren.length} prenotazioni`, className: "bg-ok-soft text-ok ring-1 ring-inset ring-ok-line" };
    }
    return { label: "RIENTRATA", className: "bg-[#e6efee] text-[#3f4a49] ring-1 ring-inset ring-[#c2d2d0]" };
  }
  if (items.length > 0) {
    return { label: items.length === 1 ? "Blocco" : `${items.length} blocchi`, className: "bg-danger-soft text-danger ring-1 ring-inset ring-danger-line" };
  }
  if (!barcaAttiva) return { label: "Non attiva", className: "bg-[#efeaf0] text-muted ring-1 ring-inset ring-line" };
  return { label: "Libera", className: "bg-white text-muted ring-1 ring-inset ring-line hover:bg-foam hover:text-ocean" };
}

// Primo elemento da mostrare nella cella: in mare, prenotazione attiva, rientrata, blocco.
function priorita(item: PlanningItem): number {
  if (item.kind === "BLOCK") return 4;
  if (item.stato === "in_mare") return 0;
  if (item.stato === "rientrata") return 2;
  return 1;
}

export function primoElemento(items: PlanningItem[]): PlanningItem | undefined {
  return [...items].sort((a, b) => priorita(a) - priorita(b) || new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];
}

export function etichettaStato(stato: string): string {
  const mappa: Record<string, string> = {
    da_confermare: "Da confermare",
    prenotata: "Prenotata",
    in_mare: "In mare",
    rientrata: "Rientrata",
    no_show: "No show",
    cancellata: "Cancellata",
  };
  return mappa[stato] ?? stato;
}

export function etichettaOfferta(codice: string): string {
  const mappa: Record<string, string> = {
    LOCAZIONE: "Locazione",
    LOCAZIONE_CON_COMANDANTE: "Locazione con comandante",
    NOLEGGIO: "Noleggio",
  };
  return mappa[codice] ?? codice;
}

export function etichettaPatente(pren: PlanningBooking, barca: PlanningBoat | undefined): string {
  if (!barca?.patenteRichiesta) return "Non richiesta";
  if (pren.patenteRisposta === "YES") return "Sì";
  if (pren.patenteRisposta === "NO") return "No · skipper obbligatorio";
  return "Da confermare";
}

// Costruisce l'indice barca+giorno -> elementi, includendo anche le prenotazioni
// concluse (rientrate) che non occupano più la barca ma restano nello storico.
export function indicizza(items: PlanningItem[], giorni: Giorno[]) {
  const mappa = new Map<string, PlanningItem[]>();
  for (const it of items) {
    for (const g of giorni) {
      if (!occupaGiorno(it, g)) continue;
      const k = cellaKey(it.boatId, g);
      const cur = mappa.get(k);
      if (cur) cur.push(it);
      else mappa.set(k, [it]);
    }
  }
  return mappa;
}

// Normalizzazione numero WhatsApp: riconosce + e 00, non aggiunge +39 a un numero
// già qualificato con prefisso internazionale.
export function numeroWhatsApp(tel: string | null | undefined): string | null {
  const raw = (tel ?? "").trim();
  if (!raw) return null;
  const cifre = raw.replace(/[^\d+]/g, "");
  let n = cifre.startsWith("+") ? cifre.slice(1) : cifre;
  if (n.startsWith("00")) n = n.slice(2);
  n = n.replace(/\D/g, "");
  if (n.length < 8) return null;
  if (!n.startsWith("39") && raw.replace(/\D/g, "").length <= 11 && !raw.startsWith("+")) n = `39${n}`;
  return n;
}

export function linkWhatsApp(tel: string | null | undefined, testo: string): string | null {
  const n = numeroWhatsApp(tel);
  return n ? `https://wa.me/${n}?text=${encodeURIComponent(testo)}` : null;
}

// Testo del riepilogo WhatsApp (cliente), senza riferimenti al vecchio marchio.
export function testoRiepilogo(opts: {
  cliente: string;
  azienda: string;
  barca: string;
  giorno: Giorno;
  dalle: string;
  alle: string;
  passeggeri?: number | null;
}): string {
  const data = new Date(`${opts.giorno}T12:00:00`);
  const dataLabel = data.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" });
  const pax = opts.passeggeri ? ` per ${opts.passeggeri} passeggeri` : "";
  return `Ciao ${opts.cliente}, ti ricordiamo l'uscita con ${opts.azienda}: ${opts.barca}, ${dataLabel} dalle ${opts.dalle} alle ${opts.alle}${pax}. A presto!`;
}

export function giornoDiISO(iso: string): Giorno {
  return giornoDi(iso);
}
