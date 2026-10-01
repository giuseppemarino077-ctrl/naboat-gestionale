"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useUtente, dimenticaUtente } from "@/components/Utente";
import { aziendaNonAttiva, percorsoConsentitoInAttesa } from "@/lib/accesso";
import { Icona, type NomeIcona } from "@/components/ui/Icona";

type Modulo = "noleggio" | "ormeggio" | "comune";
type Gruppo = "noleggio" | "ormeggio" | "marketplace" | "gestione";
type Voce = {
  href: string;
  icona: NomeIcona;
  nome: string;
  ruoli: string[];
  modulo: Modulo;
  gruppo: Gruppo;
  primaria: boolean;
};

const AZIENDA = ["owner", "operatore"];
const AZIENDA_E_SKIPPER = ["owner", "operatore", "skipper"];

const VOCI: Voce[] = [
  { href: "/gestionale/oggi", icona: "casa", nome: "Oggi", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/calendario", icona: "calendario", nome: "Calendario", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/prenotazioni", icona: "lista", nome: "Prenotazioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/flotta", icona: "barca", nome: "Flotta", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/clienti", icona: "clienti", nome: "Clienti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/economia", icona: "euro", nome: "Economia", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: true },
  { href: "/gestionale/turni", icona: "orologio", nome: "Turni", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: false },
  { href: "/gestionale/meteo", icona: "meteo", nome: "Meteo", ruoli: AZIENDA_E_SKIPPER, modulo: "noleggio", gruppo: "noleggio", primaria: false },
  { href: "/gestionale/manutenzione", icona: "manutenzione", nome: "Manutenzione", ruoli: AZIENDA, modulo: "noleggio", gruppo: "noleggio", primaria: false },

  { href: "/gestionale/ormeggio", icona: "moduli", nome: "Quadro posti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/da-fare", icona: "checklist", nome: "Attività", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/movimenti", icona: "movimenti", nome: "Movimenti", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/proprietari", icona: "utente", nome: "Proprietari", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/conti", icona: "portafoglio", nome: "Economia", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: true },
  { href: "/gestionale/ormeggio/configurazione", icona: "ingranaggio", nome: "Configurazione", ruoli: AZIENDA, modulo: "ormeggio", gruppo: "ormeggio", primaria: false },

  { href: "/gestionale/marketplace", icona: "occhio", nome: "Presenza e richieste", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: true },
  { href: "/gestionale/recensioni", icona: "stella", nome: "Recensioni", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: true },
  { href: "/gestionale/impostazioni/porti", icona: "pin", nome: "Porti", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: false },
  { href: "/gestionale/impostazioni/listino", icona: "etichetta", nome: "Listino", ruoli: AZIENDA, modulo: "noleggio", gruppo: "marketplace", primaria: false },

  { href: "/gestionale/registro", icona: "registro", nome: "Registro", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni/piano", icona: "pacchetto", nome: "Servizi NaBoat", ruoli: ["owner"], modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni/team", icona: "utente", nome: "Team", ruoli: ["owner"], modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni", icona: "ingranaggio", nome: "Impostazioni", ruoli: AZIENDA, modulo: "comune", gruppo: "gestione", primaria: false },
  { href: "/gestionale/impostazioni/sicurezza", icona: "scudo", nome: "Sicurezza", ruoli: AZIENDA_E_SKIPPER, modulo: "comune", gruppo: "gestione", primaria: false },
];

const NOMI_GRUPPO: Record<Gruppo, string> = {
  noleggio: "Noleggio",
  ormeggio: "Ormeggio",
  marketplace: "Marketplace",
  gestione: "Gestione",
};

const EQUIVALENZE: { chiave: string; noleggio: string; ormeggio: string }[] = [
  { chiave: "/gestionale/oggi", noleggio: "/gestionale/oggi", ormeggio: "/gestionale/ormeggio" },
  { chiave: "/gestionale/calendario", noleggio: "/gestionale/calendario", ormeggio: "/gestionale/ormeggio" },
  { chiave: "/gestionale/prenotazioni", noleggio: "/gestionale/prenotazioni", ormeggio: "/gestionale/ormeggio/da-fare" },
  { chiave: "/gestionale/flotta", noleggio: "/gestionale/flotta", ormeggio: "/gestionale/ormeggio/proprietari" },
  { chiave: "/gestionale/clienti", noleggio: "/gestionale/clienti", ormeggio: "/gestionale/ormeggio/proprietari" },
  { chiave: "/gestionale/economia", noleggio: "/gestionale/economia", ormeggio: "/gestionale/ormeggio/conti" },
];

function vociVisibili(role: string | undefined, ormeggio: boolean, modulo: string | null, statoAzienda?: string | null) {
  if (!role) return [];
  if (aziendaNonAttiva(statoAzienda)) return VOCI.filter((v) => v.href === "/gestionale/impostazioni/sicurezza");
  const noleggioAttivo = !ormeggio || modulo === "entrambi";
  return VOCI.filter((v) => {
    if (!v.ruoli.includes(role)) return false;
    if (v.modulo === "noleggio") return noleggioAttivo;
    if (v.modulo === "ormeggio") return ormeggio;
    return true;
  });
}

function moduloAttivo(path: string): "noleggio" | "ormeggio" {
  return path.startsWith("/gestionale/ormeggio") ? "ormeggio" : "noleggio";
}

function voceAttiva(path: string, href: string) {
  if (href === "/gestionale/impostazioni") return path === href;
  return path === href || path.startsWith(`${href}/`);
}

function VoceLink({
  v,
  attiva,
  onClick,
  compatto = false,
}: {
  v: Voce;
  attiva: boolean;
  onClick?: () => void;
  compatto?: boolean;
}) {
  return (
    <Link
      href={v.href}
      onClick={onClick}
      aria-current={attiva ? "page" : undefined}
      className={
        "flex items-center gap-2.5 rounded-xl px-3 py-2 transition " +
        (compatto ? "" : "text-sm ") +
        (attiva ? "bg-white/15 font-semibold text-white shadow-inner" : "text-[#ffe0c2] hover:bg-white/10 hover:text-white")
      }
    >
      <Icona nome={v.icona} className="h-[18px] w-[18px] shrink-0" />
      <span className="truncate">{v.nome}</span>
    </Link>
  );
}

function GruppoVoci({
  gruppo,
  lista,
  path,
  onNavigate,
  scuro = true,
}: {
  gruppo: Gruppo;
  lista: Voce[];
  path: string;
  onNavigate?: () => void;
  scuro?: boolean;
}) {
  const [mostraAltre, setMostraAltre] = useState(false);
  const primarie = lista.filter((v) => v.primaria);
  const secondarie = lista.filter((v) => !v.primaria);
  if (lista.length === 0) return null;
  return (
    <div className="grid gap-0.5">
      <p className={"px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest " + (scuro ? "text-[#f3cba6]" : "text-muted")}>
        {NOMI_GRUPPO[gruppo]}
      </p>
      {primarie.map((v) => (
        <VoceLink key={v.href} v={v} attiva={voceAttiva(path, v.href)} onClick={onNavigate} />
      ))}
      {secondarie.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={mostraAltre}
            onClick={() => setMostraAltre((x) => !x)}
            className={
              "flex items-center gap-2.5 rounded-xl px-3 py-2 text-left text-sm transition " +
              (scuro ? "text-[#ffe0c2] hover:bg-white/10 hover:text-white" : "text-ocean hover:bg-foam")
            }
          >
            <Icona nome={mostraAltre ? "freccia-giu" : "freccia-destra"} className="h-[18px] w-[18px] shrink-0" />
            <span>Altre funzioni</span>
            <span className="ml-auto rounded-full bg-white/15 px-1.5 text-[11px] font-bold">{secondarie.length}</span>
          </button>
          {mostraAltre && <div className="ml-3 grid gap-0.5 border-l border-white/15 pl-1">{secondarie.map((v) => (
            <VoceLink key={v.href} v={v} attiva={voceAttiva(path, v.href)} onClick={onNavigate} />
          ))}</div>}
        </>
      )}
    </div>
  );
}

function SelettoreModulo({
  attivo,
  onChange,
}: {
  attivo: "noleggio" | "ormeggio";
  onChange: (m: "noleggio" | "ormeggio") => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 rounded-2xl bg-black/20 p-1" role="group" aria-label="Modulo">
      {(["noleggio", "ormeggio"] as const).map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={attivo === m}
          onClick={() => onChange(m)}
          className={
            "flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition " +
            (attivo === m ? "bg-white text-deep shadow" : "text-white/80 hover:bg-white/10 hover:text-white")
          }
        >
          <Icona nome={m === "noleggio" ? "barca" : "ancora"} className="h-4 w-4" />
          {m === "noleggio" ? "Noleggio" : "Ormeggio"}
        </button>
      ))}
    </div>
  );
}

