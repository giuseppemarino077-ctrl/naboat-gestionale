"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUtente, dimenticaUtente } from "@/components/Utente";
import { aziendaNonAttiva, percorsoConsentitoInAttesa } from "@/lib/accesso";

// Voci di navigazione del gestionale, ognuna con i ruoli che possono vederla e il gruppo
// a cui appartiene. Il menù si adatta al ruolo e ai moduli attivi: niente voci che poi
// darebbero errore. I percorsi sono tutti sotto /gestionale.
type Gruppo = "noleggio" | "ormeggio" | "gestione";
type Voce = { href: string; icona: string; nome: string; ruoli: string[]; modulo: "noleggio" | "ormeggio" | "comune"; gruppo: Gruppo };

const AZIENDA = ["owner", "operatore"];
const AZIENDA_E_SKIPPER = ["owner", "operatore", "skipper"];

const VOCI: Voce[] = [
  { href: "/gestionale/oggi", icona: "⌂", nome: "Oggi", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/calendario", icona: "▦", nome: "Calendario", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/prenotazioni", icona: "☰", nome: "Prenotazioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/turni", icona: "⏱", nome: "Turni", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/meteo", icona: "☁", nome: "Meteo", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/flotta", icona: "⌁", nome: "Flotta", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/impostazioni/porti", icona: "⌖", nome: "Porti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/impostazioni/listino", icona: "⌸", nome: "Listino", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/manutenzione", icona: "⚙", nome: "Manutenzione", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/clienti", icona: "☷", nome: "Clienti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/economia", icona: "€", nome: "Economia", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/recensioni", icona: "★", nome: "Recensioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/gestionale/ormeggio", icona: "⚓", nome: "Ormeggio", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/gestionale/ormeggio/da-fare", icona: "☑", nome: "Da fare", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/gestionale/ormeggio/movimenti", icona: "⇅", nome: "Movimenti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/gestionale/ormeggio/conti", icona: "＄", nome: "Conti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/gestionale/registro", icona: "✎", nome: "Registro", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione" },
  { href: "/gestionale/impostazioni/piano", icona: "◷", nome: "Servizi NaBoat", ruoli: ["owner"], modulo: "comune", gruppo: "gestione" },
  { href: "/gestionale/impostazioni/team", icona: "⚓", nome: "Team", ruoli: ["owner"], modulo: "comune", gruppo: "gestione" },
  { href: "/gestionale/impostazioni", icona: "⌂", nome: "Impostazioni", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione" },
  { href: "/gestionale/impostazioni/sicurezza", icona: "🔒", nome: "Sicurezza", ruoli: AZIENDA_E_SKIPPER, modulo: "comune", gruppo: "gestione" },
];

const NOMI_GRUPPO: Record<Gruppo, string> = {
  noleggio: "Noleggio",
  ormeggio: "Ormeggio",
  gestione: "Gestione",
};

function vociVisibili(role: string | undefined, ormeggio: boolean, modulo: string | null, statoAzienda?: string | null) {
  if (!role) return [];
  // Azienda non ancora attiva: si può solo gestire la sicurezza e consultare lo stato.
  if (aziendaNonAttiva(statoAzienda)) return VOCI.filter((v) => v.href === "/gestionale/impostazioni/sicurezza");
  const noleggioAttivo = !ormeggio || modulo === "entrambi";
  return VOCI.filter((v) => {
    if (!v.ruoli.includes(role)) return false;
    if (v.modulo === "noleggio") return noleggioAttivo;
    if (v.modulo === "ormeggio") return ormeggio;
    return true;
  });
}

function gruppi(voci: Voce[]) {
  const ordine: Gruppo[] = ["noleggio", "ormeggio", "gestione"];
  return ordine
    .map((g) => ({ g, voci: voci.filter((v) => v.gruppo === g) }))
    .filter((x) => x.voci.length > 0);
}

function voceAttiva(path: string, href: string) {
  return path === href || path.startsWith(`${href}/`);
}

function VoceLink({ v, attiva, onClick }: { v: Voce; attiva: boolean; onClick?: () => void }) {
  return (
    <Link
      href={v.href}
      onClick={onClick}
      className={
        "flex items-center gap-2.5 rounded-full px-3 py-2 transition " +
        (attiva ? "bg-white/15 font-semibold text-white shadow-inner" : "text-[#ffe0c2] hover:bg-white/10 hover:text-white")
      }
    >
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/10 text-[13px]">{v.icona}</span>
      <span className="truncate">{v.nome}</span>
    </Link>
  );
}

export function NavLaterale({ chiuso, onChiudi }: { chiuso: boolean; onChiudi: () => void }) {
  const path = usePathname();
  const utente = useUtente({ redirect: true });
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null, utente?.tenantStatus);

  if (chiuso) {
    return (
      <button
        onClick={onChiudi}
        title="Mostra il menù"
        className="fixed left-2 top-3 z-40 grid h-9 w-9 place-items-center rounded-full border border-line bg-white text-ocean shadow-sm"
      >
        ▶
      </button>
    );
  }

  return (
    <nav className="grid gap-4 pb-2">
      {gruppi(voci).map(({ g, voci: lista }) => (
        <div key={g} className="grid gap-1">
          <p className="px-3 text-[11px] font-semibold uppercase tracking-widest text-[#f3cba6]">{NOMI_GRUPPO[g]}</p>
          {lista.map((v) => (
            <VoceLink key={v.href} v={v} attiva={voceAttiva(path, v.href)} />
          ))}
        </div>
      ))}
    </nav>
  );
}

export function NavMobile() {
  const path = usePathname();
  const utente = useUtente({ redirect: true });
  const [aperto, setAperto] = useState(false);
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null, utente?.tenantStatus);
  const principali = voci.slice(0, 4);

  return (
    <>
      {aperto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-deep p-4 text-white md:hidden">
          <div className="flex items-center justify-between pb-3">
            <span className="font-display font-extrabold">Tutte le sezioni</span>
            <button className="rounded-full bg-white/10 px-3 py-1 text-sm font-bold" onClick={() => setAperto(false)}>
              Chiudi ✕
            </button>
          </div>
          <nav className="grid gap-3 overflow-y-auto text-sm">
            {gruppi(voci).map(({ g, voci: lista }) => (
              <div key={g} className="grid gap-1">
                <p className="px-2 text-[11px] font-semibold uppercase tracking-widest text-[#f3cba6]">{NOMI_GRUPPO[g]}</p>
                {lista.map((v) => (
                  <Link
                    key={v.href}
                    href={v.href}
                    onClick={() => setAperto(false)}
                    className={
                      "flex items-center gap-3 rounded-full px-3 py-2.5 " +
                      (voceAttiva(path, v.href) ? "bg-white/20 text-white" : "text-[#ffe0c2]")
                    }
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-white/10">{v.icona}</span>
                    {v.nome}
                  </Link>
                ))}
              </div>
            ))}
          </nav>
        </div>
      )}

      <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white py-2 text-center text-[11px] text-muted md:hidden">
        {principali.map((v) => {
          const attiva = voceAttiva(path, v.href);
          return (
            <Link key={v.href} href={v.href} className={attiva ? "font-bold text-ocean" : ""}>
              <span className="block text-base">{v.icona}</span>
              {v.nome.length > 9 ? `${v.nome.slice(0, 7)}.` : v.nome}
            </Link>
          );
        })}
        {voci.length > 4 ? (
          <button onClick={() => setAperto(true)} className={aperto ? "font-bold text-ocean" : ""}>
            <span className="block text-base">☰</span>
            Altro
          </button>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}

// Contenitore del gestionale: menù laterale, intestazione e controllo dell'azienda non attiva.
// Il layout decide chi lo usa (`src/app/gestionale/(portale)/layout.tsx`): qui niente elenchi
// di pathname per capire se una pagina è pubblica o privata.
export function StrutturaGestionale({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const utente = useUtente({ redirect: true });
  const [chiuso, setChiuso] = useState(false);

  useEffect(() => {
    setChiuso(localStorage.getItem("nb_menu_chiuso") === "1");
  }, []);

  // Azienda non ancora attiva: fuori dalle sezioni consentite si torna alla pagina di stato.
  useEffect(() => {
    if (utente && aziendaNonAttiva(utente.tenantStatus) && !percorsoConsentitoInAttesa(path)) {
      window.location.href = "/gestionale/stato";
    }
  }, [utente, path]);

  const cambiaChiusura = (valore: boolean) => {
    setChiuso(valore);
    localStorage.setItem("nb_menu_chiuso", valore ? "1" : "0");
  };

  const esci = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    dimenticaUtente();
    window.location.href = "/gestionale/accesso";
  };

  return (
    <div className="flex min-h-screen">
      <aside className={chiuso ? "hidden" : "hidden w-[220px] shrink-0 flex-col bg-gradient-to-b from-[#9a3412] to-[#7a2a10] p-3 text-white md:flex"}>
        <div className="flex items-center justify-between px-2 pb-4 pt-2">
          <div className="flex items-center gap-2 font-display font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ffd9a8]"><img src="/img/logo-naboat-scuro.png" alt="" className="h-5 w-auto" /></span>
            NaBoat
          </div>
          <button onClick={() => cambiaChiusura(true)} title="Nascondi il menù" className="rounded-full px-2 py-0.5 text-[#ffe0c2] hover:bg-white/10 hover:text-white">
            ◀
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLaterale chiuso={false} onChiudi={() => cambiaChiusura(true)} />
        </div>

        <div className="mt-3 shrink-0 rounded-2xl bg-white/10 p-3 text-xs">
          <div className="flex items-center gap-2">
            {utente?.tenantLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={utente.tenantLogo} alt="" className="h-8 w-8 shrink-0 rounded-full bg-white object-contain p-0.5" />
            ) : (
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20 font-bold text-white">
                {(utente?.tenantNome ?? utente?.email ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <div className="min-w-0">
              <p className="truncate font-semibold text-white">{utente?.tenantNome ?? utente?.email ?? ""}</p>
              {utente?.tenantStatus && <p className="text-[10px] uppercase tracking-wide text-[#f3cba6]">{utente.tenantStatus}</p>}
            </div>
          </div>
          <button
            onClick={esci}
            className="mt-2 w-full rounded-full bg-white/10 px-3 py-1.5 text-center font-bold text-[#ffe0c2] hover:bg-white/20 hover:text-white"
          >
            ⎋ Esci
          </button>
        </div>
      </aside>

      {/* Freccetta per riaprire il menù quando è nascosto (solo su schermo grande) */}
      {chiuso && (
        <div className="hidden md:block">
          <NavLaterale chiuso onChiudi={() => cambiaChiusura(false)} />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <header className="flex h-[67px] items-center justify-between gap-3 border-b border-line bg-white px-5">
          <div className="flex items-center gap-2">
            <strong className="font-display">Gestionale</strong>
            {utente?.tenantNome && <span className="hidden text-sm text-muted sm:inline">· {utente.tenantNome}</span>}
          </div>
          <div className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden truncate sm:inline">{utente?.email}</span>
            <span className="inline-grid h-8 w-8 place-items-center rounded-full bg-ocean text-[12px] font-bold text-white">
              {(utente?.nome ?? utente?.email ?? "?").charAt(0).toUpperCase()}
            </span>
            <button
              onClick={esci}
              className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ocean hover:bg-foam"
            >
              Esci
            </button>
          </div>
        </header>
        <main className="p-5">
          {utente?.role === "superadmin" && (
            <div className="mb-4 rounded-2xl border border-gold/50 bg-[#fff7e6] p-3 text-sm font-semibold text-[#9a6406]">
              Sei <b>NaBoat (superadmin)</b>: il gestionale mostra i dati di un'azienda solo selezionandola. Le aziende e i servizi si gestiscono da <a className="underline" href="/admin">Admin</a>. Per provare il gestionale accedi con un account aziendale (es. <b>titolare@demo.naboat.it</b>).
            </div>
          )}
          {children}
        </main>
        <NavMobile />
      </div>
    </div>
  );
}
