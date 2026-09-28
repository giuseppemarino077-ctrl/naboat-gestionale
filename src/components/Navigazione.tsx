"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useUtente, dimenticaUtente } from "@/components/Utente";

// Voci di navigazione, ognuna con i ruoli che possono vederla e il gruppo a cui appartiene.
// Il menù si adatta al ruolo e ai moduli attivi: niente voci che poi darebbero errore.
type Gruppo = "noleggio" | "ormeggio" | "gestione" | "naboat";
type Voce = { href: string; icona: string; nome: string; ruoli: string[]; modulo: "noleggio" | "ormeggio" | "comune"; gruppo: Gruppo };

const TUTTI = ["superadmin", "owner", "operatore", "skipper"];
const AZIENDA = ["owner", "operatore"];
const AZIENDA_E_SKIPPER = ["owner", "operatore", "skipper"];

const VOCI: Voce[] = [
  { href: "/oggi", icona: "⌂", nome: "Oggi", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/calendario", icona: "▦", nome: "Calendario", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/prenotazioni", icona: "☰", nome: "Prenotazioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/turni", icona: "⏱", nome: "Turni", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/meteo", icona: "☁", nome: "Meteo", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/flotta", icona: "⌁", nome: "Flotta", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/porti", icona: "⌖", nome: "Porti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/listino", icona: "⌸", nome: "Listino", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/manutenzione", icona: "⚙", nome: "Manutenzione", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/clienti", icona: "☷", nome: "Clienti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/pagamenti", icona: "€", nome: "Pagamenti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/resoconto", icona: "▤", nome: "Resoconto", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/ormeggio", icona: "⚓", nome: "Ormeggio", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/ormeggio/da-fare", icona: "☑", nome: "Da fare", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/ormeggio/movimenti", icona: "⇅", nome: "Movimenti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/ormeggio/conti", icona: "＄", nome: "Conti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio" },
  { href: "/registro", icona: "✎", nome: "Registro", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione" },
  { href: "/abbonamento", icona: "◷", nome: "Servizi NaBoat", ruoli: ["owner"], modulo: "comune", gruppo: "gestione" },
  { href: "/team", icona: "⚓", nome: "Team", ruoli: ["owner"], modulo: "comune", gruppo: "gestione" },
  { href: "/recensioni", icona: "★", nome: "Recensioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio" },
  { href: "/sicurezza", icona: "🔒", nome: "Sicurezza", ruoli: TUTTI, modulo: "comune", gruppo: "gestione" },
  { href: "/admin", icona: "✦", nome: "Aziende", ruoli: ["superadmin"], modulo: "comune", gruppo: "naboat" },
  { href: "/admin/contatti", icona: "✉", nome: "Messaggi", ruoli: ["superadmin"], modulo: "comune", gruppo: "naboat" },
  { href: "/admin/seo", icona: "🔎", nome: "SEO", ruoli: ["superadmin"], modulo: "comune", gruppo: "naboat" },
  { href: "/admin/backup", icona: "🗄", nome: "Backup", ruoli: ["superadmin"], modulo: "comune", gruppo: "naboat" },
];

const NOMI_GRUPPO: Record<Gruppo, string> = {
  noleggio: "Noleggio",
  ormeggio: "Ormeggio",
  gestione: "Gestione",
  naboat: "NaBoat",
};

// Pagine pubbliche: niente menù, niente intestazione.
const PUBBLICHE = ["/login", "/registrazione", "/verifica-email", "/password-dimenticata", "/reimposta-password", "/paga", "/contratto", "/contratto-ormeggio"];

// Home del sito, pagine informative e anteprima: contenuto a tutta larghezza, senza menù del gestionale.
const SENZA_MENU = ["/chi-siamo", "/contatti", "/anteprima", "/area", "/noleggia", "/per-noleggiatori", "/barca", "/azienda"];

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

function gruppi(voci: Voce[]) {
  const ordine: Gruppo[] = ["noleggio", "ormeggio", "gestione", "naboat"];
  return ordine
    .map((g) => ({ g, voci: voci.filter((v) => v.gruppo === g) }))
    .filter((x) => x.voci.length > 0);
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
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null);

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
            <VoceLink key={v.href} v={v} attiva={path === v.href || path.startsWith(`${v.href}/`)} />
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
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null);
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
                      (path === v.href || path.startsWith(`${v.href}/`) ? "bg-white/20 text-white" : "text-[#ffe0c2]")
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
          const attiva = path === v.href || path.startsWith(`${v.href}/`);
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
    return <>{children}</>;
  }

  if (ePaginaPubblica(path)) {
    return <div className="grid min-h-screen place-items-center">{children}</div>;
  }

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
          {utente?.role === "superadmin" && !path.startsWith("/admin") && (
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
