import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { MANUTENZIONE_PREDEFINITA } from "@/lib/sito";

export type StatoManutenzione = {
  attiva: boolean;
  titolo: string;
  testo: string;
  immagine: string;
};

// Portale in manutenzione: i visitatori vedono solo il messaggio, chi ha già una sessione
// valida (NaBoat o un'azienda) vede il sito normale.
export async function statoManutenzione(): Promise<StatoManutenzione> {
  const [s, sessione] = await Promise.all([
    prisma.platformSettings
      .findUnique({
        where: { id: "singleton" },
        select: { manutenzioneAttiva: true, manutenzioneTitolo: true, manutenzioneTesto: true, homeImmagine: true, loginImmagine: true },
      })
      .catch(() => null),
    getSession().catch(() => null),
  ]);

  return {
    attiva: s?.manutenzioneAttiva === true && !sessione,
    titolo: s?.manutenzioneTitolo?.trim() || MANUTENZIONE_PREDEFINITA.titolo,
    testo: s?.manutenzioneTesto?.trim() || MANUTENZIONE_PREDEFINITA.testo,
    immagine: s?.homeImmagine || s?.loginImmagine || MANUTENZIONE_PREDEFINITA.immagine,
  };
}
