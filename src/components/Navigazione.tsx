"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUtente, dimenticaUtente } from "@/components/Utente";

// Voci di navigazione, ognuna con i ruoli che possono vederla.
// Il menù si adatta al ruolo: niente voci che poi darebbero errore.
type Voce = { href: string; icona: string; nome: string; ruoli: string[]; modulo: "noleggio" | "ormeggio" | "comune" };

const TUTTI = ["superadmin", "owner", "operatore", "skipper"];
const AZIENDA = ["owner", "operatore"];
const AZIENDA_E_SKIPPER = ["owner", "operatore", "skipper"];

const VOCI: Voce[] = [
  { href: "/oggi", icona: "⌂", nome: "Oggi", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio" },
  { href: "/calendario", icona: "▦", nome: "Calendario", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio" },
  { href: "/turni", icona: "⏱", nome: "Turni", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio" },
  { href: "/meteo", icona: "☁", nome: "Meteo", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio" },
  { href: "/flotta", icona: "⌁", nome: "Flotta", ruoli: AZIENDA, modulo: "noleggio" },
  { href: "/listino", icona: "⌸", nome: "Listino", ruoli: AZIENDA, modulo: "noleggio" },
  { href: "/manutenzione", icona: "⚙", nome: "Manutenzione", ruoli: AZIENDA, modulo: "noleggio" },
  { href: "/clienti", icona: "☷", nome: "Clienti", ruoli: AZIENDA, modulo: "noleggio" },
  { href: "/pagamenti", icona: "€", nome: "Pagamenti", ruoli: AZIENDA, modulo: "noleggio" },
  { href: "/resoconto", icona: "▤", nome: "Resoconto", ruoli: AZIENDA, modulo: "noleggio" },
  { href: "/ormeggio", icona: "▦", nome: "Griglia posti", ruoli: AZIENDA, modulo: "ormeggio" },
  { href: "/ormeggio/da-fare", icona: "☑", nome: "Da fare", ruoli: AZIENDA, modulo: "ormeggio" },
  { href: "/ormeggio/movimenti", icona: "⇅", nome: "Movimenti", ruoli: AZIENDA, modulo: "ormeggio" },
  { href: "/ormeggio/conti", icona: "€", nome: "Conti", ruoli: AZIENDA, modulo: "ormeggio" },
  { href: "/ormeggio/configurazione", icona: "⚙", nome: "Configurazione", ruoli: ["owner"], modulo: "ormeggio" },
  { href: "/registro", icona: "✎", nome: "Registro", ruoli: AZIENDA, modulo: "comune" },
  { href: "/abbonamento", icona: "◷", nome: "Servizi NaBoat", ruoli: ["owner"], modulo: "comune" },
  { href: "/team", icona: "⚓", nome: "Team", ruoli: ["owner"], modulo: "comune" },
  { href: "/sicurezza", icona: "🔒", nome: "Sicurezza", ruoli: TUTTI, modulo: "comune" },
  { href: "/admin", icona: "✦", nome: "Aziende", ruoli: ["superadmin"], modulo: "comune" },
  { href: "/admin/contatti", icona: "✉", nome: "Messaggi", ruoli: ["superadmin"], modulo: "comune" },
  { href: "/admin/seo", icona: "🔎", nome: "SEO", ruoli: ["superadmin"], modulo: "comune" },
  { href: "/admin/backup", icona: "🗄", nome: "Backup", ruoli: ["superadmin"], modulo: "comune" },
];

// Pagine pubbliche: niente menù, niente intestazione.
const PUBBLICHE = ["/login", "/registrazione", "/verifica-email", "/paga", "/contratto", "/contratto-ormeggio"];

// Home del sito, pagine informative e anteprima: contenuto a tutta larghezza, senza menù del gestionale.
const SENZA_MENU = ["/chi-siamo", "/contatti", "/anteprima"];

export function ePaginaPubblica(path: string) {
  return PUBBLICHE.some((p) => path === p || path.startsWith(`${p}/`));
}

function ePaginaSito(path: string) {
  return path === "/" || SENZA_MENU.some((p) => path === p || path.startsWith(`${p}/`));
}

function vociVisibili(role: string | undefined, ormeggio: boolean, modulo: string | null) {
  if (!role) return [];
  const noleggioAttivo = !ormeggio || modulo === "entrambi";
  return VOCI.filter((v) => {
    if (!v.ruoli.includes(role)) return false;
    if (v.modulo === "noleggio") return noleggioAttivo;
    if (v.modulo === "ormeggio") return ormeggio;
    return true;
  });
}

export function NavLaterale({ chiuso, onChiudi }: { chiuso: boolean; onChiudi: () => void }) {
  const path = usePathname();
  const utente = useUtente();
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null);

  if (chiuso) {
    return (
      <button
        onClick={onChiudi}
        title="Mostra il menù"
        className="fixed left-2 top-3 z-40 grid h-9 w-9 place-items-center rounded-lg border border-line bg-white text-ocean shadow-sm"
      >
        ▶
      </button>
    );
  }

  return (
    <nav className="grid gap-1 text-sm">
      <div className="flex items-center justify-between px-1 pb-1">
        <span className="text-[11px] uppercase tracking-widest text-[#f3cba6]">Sezioni</span>
        <button onClick={onChiudi} title="Nascondi il menù" className="rounded-md px-2 py-0.5 text-[#ffe0c2] hover:bg-white/10 hover:text-white">
          ◀
        </button>
      </div>
      {voci.map((v) => {
        const attiva = path === v.href || path.startsWith(`${v.href}/`);
        return (
          <Link
            key={v.href}
            href={v.href}
            className={attiva ? "rounded-md bg-white/10 px-3 py-2 text-white" : "rounded-md px-3 py-2 text-[#ffe0c2] hover:bg-white/10 hover:text-white"}
          >
            {v.icona} {v.nome}
          </Link>
        );
      })}
    </nav>
  );
}

export function NavMobile() {
  const path = usePathname();
  const utente = useUtente();
  const [aperto, setAperto] = useState(false);
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null);
  const principali = voci.slice(0, 4);

  return (
    <>
      {aperto && (
        <div className="fixed inset-0 z-40 flex flex-col bg-deep p-4 text-white md:hidden">
          <div className="flex items-center justify-between pb-3">
            <span className="font-display font-extrabold">Tutte le sezioni</span>
            <button className="rounded-md bg-white/10 px-3 py-1 text-sm font-bold" onClick={() => setAperto(false)}>
              Chiudi ✕
            </button>
          </div>
          <nav className="grid gap-1 overflow-y-auto text-sm">
            {voci.map((v) => {
              const attiva = path === v.href || path.startsWith(`${v.href}/`);
              return (
                <Link
                  key={v.href}
                  href={v.href}
                  onClick={() => setAperto(false)}
                  className={attiva ? "rounded-md bg-white/15 px-3 py-2.5 text-white" : "rounded-md px-3 py-2.5 text-[#ffe0c2]"}
                >
                  {v.icona} {v.nome}
                </Link>
              );
            })}
          </nav>
        </div>
      )}

      <nav className="sticky bottom-0 z-30 grid grid-cols-5 border-t border-line bg-white py-2 text-center text-xs text-muted md:hidden">
        {principali.map((v) => {
          const attiva = path === v.href || path.startsWith(`${v.href}/`);
          return (
            <Link key={v.href} href={v.href} className={attiva ? "font-bold text-ocean" : ""}>
              {v.icona}
              <br />
              {v.nome.length > 9 ? `${v.nome.slice(0, 6)}.` : v.nome}
            </Link>
          );
        })}
        {voci.length > 4 ? (
          <button onClick={() => setAperto(true)} className={aperto ? "font-bold text-ocean" : ""}>
            ☰<br />Altro
          </button>
        ) : (
          <span />
        )}
      </nav>
    </>
  );
}

// Struttura della pagina: sulle pagine pubbliche mostra solo il contenuto.
export function Struttura({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const utente = useUtente();
  const [chiuso, setChiuso] = useState(false);

  useEffect(() => {
    setChiuso(localStorage.getItem("nb_menu_chiuso") === "1");
  }, []);

  const cambiaChiusura = (valore: boolean) => {
    setChiuso(valore);
    localStorage.setItem("nb_menu_chiuso", valore ? "1" : "0");
  };

  const esci = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    dimenticaUtente();
    window.location.href = "/login";
  };

  if (ePaginaSito(path)) {
    // Sito pubblico e anteprima: il contenuto porta la propria intestazione e il proprio piede.
    return <>{children}</>;
  }

  if (ePaginaPubblica(path)) {
    // Le pagine pubbliche sono centrate nella finestra. Il margine lo mettono le pagine stesse:
    // qui non va aggiunto, altrimenti si crea un'eccedenza e la pagina scorre inutilmente.
    return <div className="grid min-h-screen place-items-center">{children}</div>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className={chiuso ? "hidden" : "hidden w-[190px] flex-col bg-deep p-3 text-white md:flex"}>
        <div className="flex items-center gap-2 px-2 pb-4 pt-2 font-display font-extrabold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#ffd9a8]"><img src="/img/logo-naboat-scuro.png" alt="" className="h-5 w-auto" /></span>
          NaBoat
        </div>
        <NavLaterale chiuso={false} onChiudi={() => cambiaChiusura(true)} />
        <div className="mt-auto border-t border-white/10 p-2 text-xs text-[#f3cba6]">
          {utente?.tenantStatus && <div>{utente.tenantStatus.toUpperCase()}</div>}
          <div className="mt-1 flex items-center gap-2">
            {utente?.tenantLogo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={utente.tenantLogo} alt="" className="h-7 w-7 rounded-md bg-white object-contain p-0.5" />
            ) : (
              <span className="grid h-7 w-7 place-items-center rounded-md bg-white/15 font-bold text-white">
                {(utente?.tenantNome ?? utente?.email ?? "?").charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-white">{utente?.tenantNome ?? utente?.email ?? ""}</span>
          </div>
          <button
            onClick={esci}
            className="mt-3 w-full rounded-md border border-white/15 px-2 py-1.5 text-left font-bold text-[#ffe0c2] hover:bg-white/10 hover:text-white"
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
          <strong className="font-display">Gestionale</strong>
          <span className="flex items-center gap-2 text-sm text-muted">
            <span className="hidden truncate sm:inline">{utente?.email}</span>
            <span className="inline-grid h-7 w-7 place-items-center rounded-full bg-ocean text-[11px] text-white">
              {(utente?.nome ?? utente?.email ?? "?").charAt(0).toUpperCase()}
            </span>
            <button
              onClick={esci}
              className="rounded-md border border-line px-3 py-1.5 text-xs font-bold text-ocean hover:bg-foam"
            >
              Esci
            </button>
          </span>
        </header>
        <main className="p-5">{children}</main>
        <NavMobile />
      </div>
    </div>
  );
}
