"use client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { prodottoDalPercorso } from "@/modules/piattaforma/prodotti";

export function useProdottoAttivo(utente: { tenantOrmeggio?: boolean; tenantModulo?: string | null } | null) {
  const path = usePathname();
  const entrambi = !!utente?.tenantOrmeggio && utente?.tenantModulo === "entrambi";
  const dalPercorso = prodottoDalPercorso(path);
  const [scelto, setScelto] = useState<"noleggio" | "ormeggio">(dalPercorso ?? "noleggio");

  useEffect(() => {
    if (!entrambi) return;
    if (dalPercorso) {
      setScelto(dalPercorso);
      localStorage.setItem("nb_modulo", dalPercorso);
      return;
    }
    const salvato = localStorage.getItem("nb_modulo");
    if (salvato === "noleggio" || salvato === "ormeggio") setScelto(salvato);
  }, [path, dalPercorso, entrambi]);

  if (!utente?.tenantOrmeggio) return "noleggio";
  if (!entrambi) return "ormeggio";
  return dalPercorso ?? scelto;
}
