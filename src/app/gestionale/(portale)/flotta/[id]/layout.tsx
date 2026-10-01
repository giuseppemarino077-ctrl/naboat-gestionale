"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { Avviso } from "@/components/ui/Avviso";
import { Caricamento } from "@/components/ui/Caricamento";

// Il modulo Flotta resta attivo anche nelle sottopagine della scheda barca.
export default function LayoutBarca({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const [nome, setNome] = useState<string | null>(null);
  const [errore, setErrore] = useState("");

  useEffect(() => {
    fetch(`/api/v1/boats/${id}`).then((r) => (r.ok ? r.json() : Promise.reject(new Error("404"))))
      .then((j) => setNome(j.nome))
      .catch(() => setErrore("Barca non trovata o non accessibile."));
  }, [id]);

  const voci = [
    { href: `/gestionale/flotta/${id}`, label: "Dati barca", exact: true },
    { href: `/gestionale/flotta/${id}/servizi`, label: "Servizi" },
    { href: `/gestionale/flotta/${id}/disponibilita`, label: "Periodi e blocchi" },
    { href: `/gestionale/flotta/${id}/stato`, label: "Disponibilità ed elimina" },
  ];
  const altre = [
    { href: `/gestionale/flotta/${id}/modalita`, label: "Modalità di noleggio" },
    { href: `/gestionale/flotta/${id}/prezzi`, label: "Prezzi" },
  ];
  const attivo = (href: string, exact?: boolean) => exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="grid gap-4">
      <div>
        <Link href="/gestionale/flotta" className="text-sm font-semibold text-ocean">← Torna alla flotta</Link>
        <h1 className="mt-2 font-display text-2xl font-bold text-ink">{nome ?? "Barca"}</h1>
      </div>

      {errore ? <Avviso tono="errore">{errore}</Avviso> : (
        <>
          <nav className="flex flex-wrap items-center gap-1 rounded-2xl border border-line bg-white p-1.5">
            {voci.map((v) => (
              <Link key={v.href} href={v.href} className={"rounded-xl px-3 py-2 text-sm font-semibold " + (attivo(v.href, v.exact) ? "bg-ocean text-white" : "text-ink hover:bg-foam")}>{v.label}</Link>
            ))}
            <details className="relative">
              <summary className={"cursor-pointer list-none rounded-xl px-3 py-2 text-sm font-semibold " + (altre.some((a) => attivo(a.href)) ? "bg-ocean text-white" : "text-ink hover:bg-foam")}>Altre impostazioni ▾</summary>
              <div className="absolute left-0 z-30 mt-1 min-w-[220px] rounded-xl border border-line bg-white p-1 shadow-lg">
                {altre.map((a) => <Link key={a.href} href={a.href} className="block rounded-lg px-3 py-2 text-sm hover:bg-foam">{a.label}</Link>)}
              </div>
            </details>
            <span className="mx-1 h-6 w-px bg-line" />
            <Link href={`/gestionale/flotta/${id}/foto`} className={"rounded-xl px-3 py-2 text-sm font-semibold " + (attivo(`/gestionale/flotta/${id}/foto`) ? "bg-ocean text-white" : "text-muted hover:bg-foam")}>Foto e pubblicazione</Link>
          </nav>
          {nome === null ? <Caricamento /> : children}
        </>
      )}
    </div>
  );
}
