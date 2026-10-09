"use client";
import { useEffect, useId, useMemo, useRef, useState } from "react";

export type OpzioneCombo = {
  valore: string;
  etichetta: string;
  dettaglio?: string;
};

function normalizza(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

// Campo con suggerimenti: si può scrivere liberamente oppure scegliere dall'elenco
// che si apre al clic e si filtra mentre si digita.
export function Combo({
  testo,
  onTesto,
  opzioni,
  onSeleziona,
  placeholder,
  className,
  ariaLabel,
  max = 40,
  autoFocus,
  onBlur,
}: {
  testo: string;
  onTesto: (testo: string) => void;
  opzioni: OpzioneCombo[];
  onSeleziona?: (opzione: OpzioneCombo) => void;
  placeholder?: string;
  className?: string;
  ariaLabel?: string;
  max?: number;
  autoFocus?: boolean;
  onBlur?: () => void;
}) {
  const [aperto, setAperto] = useState(false);
  const [evidenziato, setEvidenziato] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const idLista = useId();

  const filtrate = useMemo(() => {
    const q = normalizza(testo);
    const base = q
      ? opzioni.filter((o) => normalizza(`${o.etichetta} ${o.dettaglio ?? ""}`).includes(q))
      : opzioni;
    return base.slice(0, max);
  }, [opzioni, testo, max]);

  useEffect(() => {
    if (!aperto) return;
    const fuori = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setAperto(false);
    };
    document.addEventListener("mousedown", fuori);
    return () => document.removeEventListener("mousedown", fuori);
  }, [aperto]);

  useEffect(() => { setEvidenziato(0); }, [testo, aperto]);

  const scegli = (o: OpzioneCombo) => {
    onTesto(o.etichetta);
    onSeleziona?.(o);
    setAperto(false);
  };

  const tasti = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setAperto(true);
      setEvidenziato((i) => aperto ? Math.max(0, Math.min(i + 1, filtrate.length - 1)) : 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setEvidenziato((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && aperto && filtrate[evidenziato]) {
      e.preventDefault();
      scegli(filtrate[evidenziato]);
    } else if (e.key === "Escape") {
      setAperto(false);
    }
  };

  return (
    <div ref={box} className="relative">
      <input
        type="text"
        value={testo}
        onChange={(e) => { onTesto(e.target.value); setAperto(true); }}
        onFocus={() => setAperto(true)}
        onClick={() => setAperto(true)}
        onKeyDown={tasti}
        onBlur={() => { setAperto(false); onBlur?.(); }}
        placeholder={placeholder}
        aria-label={ariaLabel}
        autoFocus={autoFocus}
        autoComplete="off"
        role="combobox"
        aria-expanded={aperto}
        aria-controls={aperto ? idLista : undefined}
        aria-autocomplete="list"
        aria-activedescendant={aperto && filtrate[evidenziato] ? `${idLista}-${evidenziato}` : undefined}
        className={className}
      />
      {aperto && filtrate.length > 0 && (
        <ul
          id={idLista}
          role="listbox"
          className="absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-2xl border border-line bg-white py-1 shadow-xl"
        >
          {filtrate.map((o, i) => (
            <li id={`${idLista}-${i}`} key={`${o.valore}:${o.etichetta}:${i}`} role="option" aria-selected={i === evidenziato}>
              <button
                type="button"
                tabIndex={-1}
                onClick={() => scegli(o)}
                onMouseDown={(e) => { e.preventDefault(); scegli(o); }}
                onMouseEnter={() => setEvidenziato(i)}
                className={
                  "flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm " +
                  (i === evidenziato ? "bg-foam text-deep" : "text-ink hover:bg-foam")
                }
              >
                <span className="truncate">{o.etichetta}</span>
                {o.dettaglio && <span className="shrink-0 text-xs text-muted">{o.dettaglio}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
