import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Meteo marino per le barche con coordinate. Usa Open-Meteo (gratuito, nessuna chiave).
// Restituisce vento e onde dei prossimi giorni, con un giudizio di sicurezza indicativo.
type GiornoMeteo = {
  data: string;
  ventoMaxKmh: number;
  rafficaMaxKmh: number;
  ondaMaxM: number | null;
  pioggiaMm: number;
  livello: "ok" | "attenzione" | "sconsigliato";
  motivo: string;
};

export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const boatId = q.get("boatId");

  const boats = await prisma.boat.findMany({
    where: { tenantId: t.tenantId, ...(boatId ? { id: boatId } : {}), lat: { not: null }, lon: { not: null } },
    select: { id: true, nome: true, lat: true, lon: true },
  });
  if (!boats.length) {
    return ok({ barche: [], messaggio: "Nessuna barca con coordinate impostate: aggiungile in Flotta." });
  }

  const risultati = [];
  for (const b of boats) {
    try {
      const url =
        `https://api.open-meteo.com/v1/forecast?latitude=${b.lat}&longitude=${b.lon}` +
        `&daily=wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum&timezone=Europe%2FRome&forecast_days=7`;
      const marino =
        `https://marine-api.open-meteo.com/v1/marine?latitude=${b.lat}&longitude=${b.lon}` +
        `&daily=wave_height_max&timezone=Europe%2FRome&forecast_days=7`;

      const [aria, mare] = await Promise.all([
        fetch(url, { next: { revalidate: 1800 } }).then((r) => (r.ok ? r.json() : null)),
        fetch(marino, { next: { revalidate: 1800 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);

      const giorni: GiornoMeteo[] = [];
      const date: string[] = aria?.daily?.time ?? [];
      for (let i = 0; i < date.length; i++) {
        const ventoMaxKmh = aria?.daily?.wind_speed_10m_max?.[i] ?? 0;
        const rafficaMaxKmh = aria?.daily?.wind_gusts_10m_max?.[i] ?? 0;
        const pioggiaMm = aria?.daily?.precipitation_sum?.[i] ?? 0;
        const ondaMaxM = mare?.daily?.wave_height_max?.[i] ?? null;

        let livello: GiornoMeteo["livello"] = "ok";
        const motivi: string[] = [];
        if (ventoMaxKmh >= 35 || rafficaMaxKmh >= 50 || (ondaMaxM ?? 0) >= 1.5) livello = "sconsigliato";
        else if (ventoMaxKmh >= 22 || rafficaMaxKmh >= 35 || (ondaMaxM ?? 0) >= 1) livello = "attenzione";
        if (ventoMaxKmh >= 22) motivi.push(`vento ${Math.round(ventoMaxKmh)} km/h`);
        if ((ondaMaxM ?? 0) >= 1) motivi.push(`onde ${ondaMaxM} m`);
        if (pioggiaMm >= 10) motivi.push(`pioggia ${Math.round(pioggiaMm)} mm`);

        giorni.push({
          data: date[i],
          ventoMaxKmh: Math.round(ventoMaxKmh),
          rafficaMaxKmh: Math.round(rafficaMaxKmh),
          ondaMaxM: ondaMaxM === null ? null : Math.round(ondaMaxM * 10) / 10,
          pioggiaMm: Math.round(pioggiaMm * 10) / 10,
          livello,
          motivo: motivi.join(", ") || "condizioni buone",
        });
      }
      risultati.push({ boatId: b.id, barca: b.nome, giorni });
    } catch {
      risultati.push({ boatId: b.id, barca: b.nome, giorni: [], errore: "Meteo non raggiungibile" });
    }
  }

  return ok({ barche: risultati });
}
