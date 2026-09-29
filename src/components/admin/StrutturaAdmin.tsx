"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUtente, dimenticaUtente } from "@/components/Utente";

// Pannello NaBoat: contenitore autonomo, separato dal gestionale delle aziende.
// Accesso riservato al superadmin (i controlli veri restano nelle API).
const VOCI = [
  { href: "/admin", nome: "Aziende" },
  { href: "/admin/clienti", nome: "Clienti" },
  { href: "/admin/barche", nome: "Barche" },
  { href: "/admin/patenti", nome: "Patenti" },
  { href: "/admin/catalogo", nome: "Catalogo" },
  { href: "/admin/recensioni", nome: "Recensioni" },
  { href: "/admin/piani", nome: "Piani" },
  { href: "/admin/contatti", nome: "Messaggi" },
  { href: "/admin/seo", nome: "SEO" },
  { href: "/admin/backup", nome: "Backup" },
];

export function StrutturaAdmin({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const utente = useUtente({ redirect: true });

  const esci = async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" }).catch(() => {});
    dimenticaUtente();
    window.location.href = "/gestionale/accesso";
  };

  return (
    <div className="min-h-screen bg-[#f7f4ee] text-ink">
      <header className="border-b border-line bg-deep text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-display font-extrabold">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-white/15">
              <img src="/img/logo-naboat-bianco.png" alt="" className="h-5 w-auto" />
            </span>
            NaBoat · Admin
          </Link>
          <div className="flex items-center gap-3 text-xs text-white/70">
            <span className="hidden sm:inline">{utente?.email}</span>
            <button onClick={esci} className="rounded-full bg-white/15 px-3 py-1.5 font-bold text-white hover:bg-white/25">
              Esci
            </button>
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl flex-wrap gap-1 px-3 pb-2 text-sm">
          {VOCI.map((v) => {
            const attiva = v.href === "/admin" ? path === "/admin" : path === v.href || path.startsWith(`${v.href}/`);
            return (
              <Link
                key={v.href}
                href={v.href}
                className={
                  "rounded-full px-3 py-1.5 font-semibold transition " +
                  (attiva ? "bg-white/20 text-white" : "text-[#ffe0c2] hover:bg-white/10 hover:text-white")
                }
              >
                {v.nome}
              </Link>
            );
          })}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl p-5">{children}</main>
    </div>
  );
}
