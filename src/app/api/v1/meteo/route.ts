import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Meteo marino. Il luogo deriva da: porto della barca (se localizzato) → sede
// operativa dell'azienda. L'operatore non inserisce coordinate. Provider: Open-Meteo.
type GiornoMeteo = {
  data: string;
  ventoMaxKmh: number;
  rafficaMaxKmh: number;
  ondaMaxM: number | null;
  pioggiaMm: number;
  livello: "ok" | "attenzione" | "sconsigliato";
  motivo: string;
};

type Luogo = { nome: string; lat: number; lon: number };

async function previsione(lat: number, lon: number): Promise<GiornoMeteo[]> {
  const aria_url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=wind_speed_10m_max,wind_gusts_10m_max,precipitation_sum&timezone=Europe%2FRome&forecast_days=7`;
  const mare_url =
    `https://marine-api.open-meteo.com/v1/marine?latitude=${lat}&longitude=${lon}` +
    `&daily=wave_height_max&timezone=Europe%2FRome&forecast_days=7`;
  const [aria, mare] = await Promise.all([
    fetch(aria_url, { next: { revalidate: 1800 } }).then((r) => (r.ok ? r.json() : null)),
    fetch(mare_url, { next: { revalidate: 1800 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
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
  return giorni;
}

export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const boatId = q.get("boatId");
  const portoId = q.get("portoId");

  const tenant = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { sedeOperativaNome: true, sedeOperativaLat: true, sedeOperativaLon: true },
  });
  const sede: Luogo | null = tenant?.sedeOperativaLat != null && tenant?.sedeOperativaLon != null
    ? { nome: tenant.sedeOperativaNome ?? "Sede operativa", lat: tenant.sedeOperativaLat, lon: tenant.sedeOperativaLon }
    : null;

  // Selezione esplicita di un porto: una sola previsione per quel luogo.
  if (portoId) {
    const porto = await prisma.porto.findFirst({ where: { id: portoId, tenantId: t.tenantId }, select: { nome: true, lat: true, lon: true } });
    if (!porto || porto.lat == null || porto.lon == null) {
      return ok({ luoghi: [], messaggio: "Il porto selezionato non ha una località impostata.", serveLocalita: true });
    }
    const luogo: Luogo = { nome: porto.nome, lat: porto.lat, lon: porto.lon };
    const giorni = await previsione(luogo.lat, luogo.lon).catch(() => []);
    return ok({ luoghi: [{ ...luogo, giorni, aggiornatoAt: new Date().toISOString() }] });
  }

  const boats = await prisma.boat.findMany({
    where: { tenantId: t.tenantId, uso: "noleggio", ...(boatId ? { id: boatId } : {}) },
    select: { id: true, nome: true, lat: true, lon: true, porto: { select: { nome: true, lat: true, lon: true } } },
  });

  const risultati: Array<{ boatId?: string; barca?: string; nome: string; lat: number; lon: number; giorni: GiornoMeteo[]; aggiornatoAt: string; errore?: string }> = [];
  for (const b of boats) {
    // Priorità: porto della barca localizzato → coordinate proprie della barca → sede operativa.
    const luogo: Luogo | null =
      b.porto && b.porto.lat != null && b.porto.lon != null
        ? { nome: b.porto.nome, lat: b.porto.lat, lon: b.porto.lon }
        : b.lat != null && b.lon != null
          ? { nome: b.nome, lat: b.lat, lon: b.lon }
          : sede;
    if (!luogo) continue;
    try {
      const giorni = await previsione(luogo.lat, luogo.lon);
      risultati.push({ boatId: b.id, barca: b.nome, nome: luogo.nome, lat: luogo.lat, lon: luogo.lon, giorni, aggiornatoAt: new Date().toISOString() });
    } catch {
      risultati.push({ boatId: b.id, barca: b.nome, nome: luogo.nome, lat: luogo.lat, lon: luogo.lon, giorni: [], aggiornatoAt: new Date().toISOString(), errore: "Meteo non raggiungibile" });
    }
  }

  // Nessuna barca: la sede operativa da sola basta.
  if (!boats.length && sede) {
    const giorni = await previsione(sede.lat, sede.lon).catch(() => []);
    risultati.push({ nome: sede.nome, lat: sede.lat, lon: sede.lon, giorni, aggiornatoAt: new Date().toISOString() });
  }

  if (!risultati.length) {
    return ok({ luoghi: [], messaggio: "Imposta la località dell'attività per vedere la previsione.", serveLocalita: true });
  }
  return ok({ luoghi: risultati });
}
