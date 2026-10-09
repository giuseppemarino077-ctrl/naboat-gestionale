"use client";
import { useUtente } from "@/components/Utente";
import { useProdottoAttivo } from "@/modules/piattaforma/use-prodotto";
import { ProfiloAzienda } from "@/modules/piattaforma/components/ProfiloAzienda";
import ProfiloPubblico from "@/modules/noleggio/views/impostazioni/profilo";

export default function ImpostazioniPage() {
  const utente = useUtente({ redirect: true });
  const prodotto = useProdottoAttivo(utente);
  if (!utente) return <p className="text-sm text-muted">Caricamento…</p>;
  return prodotto === "ormeggio" ? <ProfiloAzienda /> : <ProfiloPubblico />;
}
