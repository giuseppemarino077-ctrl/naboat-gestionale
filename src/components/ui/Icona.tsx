"use client";
import type { ReactNode, SVGProps } from "react";

export type NomeIcona =
  | "casa"
  | "calendario"
  | "lista"
  | "barca"
  | "clienti"
  | "euro"
  | "ingranaggio"
  | "registro"
  | "ancora"
  | "checklist"
  | "movimenti"
  | "portafoglio"
  | "manutenzione"
  | "pin"
  | "etichetta"
  | "stella"
  | "meteo"
  | "orologio"
  | "scudo"
  | "pacchetto"
  | "moduli"
  | "esterno"
  | "chiudi"
  | "menu"
  | "freccia-sinistra"
  | "freccia-destra"
  | "freccia-giu"
  | "piu"
  | "check"
  | "avviso"
  | "info"
  | "errore"
  | "ricarica"
  | "caricamento"
  | "cestino"
  | "matita"
  | "immagine"
  | "pausa"
  | "occhio"
  | "cerca"
  | "uscita"
  | "utente"
  | "telefono"
  | "mail"
  | "chat"
  | "documento"
  | "carta";

const TRATTO = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const DISEGNI: Record<NomeIcona, ReactNode> = {
  casa: <><path d="M3 10.5 12 3l9 7.5" /><path d="M5.5 9.5V21h13V9.5" /></>,
  calendario: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18" /></>,
  lista: <><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></>,
  barca: <><path d="M22 18H2a4 4 0 0 0 4 4h12a4 4 0 0 0 4-4Z" /><path d="M21 14 10 2 3 14h18Z" /><path d="M10 2v16" /></>,
  clienti: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></>,
  euro: <><path d="M4 10h12M4 14h9" /><path d="M19 5a8 8 0 1 0 0 14" /></>,
  ingranaggio: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></>,
  registro: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /><path d="M12 8v4l3 2" /></>,
  ancora: <><circle cx="12" cy="5" r="3" /><path d="M12 22V8" /><path d="M5 12H2a10 10 0 0 0 20 0h-3" /></>,
  checklist: <><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>,
  movimenti: <><path d="M7 3v18M3 7l4-4 4 4M17 21V3M13 17l4 4 4-4" /></>,
  portafoglio: <><path d="M20 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" /><path d="M16 13h.01M2 7V6a2 2 0 0 1 2-2h12" /></>,
  manutenzione: <><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18v3h3l6.3-6.3a4 4 0 0 0 5.4-5.4l-2.3 2.3-2.1-2.1 2.4-2.2Z" /></>,
  pin: <><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
  etichetta: <><path d="M20.6 13.4 12 22l-9-9V5a2 2 0 0 1 2-2h8z" /><circle cx="7.5" cy="7.5" r="1" /></>,
  stella: <><path d="M12 3l2.8 5.9 6.2.8-4.6 4.3 1.2 6.2L12 17.3 6.4 20.2l1.2-6.2L3 9.7l6.2-.8Z" /></>,
  meteo: <><circle cx="12" cy="11" r="3.5" /><path d="M12 3v2M4.5 6.5 6 8M3 14h2M19 14h2M18 6.5 16.5 8" /><path d="M8 18a4 4 0 0 1 .5-8 5 5 0 0 1 9.5 1.5A3.5 3.5 0 0 1 17 18Z" /></>,
  orologio: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  scudo: <><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z" /></>,
  pacchetto: <><path d="M21 8 12 3 3 8v8l9 5 9-5Z" /><path d="M3 8l9 5 9-5M12 13v8" /></>,
  moduli: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  esterno: <><path d="M15 3h6v6M10 14 21 3" /><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" /></>,
  chiudi: <><path d="M18 6 6 18M6 6l12 12" /></>,
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  "freccia-sinistra": <><path d="M15 18l-6-6 6-6" /></>,
  "freccia-destra": <><path d="M9 18l6-6-6-6" /></>,
  "freccia-giu": <><path d="M6 9l6 6 6-6" /></>,
  piu: <><path d="M12 5v14M5 12h14" /></>,
  check: <><path d="M20 6 9 17l-5-5" /></>,
  avviso: <><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 16v-4M12 8h.01" /></>,
  errore: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></>,
  ricarica: <><path d="M21 12a9 9 0 1 1-3-6.7L21 8" /><path d="M21 3v5h-5" /></>,
  caricamento: <><path d="M12 3a9 9 0 1 0 9 9" /></>,
  cestino: <><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></>,
  matita: <><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  immagine: <><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="M21 15l-5-5L5 21" /></>,
  pausa: <><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></>,
  occhio: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></>,
  cerca: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></>,
  uscita: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></>,
  utente: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  telefono: <><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8.1 9.5a16 16 0 0 0 6 6l1.1-1.1a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" /></>,
  mail: <><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M2 7l10 6 10-6" /></>,
  chat: <><path d="M21 11.5a8.4 8.4 0 0 1-8.5 8.4 8.5 8.5 0 0 1-4-1L3 20l1.2-5.2a8.4 8.4 0 1 1 16.8-3.3Z" /></>,
  documento: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  carta: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
};

export function Icona({ nome, className = "h-5 w-5", titolo, ...rest }: { nome: NomeIcona; className?: string; titolo?: string } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      role={titolo ? "img" : undefined}
      aria-hidden={titolo ? undefined : true}
      aria-label={titolo}
      {...TRATTO}
      {...rest}
    >
      {DISEGNI[nome]}
    </svg>
  );
}
