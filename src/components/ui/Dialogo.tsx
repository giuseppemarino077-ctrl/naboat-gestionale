"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icona } from "./Icona";

const FOCUSABILI =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function Dialogo({
  aperto,
  onChiudi,
  titolo,
  children,
  larghezza = "max-w-lg",
}: {
  aperto: boolean;
  onChiudi: () => void;
  titolo: string;
  children: React.ReactNode;
  larghezza?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const idTitolo = useId();

  useEffect(() => {
    if (!aperto) return;
    const precedente = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const contenitore = ref.current;
    const elenco = () =>
      Array.from(contenitore?.querySelectorAll<HTMLElement>(FOCUSABILI) ?? []).filter((el) => el.offsetParent !== null);
    elenco()[0]?.focus();
    const tasto = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onChiudi();
        return;
      }
      if (e.key !== "Tab") return;
      const els = elenco();
      if (els.length === 0) return;
      const primo = els[0];
      const ultimo = els[els.length - 1];
      if (e.shiftKey && document.activeElement === primo) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primo.focus();
      }
    };
    document.addEventListener("keydown", tasto);
    return () => {
      document.removeEventListener("keydown", tasto);
      document.body.style.overflow = overflow;
      precedente?.focus?.();
    };
  }, [aperto, onChiudi]);

  if (!aperto) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-black/50 p-4" onClick={onChiudi}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idTitolo}
        tabIndex={-1}
        className={"w-full rounded-3xl border border-line bg-white p-5 shadow-2xl outline-none " + larghezza}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={idTitolo} className="font-display text-lg font-bold">
            {titolo}
          </h2>
          <button
            type="button"
            onClick={onChiudi}
            aria-label="Chiudi"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-foam hover:text-ocean"
          >
            <Icona nome="chiudi" className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </div>
    </div>
  );
}

export type OpzioniConferma = {
  titolo: string;
  messaggio: React.ReactNode;
  dettaglio?: React.ReactNode;
  confermaLabel?: string;
  annullaLabel?: string;
  pericoloso?: boolean;
};

export function ConfermaDialogo({
  aperto,
  opzioni,
  onConferma,
  onAnnulla,
}: {
  aperto: boolean;
  opzioni: OpzioniConferma | null;
  onConferma: () => void;
  onAnnulla: () => void;
}) {
  if (!opzioni) return null;
  return (
    <Dialogo aperto={aperto} onChiudi={onAnnulla} titolo={opzioni.titolo} larghezza="max-w-md">
      <div className="text-sm text-ink/85">{opzioni.messaggio}</div>
      {opzioni.dettaglio && (
        <div className="mt-3 rounded-2xl border border-warn-line bg-warn-soft p-3 text-sm text-warn">{opzioni.dettaglio}</div>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-soft" onClick={onAnnulla}>
          {opzioni.annullaLabel ?? "Annulla"}
        </button>
        <button
          type="button"
          autoFocus
          className={opzioni.pericoloso ? "btn-danger" : "btn-primary"}
          onClick={onConferma}
        >
          {opzioni.confermaLabel ?? "Conferma"}
        </button>
      </div>
    </Dialogo>
  );
}

export function useConferma() {
  const [stato, setStato] = useState<{ opzioni: OpzioniConferma; risolvi: (v: boolean) => void } | null>(null);
  const chiedi = useCallback(
    (opzioni: OpzioniConferma) => new Promise<boolean>((risolvi) => setStato({ opzioni, risolvi })),
    [],
  );
  const rispondi = useCallback(
    (valore: boolean) => {
      setStato((corrente) => {
        corrente?.risolvi(valore);
        return null;
      });
    },
    [],
  );
  const dialogo = (
    <ConfermaDialogo
      aperto={!!stato}
      opzioni={stato?.opzioni ?? null}
      onConferma={() => rispondi(true)}
      onAnnulla={() => rispondi(false)}
    />
  );
  return { chiedi, dialogo };
}