function LinkSitoPubblico({ scuro = true, onClick }: { scuro?: boolean; onClick?: () => void }) {
  return (
    <a
      href="/"
      target="_blank"
      rel="noreferrer"
      onClick={onClick}
      className={
        "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-semibold transition " +
        (scuro ? "text-[#ffe0c2] hover:bg-white/10 hover:text-white" : "text-ocean hover:bg-foam")
      }
    >
      <Icona nome="esterno" className="h-[18px] w-[18px] shrink-0" />
      Apri sito pubblico
    </a>
  );
}

// Navigazione laterale permanente: nessuna chiusura, nessuna modalità a sole icone.
export function NavLaterale() {
  const path = usePathname();
  const router = useRouter();
  const utente = useUtente({ redirect: true });
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null, utente?.tenantStatus);
  const entrambi = !!utente?.tenantOrmeggio && utente?.tenantModulo === "entrambi";
  const attivo = moduloAttivo(path);

  const cambiaModulo = (dest: "noleggio" | "ormeggio") => {
    const eq = EQUIVALENZE.find((e) => path === e.chiave || path.startsWith(`${e.chiave}/`));
    const destinazione = eq ? eq[dest] : dest === "ormeggio" ? "/gestionale/ormeggio" : "/gestionale/oggi";
    localStorage.setItem("nb_modulo", dest);
    router.push(destinazione);
  };

  const gruppiVisibili: Gruppo[] = ["noleggio", "ormeggio", "marketplace", "gestione"].filter((g) => {
    if (g === "noleggio") return attivo === "noleggio";
    if (g === "ormeggio") return attivo === "ormeggio";
    return true;
  }) as Gruppo[];

  return (
    <nav className="grid gap-1 pb-2" aria-label="Sezioni del gestionale">
      {entrambi && (
        <div className="mb-2">
          <SelettoreModulo attivo={attivo} onChange={cambiaModulo} />
        </div>
      )}
      {gruppiVisibili.map((g) => (
        <GruppoVoci key={g} gruppo={g} lista={voci.filter((v) => v.gruppo === g)} path={path} />
      ))}
      <div className="mt-1 border-t border-white/10 pt-1">
        <LinkSitoPubblico />
      </div>
    </nav>
  );
}

