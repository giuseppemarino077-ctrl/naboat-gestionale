import { prisma } from "@/lib/db";
import { HOME_PREDEFINITA } from "@/lib/sito";

export type ContenutiHome = {
  titolo: string;
  sottotitolo: string;
  immagine: string;
};

// Testi e foto della home del sito: modificabili dal pannello NaBoat.
// Se non personalizzati si usano quelli predefiniti (la foto ricade su quella dell'accesso).
export async function contenutiHome(): Promise<ContenutiHome> {
  const s = await prisma.platformSettings
    .findUnique({
      where: { id: "singleton" },
      select: { homeTitolo: true, homeSottotitolo: true, homeImmagine: true, loginImmagine: true },
    })
    .catch(() => null);

  return {
    titolo: s?.homeTitolo?.trim() || HOME_PREDEFINITA.titolo,
    sottotitolo: s?.homeSottotitolo?.trim() || HOME_PREDEFINITA.sottotitolo,
    immagine: s?.homeImmagine || s?.loginImmagine || HOME_PREDEFINITA.immagine,
  };
}
