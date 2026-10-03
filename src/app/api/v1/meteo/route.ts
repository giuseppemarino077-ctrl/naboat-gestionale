import { ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenant";

// Meteo marino della BASE del noleggio: una sola previsione, non una per barca.
// Il luogo è la sede operativa dell'azienda; se assente si ricade sulla prima
// barca del noleggio con un porto o coordinate proprie. Se è selezionato un
// porto, la previsione è quella del porto. Provider: Open-Meteo.
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
    if (rafficaMaxKmh >= 35) motivi.push(`raffiche ${Math.round(rafficaMaxKmh)} km/h`);
    if ((ondaMaxM ?? 0) >= 1) motivi.push(`onde ${ondaMaxM} m`);
    if (pioggiaMm >= 10) motivi.push(`pioggia ${Math.round(pioggiaMm)} mm`);
    giorni.push({
      data: date[i],
      ventoMaxKmh: Math.round(ventoMaxKmh),
      rafficaMaxKmh: Math.round(rafficaMaxKmh),
      ondaMaxM: ondaMaxM === null ? null : Math.round(ondaMaxM * 10) / 10,
      pioggiaMm: Math.round(pioggiaMm * 10) / 10,
      livello,
      motivo: motivi.join(", ") || (livello === "ok" ? "condizioni buone" : "condizioni da valutare"),
    });
  }
  return giorni;
}

export async function GET(req: Request) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const q = new URL(req.url).searchParams;
  const portoId = q.get("portoId");

  // Porto scelto esplicitamente: la previsione è quella del porto.
  if (portoId) {
    const porto = await prisma.porto.findFirst({ where: { id: portoId, tenantId: t.tenantId }, select: { nome: true, lat: true, lon: true } });
    if (!porto || porto.lat == null || porto.lon == null) {
      return ok({ luoghi: [], messaggio: "Il porto selezionato non ha una località impostata." });
    }
    const giorni = await previsione(porto.lat, porto.lon).catch(() => []);
    return ok({ luoghi: [{ nome: porto.nome, lat: porto.lat, lon: porto.lon, giorni, aggiornatoAt: new Date().toISOString() }] });
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { sedeOperativaNome: true, sedeOperativaLat: true, sedeOperativaLon: true },
  });

  let base: Luogo | null = tenant?.sedeOperativaLat != null && tenant?.sedeOperativaLon != null
    ? { nome: tenant.sedeOperativaNome ?? "Base operativa", lat: tenant.sedeOperativaLat, lon: tenant.sedeOperativaLon }
    : null;

  // Nessuna base impostata: si usa la prima barca del noleggio localizzata
  // (porto della barca oppure coordinate proprie), così la pagina non resta vuota.
  if (!base) {
    const b = await prisma.boat.findFirst({
      where: { tenantId: t.tenantId, uso: "noleggio" },
      orderBy: { nome: "asc" },
      select: { nome: true, lat: true, lon: true, porto: { select: { nome: true, lat: true, lon: true } } },
    });
    if (b?.porto?.lat != null && b.porto.lon != null) base = { nome: b.porto.nome, lat: b.porto.lat, lon: b.porto.lon };
    else if (b?.lat != null && b.lon != null) base = { nome: b.nome, lat: b.lat, lon: b.lon };
  }

  if (!base) {
    return ok({ luoghi: [], messaggio: "Imposta la base del noleggio per vedere la previsione.", serveLocalita: true });
  }

  try {
    const giorni = await previsione(base.lat, base.lon);
    return ok({ luoghi: [{ ...base, giorni, aggiornatoAt: new Date().toISOString() }] });
  } catch {
    return ok({ luoghi: [{ ...base, giorni: [], aggiornatoAt: new Date().toISOString(), errore: "Meteo non raggiungibile" }] });
  }
}
