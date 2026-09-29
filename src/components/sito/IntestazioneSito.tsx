"use client";
import { useState } from "react";
import { LINK_PROGETTO, LINK_SONDAGGIO } from "@/lib/sito";

const VOCI = [
  { href: "/", label: "Home" },
  { href: "/noleggia", label: "Noleggia una barca" },
  { href: "/per-noleggiatori", label: "Per i noleggiatori" },
  { href: "/chi-siamo", label: "Chi siamo" },
  { href: "/contatti", label: "Contatti" },
  { href: "/area", label: "Area cliente" },
];

// Barra del sito pubblico: voci di navigazione e pulsanti di accesso al portale.
export function IntestazioneSito({ appBase }: { appBase: string }) {
  const [aperto, setAperto] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b border-line bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-5 py-3">
        <a className="flex items-center gap-2 font-display text-lg font-extrabold text-deep" href="/">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-deep"><img src="/img/logo-naboat-bianco.png" alt="" className="h-5 w-auto" /></span>
          NaBoat
        </a>

        <nav className="hidden flex-1 gap-6 text-sm font-semibold text-[#3c565e] md:flex">
          {VOCI.map((v) => (
            <a key={v.href} className="hover:text-ocean" href={v.href}>
              {v.label}
            </a>
          ))}
          <a
            className="hidden font-bold text-ocean hover:brightness-110 lg:inline"
            href={LINK_PROGETTO}
          >
            Vedi il progetto
          </a>
          <a
            className="hidden font-bold text-ocean hover:brightness-110 lg:inline"
            href={LINK_SONDAGGIO}
            target="_blank"
            rel="noopener noreferrer"
          >
            Partecipa al sondaggio
          </a>
        </nav>

        <div className="ml-auto hidden items-center gap-2 md:flex">
          <a className="px-3 py-2 text-sm font-bold text-ocean hover:brightness-110" href={`/gestionale/accesso`}>
            Accedi
          </a>
          <a
            className="rounded-[7px] bg-gold px-4 py-2 text-sm font-extrabold text-[#3a2708] hover:brightness-110"
            href={`/gestionale/registrazione`}
          >
            Registra la tua azienda
          </a>
        </div>

        <button
          className="ml-auto grid h-10 w-10 place-items-center rounded-lg border border-line md:hidden"
          onClick={() => setAperto(true)}
          aria-label="Apri il menù"
        >
          <span className="grid gap-1">
            <span className="block h-0.5 w-5 bg-deep" />
            <span className="block h-0.5 w-5 bg-deep" />
            <span className="block h-0.5 w-5 bg-deep" />
          </span>
        </button>
      </div>

      {aperto && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-deep p-6 text-white md:hidden">
          <button className="self-end text-2xl text-aqua" onClick={() => setAperto(false)} aria-label="Chiudi il menù">
            ✕
          </button>
          <nav className="mt-4 grid">
            {VOCI.map((v) => (
              <a
                key={v.href}
                className="border-b border-white/10 py-3 text-lg font-semibold"
                href={v.href}
                onClick={() => setAperto(false)}
              >
                {v.label}
              </a>
            ))}
            <a
              className="border-b border-white/10 py-3 text-lg font-bold text-white"
              href={LINK_PROGETTO}
              onClick={() => setAperto(false)}
            >
              Vedi il progetto
            </a>
            <a
              className="border-b border-white/10 py-3 text-lg font-bold text-gold"
              href={LINK_SONDAGGIO}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAperto(false)}
            >
              Partecipa al sondaggio
            </a>
          </nav>
          <div className="mt-auto grid gap-2 pt-6">
            <a className="rounded-[9px] border border-sea bg-sea/15 px-4 py-3 text-center font-extrabold" href={`/gestionale/accesso`}>
              Accedi
            </a>
            <a className="rounded-[9px] bg-gold px-4 py-3 text-center font-extrabold text-[#3a2708]" href={`/gestionale/registrazione`}>
              Registra la tua azienda
            </a>
            <p className="mt-2 text-center text-xs text-white/60">Hai già un account e gestisci la tua flotta? Accedi dal portale.</p>
          </div>
        </div>
      )}
    </header>
  );
}
