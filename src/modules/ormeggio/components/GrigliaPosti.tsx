"use client";
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { SagomaBarca } from "@/modules/ormeggio/components/SagomaBarca";
import { formaBarca } from "@/modules/piattaforma/barche";
import type { Area, Perm, Posto, Stato } from "./tipi-griglia";

const STILE: Record<Stato, string> = {
  in_sosta: "border-[#a9e0d0] bg-[#d8f3ea] text-[#177469]",
  da_fare: "border-[#f0d59a] bg-[#fff0cc] text-[#9a6406]",
  in_mare: "border-[#8fddd5] bg-[#e1f5f2] text-deep",
  bloccata: "border-[#f6c9be] bg-[#fdeeea] text-coral",
};
const FILL: Record<Stato, string> = { in_sosta: "#177469", da_fare: "#b7791f", in_mare: "#087f8c", bloccata: "#e8755b" };
type Drag = { source: Posto; x: number; y: number; pointerId: number; element: HTMLButtonElement; rect: DOMRect; active: boolean; pending: boolean };
type Preview = { posto: Posto; left: number; top: number };

function BarcaNelPosto({ p, codice, font = 13, compatto = false, espanso = false }: { p: Perm; codice: string; font?: number; compatto?: boolean; espanso?: boolean }) {
  return <>
    <span className="relative flex min-h-0 w-full items-center justify-center overflow-hidden" data-sagoma>
      <span className="absolute left-[4%] top-[3%] z-10 font-bold leading-none" style={{ fontSize: 10 }}>{codice}</span>
      <SagomaBarca forma={formaBarca(p.boatTipoCodice, p.boatTipo)} cor={FILL[p.statoGriglia]} className="h-full max-h-[80px] w-[94%]" />
    </span>
    <span className={compatto ? "sr-only" : "flex min-h-0 w-full flex-col justify-center overflow-hidden border-t border-current/10 bg-white/65 px-1.5 py-1 text-center [overflow-wrap:anywhere]"} data-anagrafica style={{ fontSize: font, lineHeight: 1.2 }}>
      {p.proprietario && <span className={`block font-semibold ${espanso ? "whitespace-normal" : "truncate"}`}>{p.proprietario}</span>}
      <span className={`mt-0.5 block font-bold ${espanso ? "whitespace-normal" : "truncate"}`}>{p.boatNome}</span>
    </span>
  </>;
}

