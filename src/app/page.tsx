import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { HomePubblica } from "@/components/sito/HomePubblica";
import { Manutenzione } from "@/components/sito/Manutenzione";
import { contenutiHome } from "@/lib/home";
import { barcheInEvidenza, numeriPiattaforma } from "@/lib/marketplace";
import { statoManutenzione } from "@/lib/manutenzione";
import { contestoSito } from "@/lib/sito-server";

export const metadata: Metadata = {
  title: "Noleggio imbarcazioni a Napoli, la barca giusta senza pensieri",
  description:
    "Noleggio imbarcazioni a Napoli, Capri, Ischia, Procida e Salerno: trova l'azienda giusta, confronta le barche e prenota con prezzi chiari e pagamenti sicuri.",
  robots: { index: true, follow: true },
};

// Sul dominio del sito (naboat.it) si apre la home pubblica.
// Sul portale (app.naboat.it) si va dritti al gestionale, come sempre.
export default async function PaginaIniziale() {
  const { sulSito, appBase } = await contestoSito();
  if (!sulSito) redirect("/oggi");

  // Con il portale in manutenzione i visitatori vedono solo il messaggio:
  // chi ha già una sessione (NaBoat o aziende) vede il sito normale.
  const man = await statoManutenzione();
  if (man.attiva) return <Manutenzione titolo={man.titolo} testo={man.testo} immagine={man.immagine} appBase={appBase} />;

  const contenuti = await contenutiHome();
  const [numeri, evidenza] = await Promise.all([numeriPiattaforma(), barcheInEvidenza(6)]);
  return <HomePubblica appBase={appBase} contenuti={contenuti} numeri={numeri} evidenza={evidenza} />;
}
