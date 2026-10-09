import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

const base = process.argv[2];
if (!new URL(process.env.DATABASE_URL).pathname.startsWith("/naboat_verifica_") || !["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Usare npm run test:isolated.");
const db = new PrismaClient();
let passed = 0;
const recent = [];
const check = (name, value) => { assert.ok(value, value ? name : `${name}\n${JSON.stringify(recent.slice(-5))}`); passed++; console.log(`PASS  separazione: ${name}`); };
const id = randomUUID();
const calendario = `/calendar?from=${new Date().toISOString()}&to=${new Date(Date.now() + 86400000).toISOString()}`;

async function fixture(tipoModulo, moduloOrmeggio, role = "owner", vedeImporti = true) {
  const tenant = await db.tenant.create({ data: { nome: `Confini ${tipoModulo} ${id}`, status: "active", tipoModulo, moduloOrmeggio } });
  const user = await db.user.create({ data: { tenantId: tenant.id, email: `${randomUUID()}@confini.test`, passwordHash: "solo-database-temporaneo", emailVerified: true, role, vedeImporti } });
  return { tenant, user, cookie: await token(user) };
}

async function token(user) {
  return new SignJWT({ sub: user.id, role: user.role, tenantId: user.tenantId, ver: user.sessionVersion, twofa: true }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}

async function api(f, path, method = "GET", body) {
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: { Cookie: `nb_session=${f.cookie}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = r.headers.get("content-type")?.includes("application/json") ? await r.json() : await r.text();
  recent.push({ path, method, status: r.status, error: data?.error });
  return { status: r.status, data };
}

try {
  const nol = await fixture("noleggio", false);
  const orm = await fixture("ormeggio", true);
  const mixed = await fixture("entrambi", true);
  const legacy = await fixture("noleggio", true);
  const disabled = await fixture("ormeggio", false);
  const fake = randomUUID();
  const nolOnly = [
    ["/boats"], ["/bookings"], ["/bookings", "POST"], [`/bookings/${fake}`, "PATCH"],
    [`/bookings/${fake}/checkin`, "POST"], [`/bookings/${fake}/checkout`, "POST"],
    [`/bookings/${fake}/contratto`, "POST"], [`/bookings/${fake}/contratto/pdf`],
    ["/calendar"], ["/today"], ["/turni"], ["/customers"], ["/skippers"],
    ["/blocks"], ["/blocks", "POST"], ["/tariffe"], ["/extras"], ["/esperienze"],
    ["/maintenance"], ["/meteo"], ["/porti"], ["/modelli"], ["/dotazioni"], ["/recensioni"],
    ["/seo"], ["/payments"], ["/payments", "POST"], ["/payments", "PATCH"],
    ["/payments/checkout", "POST"], ["/payments/cauzione", "POST"], ["/promemoria/invia", "POST"],
  ];
  for (const [path, method = "GET"] of nolOnly) check(`azienda Ormeggio: ${method} ${path} rifiutato`, (await api(orm, path, method, method === "GET" ? undefined : {})).status === 403);
  const ormOnly = ["aree", "posti/" + fake, "griglia", "barche", "barche/" + fake, "proprietari", "servizi", "permanenze", "movimenti", "attivita", "addebiti", "incassi", "conti", `permanenze/${fake}/riepilogo`];
  for (const path of ormOnly) {
    const method = path.startsWith("posti/") ? "PATCH" : "GET";
    check(`azienda Noleggio: ${method} /ormeggio/${path} rifiutato`, (await api(nol, `/ormeggio/${path}`, method, method === "GET" ? undefined : {})).status === 403);
  }
  check("flag legacy conserva l'accesso Ormeggio", (await api(legacy, "/ormeggio/griglia")).status === 200 && (await api(legacy, "/calendar")).status === 403);
  check("modulo Ormeggio disabilitato conserva il fallback Noleggio", (await api(disabled, "/boats")).status === 200 && (await api(disabled, "/ormeggio/griglia")).status === 403);
  check("azienda mista accede ai due prodotti", (await api(mixed, calendario)).status === 200 && (await api(mixed, "/ormeggio/griglia")).status === 200);
  check("creazione compatibile custodia disponibile all'ormeggiatore", (await api(orm, "/boats", "POST", { nome: "Custodia compatibile", uso: "custodia" })).status === 201);

  const nb = await api(mixed, "/boats", "POST", { nome: "Flotta confini", capienza: 4 });
  const ob = await api(mixed, "/ormeggio/barche", "POST", { nome: "Custodia confini", tipoCodice: "gozzo" });
  check("creazione nei servizi dedicati", nb.status === 201 && ob.status === 201 && ob.data.uso === "custodia");
  check("flotta Noleggio esclude barche in custodia", (await api(mixed, "/boats")).data.every((b) => b.uso === "noleggio"));
  check("elenco Ormeggio esclude flotta Noleggio e marca/modello", (await api(mixed, "/ormeggio/barche")).data.every((b) => b.uso === "custodia" && !("modelloTesto" in b) && !("modelloId" in b)));
  check("elenco compatibile tutte conserva entrambe le barche", (await api(mixed, "/boats?uso=tutte")).data.length === 2);
  check("lettura compatibile custodia usa il servizio Ormeggio", (await api(mixed, "/boats?uso=custodia")).data[0].id === ob.data.id);
  check("barca Noleggio non modificabile dall'Ormeggio", (await api(mixed, `/ormeggio/barche/${nb.data.id}`, "PATCH", { nome: "Vietato" })).status === 404);
  check("barca custodia non duplicabile nella flotta", (await api(mixed, `/boats/${ob.data.id}/duplicate`, "POST", {})).status === 404);
  check("offerte Noleggio non associabili alla custodia", (await api(mixed, `/boats/${ob.data.id}/offerte`)).status === 404);
  check("listino Noleggio non associabile alla custodia", (await api(mixed, "/tariffe", "POST", { boatId: ob.data.id, tipo: "giornata", stagione: "tutto_anno", prezzoEuro: "50" })).status === 404);
  check("modifica custodia isolata tra aziende", (await api(orm, `/ormeggio/barche/${ob.data.id}`, "PATCH", { nome: "Vietato" })).status === 404);
  check("payload custodia rifiuta pubblicazione e modello", (await api(mixed, `/ormeggio/barche/${ob.data.id}`, "PATCH", { pubblicata: true })).status === 422 && (await api(mixed, `/boats/${ob.data.id}`, "PATCH", { modelloTesto: "Vietato" })).status === 422);
  check("patch compatibile custodia aggiorna il servizio dedicato", (await api(mixed, `/boats/${ob.data.id}`, "PATCH", { nome: "Custodia aggiornata", tipoCodice: "gommone" })).data.tipoCodice === "gommone");
  check("rimozione generica custodia preserva i collegamenti", (await api(mixed, `/boats/${ob.data.id}`, "DELETE")).status === 409 && (await api(mixed, `/ormeggio/barche/${ob.data.id}`)).status === 200);

  const area = await api(mixed, "/ormeggio/aree", "POST", { nome: "Confini", righe: 1, colonne: 2 });
  const posto = (await api(mixed, "/ormeggio/aree")).data.find((a) => a.id === area.data.id).posti[0];
  const inizioAt = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const finePrevistaAt = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const stay = await api(mixed, "/ormeggio/permanenze", "POST", { postoId: posto.id, boatId: ob.data.id, nuovoProprietario: { nome: "Proprietario confini" }, inizioAt, finePrevistaAt, corrispettivoCent: 12000 });
  check("barca del servizio dedicato assegnabile al posto", stay.status === 201);
  const contratto = await api(mixed, `/ormeggio/permanenze/${stay.data.id}/contratto`, "POST");
  const firmato = await api(mixed, `/ormeggio/contratto-public/${contratto.data.token}`, "POST", { nome: "Proprietario confini", accettato: true });
  const snapshot = await db.contrattoOrmeggio.findFirst({ where: { permanenzaId: stay.data.id, tenantId: mixed.tenant.id } });
  check("contratto dedicato generato e firmato", contratto.status === 200 && firmato.status === 200);
  await api(mixed, `/ormeggio/barche/${ob.data.id}`, "PATCH", { nome: "Nuovo nome in griglia" });
  const griglia = await api(mixed, "/ormeggio/griglia");
  check("rinomina custodia collegata alla griglia", griglia.data.aree.flatMap((a) => a.posti).some((p) => p.permanenza?.boatNome === "Nuovo nome in griglia"));
  const documentoDopo = await db.contrattoOrmeggio.findFirst({ where: { permanenzaId: stay.data.id, tenantId: mixed.tenant.id } });
  check("rinomina non riscrive contratto firmato, token o impronta", documentoDopo.token === snapshot.token && documentoDopo.hash === snapshot.hash && JSON.stringify(documentoDopo.testoSnapshot) === JSON.stringify(snapshot.testoSnapshot));
  const nolPayment = await api(mixed, "/payments", "POST", { importoEuro: "12", metodo: "contanti", descrizione: "Incasso noleggio confini" });
  const ormPayment = await api(mixed, "/ormeggio/incassi", "POST", { permanenzaId: stay.data.id, importoCent: 3500, metodo: "contanti" });
  check("incassi nei registri corretti e senza fee Ormeggio", nolPayment.status === 201 && ormPayment.status === 201 && ormPayment.data.feeNaboatCent === 0);
  check("registro Noleggio esclude gli incassi Ormeggio", (await api(mixed, "/payments")).data.some((p) => p.id === nolPayment.data.id) && !(await api(mixed, "/payments")).data.some((p) => p.id === ormPayment.data.id));
  check("registro Ormeggio esclude gli incassi Noleggio", (await api(mixed, "/ormeggio/incassi")).data.some((p) => p.id === ormPayment.data.id) && !(await api(mixed, "/ormeggio/incassi")).data.some((p) => p.id === nolPayment.data.id));
  check("conto e PDF continuano a funzionare dopo la rinomina", (await api(mixed, `/ormeggio/permanenze/${stay.data.id}`)).data.conto.residuoCent === 8500 && (await api(mixed, `/ormeggio/permanenze/${stay.data.id}/riepilogo`)).status === 200);

  const limitedUser = await db.user.create({ data: { tenantId: mixed.tenant.id, email: `${randomUUID()}@confini.test`, passwordHash: "isolato", role: "operatore", emailVerified: true, vedeImporti: false } });
  const limited = { cookie: await token(limitedUser) };
  check("operatore senza importi modifica la barca operativa", (await api(limited, `/ormeggio/barche/${ob.data.id}`, "PATCH", { nome: "Custodia addetto" })).status === 200);
  check("operatore senza importi non legge registri economici", (await api(limited, "/payments")).status === 403 && (await api(limited, "/ormeggio/incassi")).status === 403 && (await api(limited, "/ormeggio/conti")).status === 403);
  const skipperUser = await db.user.create({ data: { tenantId: mixed.tenant.id, email: `${randomUUID()}@confini.test`, passwordHash: "isolato", role: "skipper", emailVerified: true } });
  const skipper = { cookie: await token(skipperUser) };
  check("skipper consulta calendario ma non Ormeggio", (await api(skipper, calendario)).status === 200 && (await api(skipper, "/ormeggio/griglia")).status === 403);
  check("skipper resta in sola lettura", (await api(skipper, "/blocks", "POST", {})).status === 403 && (await api(skipper, "/bookings", "POST", {})).status === 403);
  check("impostazioni di pagamento comuni restano accessibili", (await api(orm, "/payments/settings")).status === 200 && (await api(nol, "/payments/settings")).status === 200);

  for (const [f, path, target] of [[orm, "/gestionale/calendario", "/gestionale/ormeggio"], [nol, "/gestionale/ormeggio", "/gestionale/oggi"]]) {
    const r = await fetch(base + path, { headers: { Cookie: `nb_session=${f.cookie}` }, redirect: "manual" });
    const location = r.headers.get("location");
    const html = await r.text();
    recent.push({ path, status: r.status, location });
    const redirect = r.status === 307 && location && new URL(location, base).pathname === target;
    const streamingRedirect = r.status === 200 && html.includes(`NEXT_REDIRECT;replace;${target};`);
    check(`pagina ${path} controllata sul server`, redirect || streamingRedirect);
  }
  await db.user.update({ where: { id: limitedUser.id, tenantId: mixed.tenant.id }, data: { sessionVersion: { increment: 1 } } });
  check("revoca sessione rispettata anche dalle nuove API", (await api(limited, "/ormeggio/barche")).status === 401);
  await db.boat.updateMany({ where: { id: ob.data.id, tenantId: mixed.tenant.id }, data: { archiviato: true } });
  check("barca archiviata consultabile ma non modificabile", (await api(mixed, `/ormeggio/barche/${ob.data.id}`)).status === 200 && (await api(mixed, `/ormeggio/barche/${ob.data.id}`, "PATCH", { nome: "Non ripristinare" })).status === 409);
  console.log(`Separazione prodotti: ${passed} PASS / 0 FAIL`);
} finally {
  await db.$disconnect();
}