// Variante permanente per schermi piccoli: barra di sezioni sempre visibile e
// scorrevole, senza menu a scomparsa. Nessun comando di chiusura.
export function NavOrizzontale() {
  const path = usePathname();
  const router = useRouter();
  const utente = useUtente({ redirect: true });
  const voci = vociVisibili(utente?.role, utente?.tenantOrmeggio ?? false, utente?.tenantModulo ?? null, utente?.tenantStatus);
  const entrambi = !!utente?.tenantOrmeggio && utente?.tenantModulo === "entrambi";
  const attivo = moduloAttivo(path);
  const gruppiVisibili: Gruppo[] = ["noleggio", "ormeggio", "marketplace", "gestione"].filter((g) => {
    if (g === "noleggio") return attivo === "noleggio";
    if (g === "ormeggio") return attivo === "ormeggio";
    return true;
  }) as Gruppo[];

  const cambiaModulo = (dest: "noleggio" | "ormeggio") => {
    const eq = EQUIVALENZE.find((e) => path === e.chiave || path.startsWith(`${e.chiave}/`));
    const destinazione = eq ? eq[dest] : dest === "ormeggio" ? "/gestionale/ormeggio" : "/gestionale/oggi";
    localStorage.setItem("nb_modulo", dest);
    router.push(destinazione);
  };

  return (
    <nav className="sticky top-0 z-30 border-b border-line bg-gradient-to-r from-[#9a3412] to-[#7a2a10] text-white md:hidden" aria-label="Sezioni del gestionale">
      {entrambi && <div className="px-3 pt-2"><SelettoreModulo attivo={attivo} onChange={cambiaModulo} /></div>}
      <div className="flex gap-3 overflow-x-auto px-3 py-2">
        {gruppiVisibili.map((g) => (
          <div key={g} className="flex shrink-0 items-center gap-1.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#f3cba6]">{NOMI_GRUPPO[g]}</span>
            {voci.filter((v) => v.gruppo === g).map((v) => {
              const attiva = voceAttiva(path, v.href);
              return (
                <Link
                  key={v.href}
                  href={v.href}
                  aria-current={attiva ? "page" : undefined}
                  className={"flex min-h-[40px] items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold " + (attiva ? "bg-white text-deep shadow" : "bg-white/10 text-[#ffe0c2]")}
                >
                  <Icona nome={v.icona} className="h-4 w-4" />
                  {v.nome}
                </Link>
              );
            })}
          </div>
        ))}
      </div>
    </nav>
  );
}