export function GrigliaPosti({ area, configura, busy, trascinabile, solaLettura = false, corrisponde, evidenza, onSeleziona, onAssegna, onToggleBlocco, onSposta, onErrore, onTrascinamento }: {
  area: Area; configura: boolean; busy: boolean; trascinabile: boolean; solaLettura?: boolean;
  corrisponde: (p: Posto) => boolean;
  evidenza: (p: Posto) => "anteprima" | "selezione" | undefined;
  onSeleziona: (p: Perm) => void; onAssegna: (p: Posto) => void; onToggleBlocco: (p: Posto) => unknown;
  onSposta: (p: Perm, posto: Posto) => Promise<boolean>; onErrore: (messaggio: string) => void; onTrascinamento: (attivo: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const ghost = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const clickBloccato = useRef(0);
  const fine = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dimensioni, setDimensioni] = useState({ width: 900, height: 500 });
  const [source, setSource] = useState<Posto | null>(null);
  const [target, setTarget] = useState<Posto | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pending, setPending] = useState(false);
  const [arrivo, setArrivo] = useState<string | null>(null);
  const [annuncio, setAnnuncio] = useState("");
  const onTrascinamentoRef = useRef(onTrascinamento);
  useEffect(() => { onTrascinamentoRef.current = onTrascinamento; }, [onTrascinamento]);
  const reset = useCallback(() => {
    const d = drag.current;
    if (d?.element.hasPointerCapture(d.pointerId)) d.element.releasePointerCapture(d.pointerId);
    drag.current = null; setSource(null); setTarget(null); setPending(false);
    onTrascinamentoRef.current(false);
  }, []);
  useEffect(() => {
    const misura = () => {
      if (!root.current) return;
      const r = root.current.getBoundingClientRect();
      setDimensioni({ width: r.width, height: Math.max(160, window.innerHeight - r.top - 28) });
    };
    const observer = new ResizeObserver(misura);
    if (root.current) observer.observe(root.current);
    window.addEventListener("resize", misura); misura();
    return () => { observer.disconnect(); window.removeEventListener("resize", misura); };
  }, [area.id, area.righe, area.colonne, configura]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && drag.current && !drag.current.pending) { clickBloccato.current = Date.now() + 400; setAnnuncio("Trascinamento annullato."); reset(); } };
    window.addEventListener("keydown", key);
    return () => { window.removeEventListener("keydown", key); if (fine.current) clearTimeout(fine.current); onTrascinamentoRef.current(false); };
  }, [reset]);
  useEffect(() => { reset(); setPreview(null); }, [area.id, configura, trascinabile, reset]);
  const map = useMemo(() => new Map(area.posti.map((p) => [`${p.riga}:${p.colonna}`, p])), [area.posti]);
  const gap = Math.max(1, Math.min(8, dimensioni.width / (area.colonne * 28)));
  const asse = Math.max(12, Math.min(28, dimensioni.width * 0.04));
  const cellWidth = Math.max(1, (dimensioni.width - asse - gap * area.colonne) / area.colonne);
  const denso = cellWidth < 80;
  const font = cellWidth < 100 ? 12 : 14;
  const altezzaBase = Math.max(4, Math.min(180, (dimensioni.height - 20 - gap * area.righe) / area.righe));
  const altezze = Array.from({ length: area.righe }, () => altezzaBase);
  const compatto = denso || altezzaBase < (solaLettura ? 55 : 80);
  const trova = (x: number, y: number) => {
    const element = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-posto-id]");
    if (!element || !root.current?.contains(element)) return null;
    return area.posti.find((p) => p.id === element.dataset.postoId) ?? null;
  };
  const valido = (p: Posto | null) => !!p && !p.bloccato && !p.permanenza;
  const posizioneGhost = (x: number, y: number) => {
    if (ghost.current) ghost.current.style.transform = `translate3d(${Math.min(window.innerWidth - 190, Math.max(8, x + 14))}px, ${Math.min(window.innerHeight - 180, Math.max(8, y + 14))}px, 0) rotate(-3deg)`;
  };
  const inizia = (e: PointerEvent<HTMLButtonElement>, p: Posto) => {
    if (busy || configura || !trascinabile || !p.permanenza || e.button !== 0 || drag.current) return;
    drag.current = { source: p, x: e.clientX, y: e.clientY, pointerId: e.pointerId, element: e.currentTarget, rect: e.currentTarget.getBoundingClientRect(), active: false, pending: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const muovi = (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pending || e.pointerId !== d.pointerId) return;
    if (!d.active && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 7) return;
    if (!d.active) { d.active = true; setSource(d.source); setPreview(null); onTrascinamentoRef.current(true); setAnnuncio(`Sposta ${d.source.permanenza?.boatNome} su un posto libero. Esc per annullare.`); }
    d.x = e.clientX; d.y = e.clientY;
    posizioneGhost(e.clientX, e.clientY);
    setTarget(trova(e.clientX, e.clientY));
  };
  const termina = async (e: PointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    if (!d || d.pending) return;
    if (!d.active) { reset(); return; }
    clickBloccato.current = Date.now() + 500;
    const destinazione = trova(e.clientX, e.clientY);
    if (d.element.hasPointerCapture(d.pointerId)) d.element.releasePointerCapture(d.pointerId);
    const torna = () => {
      if (ghost.current) { ghost.current.style.transition = "transform 220ms ease, opacity 220ms ease"; ghost.current.style.transform = `translate3d(${d.rect.left}px, ${d.rect.top}px, 0) rotate(0deg)`; ghost.current.style.opacity = "0"; }
      fine.current = setTimeout(reset, 220);
    };
    if (!valido(destinazione)) {
      if (destinazione?.id !== d.source.id) onErrore(destinazione ? "Scegli un posto libero e utilizzabile: nessuna assegnazione è stata modificata." : "Rilascia la barca sopra un posto libero.");
      torna(); return;
    }
    d.pending = true; setPending(true); setTarget(destinazione);
    const cell = root.current?.querySelector<HTMLElement>(`[data-posto-id="${destinazione!.id}"]`);
    const r = cell?.getBoundingClientRect();
    if (ghost.current && r) { ghost.current.style.transition = "transform 200ms ease"; ghost.current.style.transform = `translate3d(${r.left + r.width / 2 - 90}px, ${r.top + r.height / 2 - 75}px, 0) rotate(0deg)`; }
    try {
      const ok = await onSposta(d.source.permanenza!, destinazione!);
      if (!ok) { torna(); return; }
      setArrivo(destinazione!.id); setAnnuncio(`${d.source.permanenza!.boatNome} spostata al posto ${destinazione!.codice}.`);
      reset(); fine.current = setTimeout(() => setArrivo(null), 900);
    } catch { onErrore("Spostamento non riuscito: aggiorna il quadro prima di riprovare."); torna(); }
  };
  const mostraPreview = (element: HTMLButtonElement, posto: Posto) => {
    if (configura || !posto.permanenza || drag.current?.active) return;
    const r = element.getBoundingClientRect();
    setPreview({ posto, left: Math.max(8, Math.min(window.innerWidth - 228, r.left + r.width / 2 - 110)), top: r.top > 210 ? r.top - 196 : Math.min(window.innerHeight - 200, r.bottom + 8) });
  };
  return <>
    <div ref={root} className="w-full min-w-0 select-none" aria-label={`Posti dell’area ${area.nome}: griglia completa`}>
      <div className="grid w-full min-w-0" style={{ gap, gridTemplateColumns: `${asse}px repeat(${area.colonne}, minmax(0, 1fr))`, gridTemplateRows: `20px ${altezze.map((h) => `${h}px`).join(" ")}` }}>
        <span />
        {Array.from({ length: area.colonne }, (_, i) => <span key={`c${i}`} className="min-w-0 text-center font-semibold leading-none text-muted" style={{ fontSize: Math.min(11, cellWidth * 0.45) }}>{i + 1}</span>)}
        {Array.from({ length: area.righe }, (_, i) => <div key={`r${i}`} className="contents">
          <span className="flex items-center justify-center rounded-lg bg-deep font-bold text-white" style={{ fontSize: Math.min(11, altezze[i] * 0.5) }}>{String.fromCharCode(65 + i)}</span>
          {Array.from({ length: area.colonne }, (_, c) => {
            const p = map.get(`${i + 1}:${c + 1}`);
            if (!p) return <span key={c} className="rounded border border-dashed border-line" />;
            const boat = p.permanenza;
            const draggingSource = source?.id === p.id;
            const hovering = target?.id === p.id && source;
            const nom = boat ? `${p.codice} · ${boat.proprietario ? `${boat.proprietario} · ` : ""}${boat.boatNome}` : `${p.codice} · ${p.bloccato ? "non utilizzabile" : solaLettura ? "libero" : "libero — clicca per assegnare"}`;
            return <button key={p.id} data-posto-id={p.id} data-posto-codice={p.codice} data-permanenza-id={boat?.id} data-stato-posto={p.bloccato ? "bloccato" : boat ? "occupato" : "libero"} data-evidenza-posto={source ? undefined : evidenza(p) ?? (boat && preview?.posto.id === p.id ? "anteprima" : undefined)}
              type="button" aria-label={nom} title={configura ? `${p.codice}: clicca per ${p.bloccato ? "riabilitare" : "disattivare"}` : nom} disabled={busy || solaLettura && !boat}
              onPointerDown={(e) => inizia(e, p)} onPointerMove={muovi} onPointerUp={termina} onPointerCancel={() => { if (!drag.current?.pending) reset(); }}
              onPointerEnter={(e) => mostraPreview(e.currentTarget, p)} onPointerLeave={() => setPreview(null)} onFocus={(e) => mostraPreview(e.currentTarget, p)} onBlur={() => setPreview(null)}
              onClick={(e) => { if (Date.now() < clickBloccato.current) { e.preventDefault(); return; } setPreview(null); if (configura) onToggleBlocco(p); else if (boat) onSeleziona(boat); else if (!p.bloccato) onAssegna(p); }}
              className={`relative grid min-h-0 min-w-0 overflow-hidden border text-center transition-[opacity,background-color,box-shadow,transform] duration-150 motion-reduce:transition-none ${p.bloccato ? "border-dashed border-line bg-[#e8eeed] text-muted" : boat ? STILE[boat.statoGriglia] : "border-[#bfe6dc] bg-white text-muted hover:bg-foam"} ${!corrisponde(p) ? "opacity-25" : ""} ${draggingSource ? "opacity-25 ring-2 ring-inset ring-ocean/40" : ""} ${hovering ? valido(p) ? "ring-2 ring-inset ring-ocean bg-signature/50" : "ring-2 ring-inset ring-coral" : ""} ${arrivo === p.id ? "posto-arrivo" : ""}`}
              style={{ borderRadius: Math.max(2, Math.min(18, cellWidth / 7)), gridTemplateRows: boat ? compatto ? "minmax(0,1fr)" : `minmax(0, 1fr) ${font * 2.4 + 12}px` : undefined, cursor: solaLettura && !boat ? "default" : boat && trascinabile && !configura ? "grab" : "pointer", touchAction: boat && trascinabile && !configura ? "none" : "auto" }}>
              {boat ? <BarcaNelPosto p={boat} codice={p.codice} font={font} compatto={compatto} /> : <><span className="absolute left-[4%] top-[3%] font-semibold leading-none" style={{ fontSize: Math.max(2, Math.min(10, cellWidth / 7, altezze[i] / 5)) }}>{p.codice}</span><span className="self-center leading-none" style={{ fontSize: Math.max(2, Math.min(11, cellWidth / 7, altezze[i] / 5)) }}>{p.bloccato ? "×" : solaLettura ? "·" : "+"}</span></>}
            </button>;
          })}
        </div>)}
      </div>
    </div>
    <p className="mt-2 text-[11px] text-muted">{solaLettura ? "Mappa aggiornata automaticamente, in sola lettura." : configura ? "Clicca un posto per abilitarlo o bloccarlo." : trascinabile ? "Trascina una barca su un posto libero. Clicca per la scheda; Esc annulla il trascinamento." : "Vista storica: per trascinare una barca torna alla data di oggi."}{" Passa su una barca o usa il focus per ingrandire i dettagli."}</p>
    <span className="sr-only" role="status" aria-live="polite">{annuncio}</span>
    {source?.permanenza && createPortal(<div ref={(el) => { ghost.current = el; if (el && drag.current && !el.style.transform) posizioneGhost(drag.current.x, drag.current.y); }} data-drag-anteprima className="pointer-events-none fixed left-0 top-0 z-[80] w-[180px] rounded-2xl border border-ocean bg-white p-2 shadow-[0_24px_60px_-12px_rgba(5,47,63,0.5)]" style={{ willChange: "transform" }}>
      <div className={`grid min-h-[150px] grid-rows-[minmax(60px,1fr)_auto] overflow-hidden rounded-xl ${STILE[source.permanenza.statoGriglia]}`}><BarcaNelPosto p={source.permanenza} codice={source.codice} espanso /></div>
      <p className="mt-1 text-center text-xs font-bold text-ocean">{pending ? "Spostamento…" : target && valido(target) ? `Rilascia su ${target.codice}` : "Scegli un posto libero"}</p>
    </div>, document.body)}
    {preview?.posto.permanenza && !source && createPortal(<div data-posto-anteprima className="pointer-events-none fixed z-[60] w-[220px] rounded-2xl border border-signature bg-white p-2 shadow-xl" style={{ left: Math.max(8, Math.min(window.innerWidth - 228, preview.left)), top: Math.max(8, Math.min(window.innerHeight - 200, preview.top)) }} aria-hidden>
      <div className={`grid min-h-[174px] grid-rows-[minmax(60px,1fr)_auto] overflow-hidden rounded-xl ${STILE[preview.posto.permanenza.statoGriglia]}`}><BarcaNelPosto p={preview.posto.permanenza} codice={preview.posto.codice} font={13} espanso /></div>
    </div>, document.body)}
  </>;
}
