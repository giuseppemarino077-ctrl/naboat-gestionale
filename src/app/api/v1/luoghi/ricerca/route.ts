import { fail, ok } from "@/lib/api";
import { requireAzienda } from "@/lib/tenant";

// Ricerca dei luoghi usata da meteo, sedi e porti. Google Places API (New) è
// eseguita SOLO sul server (la chiave non è mai esposta al client) e si usa
// quando GOOGLE_MAPS_API_KEY è configurata. Senza chiave si ricade sul
// geocoding gratuito di Open-Meteo: nessuna configurazione richiesta.
type Luogo = { placeId: string; nome: string; indirizzo: string | null; lat: number | null; lon: number | null };

export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return ok({ configurato: true, luoghi: [] });

  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
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
        cache: "no-store",
      });
      if (!r.ok) return fail(`Ricerca luoghi non riuscita (${r.status}).`, 502);
      const j = (await r.json()) as { places?: Array<{ id?: string; displayName?: { text?: string }; formattedAddress?: string; location?: { latitude?: number; longitude?: number } }> };
      const luoghi: Luogo[] = (j.places ?? []).map((p) => ({
        placeId: p.id ?? "",
        nome: p.displayName?.text ?? "",
        indirizzo: p.formattedAddress ?? null,
        lat: p.location?.latitude ?? null,
        lon: p.location?.longitude ?? null,
      })).filter((l) => l.placeId && l.nome);
      return ok({ configurato: true, provider: "google", luoghi });
    } catch {
      return fail("Ricerca luoghi non raggiungibile", 502);
    }
  }

  return ok({ configurato: true, provider: "open-meteo", luoghi: await ricercaOpenMeteo(q) });
}

// Geocoding gratuito (Open-Meteo): nessuna chiave. I risultati italiani hanno
// precedenza perché è l'uso prevalente (porti e basi operative).
async function ricercaOpenMeteo(q: string): Promise<Luogo[]> {
  try {
    const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=it&format=json`;
    const r = await fetch(url, { next: { revalidate: 86400 } });
    if (!r.ok) return [];
    const j = (await r.json()) as { results?: Array<{ id?: number; name?: string; admin1?: string; country?: string; country_code?: string; latitude?: number; longitude?: number }> };
    return (j.results ?? [])
      .map((r) => ({
        placeId: r.id != null ? `om:${r.id}` : "",
        nome: r.name ?? "",
        indirizzo: [r.admin1, r.country].filter(Boolean).join(", ") || null,
        lat: r.latitude ?? null,
        lon: r.longitude ?? null,
        _it: r.country_code === "IT",
      }))
      .filter((l) => l.placeId && l.nome)
      .sort((a, b) => Number(b._it) - Number(a._it))
      .map(({ _it, ...l }) => l);
  } catch {
    return [];
  }
}
