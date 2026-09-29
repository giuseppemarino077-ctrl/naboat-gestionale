"use client";
import { useCallback, useState } from "react";
import { Dialogo } from "./Dialogo";

export type CampoDialogo = {
  nome: string;
  etichetta: string;
  tipo?: "text" | "number" | "email" | "tel" | "date" | "time" | "textarea";
  valore?: string;
  placeholder?: string;
  aiuto?: string;
  min?: number;
  max?: number;
  step?: string;
  opzioni?: { valore: string; label: string }[];
};

type OpzioniModulo = { confermaLabel?: string; descrizione?: React.ReactNode };

export function useModulo() {
  const [stato, setStato] = useState<{
    titolo: string;
    campi: CampoDialogo[];
    opzioni: OpzioniModulo;
    risolvi: (v: Record<string, string> | null) => void;
  } | null>(null);
  const [valori, setValori] = useState<Record<string, string>>({});

  const apri = useCallback(
    (titolo: string, campi: CampoDialogo[], opzioni: OpzioniModulo = {}) =>
      new Promise<Record<string, string> | null>((risolvi) => {
        setValori(Object.fromEntries(campi.map((c) => [c.nome, c.valore ?? ""])));
        setStato({ titolo, campi, opzioni, risolvi });
      }),
    [],
  );

  const chiudi = useCallback(
    (v: Record<string, string> | null) => {
      setStato((corrente) => {
        corrente?.risolvi(v);
        return null;
      });
    },
    [],
  );

  const dialogo = stato ? (
    <Dialogo aperto onChiudi={() => chiudi(null)} titolo={stato.titolo}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          chiudi(valori);
        }}
      >
        {stato.opzioni.descrizione && <p className="text-sm text-muted">{stato.opzioni.descrizione}</p>}
        {stato.campi.map((c, i) => (
          <label key={c.nome} className="grid gap-1 text-sm font-semibold">
            {c.etichetta}
            {c.opzioni ? (
              <select
                className="campo"
                autoFocus={i === 0}
                value={valori[c.nome] ?? ""}
                onChange={(e) => setValori((v) => ({ ...v, [c.nome]: e.target.value }))}
              >
                {c.opzioni.map((o) => (
                  <option key={o.valore} value={o.valore}>{o.label}</option>
                ))}
              </select>
            ) : c.tipo === "textarea" ? (
              <textarea
                className="campo"
                rows={3}
                autoFocus={i === 0}
                placeholder={c.placeholder}
                value={valori[c.nome] ?? ""}
                onChange={(e) => setValori((v) => ({ ...v, [c.nome]: e.target.value }))}
              />
            ) : (
              <input
                className="campo"
                type={c.tipo ?? "text"}
                autoFocus={i === 0}
                placeholder={c.placeholder}
                min={c.min}
                max={c.max}
                step={c.step}
                value={valori[c.nome] ?? ""}
                onChange={(e) => setValori((v) => ({ ...v, [c.nome]: e.target.value }))}
              />
            )}
            {c.aiuto && <span className="text-xs font-normal text-muted">{c.aiuto}</span>}
          </label>
        ))}
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" className="btn-soft" onClick={() => chiudi(null)}>
            Annulla
          </button>
          <button type="submit" className="btn-primary">
            {stato.opzioni.confermaLabel ?? "Salva"}
          </button>
        </div>
      </form>
    </Dialogo>
  ) : null;

  return { apri, dialogo };
}