export function StrutturaGestionale({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const utente = useUtente({ redirect: true });

  useEffect(() => {
    // Neutralizza eventuali preferenze legacy di sidebar chiusa.
    localStorage.removeItem("nb_menu_chiuso");
  }, []);

  useEffect(() => {
    if (utente && aziendaNonAttiva(utente.tenantStatus) && !percorsoConsentitoInAttesa(path)) {
      window.location.href = "/gestionale/stato";
    }
  }, [utente, path]);

  const esci = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    dimenticaUtente();
    window.location.href = "/gestionale/accesso";
  };

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[228px] shrink-0 flex-col bg-gradient-to-b from-[#9a3412] to-[#7a2a10] p-3 text-white md:flex">
        <div className="flex items-center px-2 pb-3 pt-2">
          <div className="flex items-center gap-2 font-display font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-[#ffd9a8]"><img src="/img/logo-naboat-scuro.png" alt="" className="h-5 w-auto" /></span>
            NaBoat
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <NavLaterale />
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
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 font-bold text-[#ffe0c2] hover:bg-white/20 hover:text-white"
          >
            <Icona nome="uscita" className="h-4 w-4" /> Esci
          </button>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <NavOrizzontale />
        <header className="flex h-[67px] items-center justify-between gap-3 border-b border-line bg-white px-4 sm:px-5">
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
        <main className="p-4 sm:p-5">
          {utente?.role === "superadmin" && (
            <div className="mb-4 rounded-2xl border border-gold/50 bg-warn-soft p-3 text-sm font-semibold text-warn">
              Sei <b>NaBoat (superadmin)</b>: il gestionale mostra i dati di un'azienda solo selezionandola. Le aziende e i servizi si gestiscono da <a className="underline" href="/admin">Admin</a>. Per provare il gestionale accedi con un account aziendale (es. <b>titolare@demo.naboat.it</b>).
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}
