import { fail, ok } from "@/lib/api";
import { requireAzienda } from "@/lib/tenant";

// Ricerca dei luoghi tramite Google Places API (New), eseguita SOLO sul server:
// la chiave non è mai esposta al client. Se la chiave non è configurata si
// risponde in modo esplicito (nessun risultato finto).
//
// Configurazione richiesta (ambiente server):
//   GOOGLE_MAPS_API_KEY=...   con "Places API (New)" abilitata.
// La chiave deve essere ristretta lato Google alle sole API necessarie (Places API New).
type Luogo = { placeId: string; nome: string; indirizzo: string | null; lat: number | null; lon: number | null };

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return ok({ configurato: true, luoghi: [] });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return ok({
      configurato: false,
      luoghi: [],
      messaggio: "Ricerca luoghi non configurata. L'amministratore deve impostare la variabile GOOGLE_MAPS_API_KEY e abilitare Places API (New).",
    });
  }

  try {
    const r = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        // Si richiedono solo i campi necessari (costi e attribuzioni).
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
      },
      body: JSON.stringify({ textQuery: q, languageCode: "it", regionCode: "IT", maxResultCount: 6 }),
      // Le sessioni di ricerca non vengono conservate: si richiede al momento.
      cache: "no-store",
    });
    if (!r.ok) {
      const dettaglio = await r.text().catch(() => "");
      return fail(`Ricerca luoghi non riuscita (${r.status}).${dettaglio ? "" : ""}`, 502);
    }
    const j = (await r.json()) as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }> };
    const luoghi: Luogo[] = (j.places ?? []).map((p) => ({
      placeId: p.id ?? "",
      nome: p.displayName?.text ?? "",
      indirizzo: p.formattedAddress ?? null,
      lat: p.location?.latitude ?? null,
      lon: p.location?.longitude ?? null,
    })).filter((l) => l.placeId && l.nome);
    return ok({ configurato: true, luoghi });
  } catch {
    return fail("Ricerca luoghi non raggiungibile", 502);
  }
}
