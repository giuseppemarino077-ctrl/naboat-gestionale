import { fetchConRevisioni } from "./_concorrenza-ormeggio.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import ts from "typescript";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const base = process.argv[2];
assicuraAmbienteSmoke("verifica-disponibilita-ormeggio.mjs", base);
const db = new PrismaClient();
const fetch = fetchConRevisioni(db);
let passed = 0;
const recent = [];
const check = (name, value) => { assert.ok(value, `${name}\n${JSON.stringify(recent.slice(-3))}`); passed++; console.log(`PASS  disponibilità: ${name}`); };

const moduleUrl = (source) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText).toString("base64");
const datesUrl = moduleUrl(await readFile("src/modules/piattaforma/date.ts", "utf8"));
const periods = await import(moduleUrl((await readFile("src/modules/ormeggio/periodi.ts", "utf8")).replace("@/modules/piattaforma/date", datesUrl)));
const { giornoDi } = await import(datesUrl);
const { preventivoSosta, tariffaSosta } = await import(moduleUrl(await readFile("src/modules/ormeggio/tariffe.ts", "utf8")));

try {
  const tariffe = [
    { id: "prima", nome: "Ormeggio pontile A", unita: "mese", prezzoCent: 20000 },
    { id: "recente", nome: "Sosta pontile Z", unita: "mese", prezzoCent: 30000 },
  ];
  check("riordino del catalogo non cambia la tariffa automatica della sosta", tariffaSosta(tariffe, "mensile")?.id === "prima" && tariffaSosta([...tariffe].reverse(), "mensile")?.id === "prima");
  for (const [nome, inizio, fine, mesi, giorni, totale] of [
    ["dal primo al decimo conta dieci giornate", "2027-01-01", "2027-01-10", 0, 10, 18750],
    ["mese di 31 giorni", "2027-01-01", "2027-01-31", 1, 0, 24000],
    ["mese più un giorno", "2027-01-01", "2027-02-01", 1, 1, 25875],
    ["due mesi completi", "2027-01-01", "2027-02-28", 2, 0, 48000],
    ["due mesi più tre giorni", "2027-01-01", "2027-03-03", 2, 3, 53625],
    ["mese con partenza a metà mese", "2027-01-15", "2027-02-14", 1, 0, 24000],
    ["mese più un giorno con partenza a metà mese", "2027-01-15", "2027-02-15", 1, 1, 25875],
    ["febbraio ordinario", "2027-02-01", "2027-02-28", 1, 0, 24000],
    ["febbraio bisestile", "2028-02-01", "2028-02-29", 1, 0, 24000],
    ["mese di 30 giorni", "2027-04-01", "2027-04-30", 1, 0, 24000],
    ["mese a cavallo di anno", "2027-12-15", "2028-01-14", 1, 0, 24000],
    ["cambio ora legale non altera i giorni", "2027-03-25", "2027-03-30", 0, 6, 11250],
    ["cambio ora solare non altera i giorni", "2027-10-29", "2027-11-02", 0, 5, 9375],
    ["sosta nella stessa data", "2027-06-10", "2027-06-10", 0, 1, 1875],
    ["anniversario del 31 adeguato al febbraio breve", "2027-01-31", "2027-02-27", 1, 0, 24000],
    ["giorno extra dopo anniversario di fine mese", "2027-01-31", "2027-02-28", 1, 1, 25875],
    ["mesi successivi mantengono il giorno iniziale", "2027-01-31", "2027-03-30", 2, 0, 48000],
  ]) {
    const prezzo = preventivoSosta(inizio, fine, 1875, 24000);
    check(`preventivo: ${nome}`, prezzo.stato === "calcolato" && prezzo.mesi === mesi && prezzo.giorni === giorni && prezzo.importoCent === totale);
  }
  check("preventivo assente finché non sono selezionate entrambe le date", [preventivoSosta("2027-01-01", "", 1875, 24000), preventivoSosta("", "2027-01-10", 1875, 24000)].every(p => p.stato === "incompleto" && p.importoCent === null));
  check("preventivo rifiuta date inesistenti e fine precedente all'inizio", [preventivoSosta("2027-02-30", "2027-03-03", 1875, 24000), preventivoSosta("2027-03-10", "2027-03-09", 1875, 24000)].every(p => p.stato === "date_non_valide" && p.importoCent === null));
  check("tariffa giornaliera mancante non diventa una sosta gratuita", preventivoSosta("2027-01-01", "2027-01-10", null, 24000).stato === "tariffe_mancanti");
  check("tariffa mensile mancante non viene sostituita da giornate", preventivoSosta("2027-01-01", "2027-01-31", 1875, null).stato === "tariffe_mancanti");
  check("mese esatto calcolabile senza tariffa giornaliera", preventivoSosta("2027-01-01", "2027-01-31", null, 24000).importoCent === 24000);
  check("periodo breve calcolabile senza tariffa mensile", preventivoSosta("2027-01-01", "2027-01-10", 1875, null).importoCent === 18750);
  check("tariffe gratuite rimangono importi validi", preventivoSosta("2027-01-01", "2027-02-01", 0, 0).importoCent === 0);
  check("preventivo conserva i centesimi senza arrotondare le giornate", preventivoSosta("2027-01-01", "2027-02-03", 1999, 30001).importoCent === 35998);
  check("preventivi oltre il limite API non generano importi salvabili", preventivoSosta("2027-01-01", "2027-02-28", 1875, 100000000).stato === "limite");
  const fixed = new Date("2026-10-09T22:30:00.000Z");
  check("oggi segue Roma anche quando il giorno UTC è ancora precedente", periods.inizioNuovaSosta("2026-10-10", fixed)?.getTime() === fixed.getTime());
  check("un orario esplicito conserva la possibilità di registrare lo storico", periods.inizioNuovaSosta("2026-10-10T00:00:00.000Z", fixed)?.toISOString() === "2026-10-10T00:00:00.000Z");
  check("le date future conservano la convenzione delle soste esistenti", periods.inizioNuovaSosta("2026-10-11", fixed)?.toISOString() === "2026-10-11T00:00:00.000Z");
  check("date inesistenti e orari ambigui sono rifiutati", periods.dataSosta("2026-02-30") === null && periods.dataSosta("2026-02-30T12:00:00Z") === null && periods.dataSosta("2026-10-10T12:00") === null);
  const spring = periods.vistaGiornoSoste("2026-03-29", fixed);
  const autumn = periods.vistaGiornoSoste("2026-10-25", fixed);
  check("il giorno di cambio all'ora legale dura 23 ore", spring.occupazione.dal.lt - spring.inizio === 23 * 3600000);
  check("il giorno di ritorno all'ora solare dura 25 ore", autumn.occupazione.dal.lt - autumn.inizio === 25 * 3600000);

  const tenant = await db.tenant.create({ data: { nome: "Disponibilità Ormeggio", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } });
  const tenantId = tenant.id;
  const user = await db.user.create({ data: { tenantId, role: "owner", email: `${randomUUID()}@disponibilita.test`, emailVerified: true, passwordHash: "solo-ambiente-temporaneo" } });
  const token = await new SignJWT({ sub: user.id, tenantId, role: user.role, twofa: true, ver: user.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  async function api(path, method = "GET", body, extraHeaders = {}) {
    const r = await fetch(`${base}/api/v1/ormeggio${path}`, { method, headers: { Cookie: `nb_session=${token}`, "Content-Type": "application/json", ...extraHeaders }, body: body === undefined ? undefined : JSON.stringify(body) });
    const data = await r.json();
    recent.push({ path, status: r.status, error: data.error });
    return { status: r.status, data };
  }
  const area = await api("/aree", "POST", { nome: "Pontile disponibilità", righe: 1, colonne: 8 });
  assert.equal(area.status, 201);
  const posti = (await api("/aree")).data.find((a) => a.id === area.data.id).posti;
  const prop = await api("/proprietari", "POST", { nome: "Proprietario disponibilità" });
  assert.equal(prop.status, 201);
  const proprietarioId = prop.data.id;
  const today = giornoDi(new Date());
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const create = (posto, nome, extra = {}) => api("/permanenze", "POST", { postoId: posti[posto].id, proprietarioId, nuovaBarca: { nome }, inizioAt: yesterday, ...extra });
  const grid = async () => (await api(`/griglia?data=${today}`)).data.aree.find((a) => a.id === area.data.id).posti;
  const counters = async () => Promise.all([db.boat.count({ where: { tenantId } }), db.proprietario.count({ where: { tenantId } }), db.permanenza.count({ where: { tenantId } }), db.addebito.count({ where: { tenantId } })]);

  const old = await create(0, "Sosta chiusa oggi");
  assert.equal(old.status, 201);
  const closed = await api(`/permanenze/${old.data.id}`, "PATCH", { azione: "chiudi" });
  assert.equal(closed.status, 200);
  check("posto liberato oggi risulta libero nel quadro", !(await grid())[0].permanenza);
  const reused = await create(0, "Nuova barca nello stesso giorno", { inizioAt: today });
  check("nuova barca assegnabile oggi dopo una chiusura", reused.status === 201 && new Date(reused.data.inizioAt) >= new Date(closed.data.fineAt));
  const history = await db.assegnazionePosto.findMany({ where: { tenantId, postoId: posti[0].id }, orderBy: { dal: "asc" } });
  check("riuso conserva lo storico e intervalli senza sovrapposizioni", history.length === 2 && history[0].al <= history[1].dal);
  check("griglia ed elenco permanenze mostrano la stessa assegnazione corrente", (await grid())[0].permanenza?.id === reused.data.id && (await api(`/permanenze?data=${today}`)).data.some((p) => p.id === reused.data.id) && !(await api(`/permanenze?data=${today}`)).data.some((p) => p.id === old.data.id));

  const beforeConflict = await counters();
  const overlap = await api("/permanenze", "POST", { postoId: posti[0].id, nuovoProprietario: { nome: "Da annullare in transazione", telefono: "3330004455" }, nuovaBarca: { nome: "Da non creare" }, inizioAt: today, corrispettivoCent: 5000 });
  check("occupazione reale resta rifiutata con periodo esplicito", overlap.status === 409 && overlap.data.error.includes("è assegnato dal"));
  check("il conflitto non lascia proprietari, barche, soste o addebiti parziali", JSON.stringify(beforeConflict) === JSON.stringify(await counters()));
  const backdated = await create(0, "Sovrapposizione storica", { inizioAt: `${today}T00:00:00.000Z` });
  check("retrodatazione esplicita non può sovrascrivere lo storico", backdated.status === 409);

  const transfer = await api(`/permanenze/${reused.data.id}`, "PATCH", { azione: "sposta", postoId: posti[1].id });
  assert.equal(transfer.status, 200);
  const afterTransfer = await create(0, "Posto riusato dopo trasferimento", { inizioAt: today });
  check("posto liberato da trasferimento subito riassegnabile", afterTransfer.status === 201 && (await grid())[1].permanenza?.id === reused.data.id);
  const closeAgain = await api(`/permanenze/${reused.data.id}`, "PATCH", { azione: "chiudi" });
  assert.equal(closeAgain.status, 200);
  const sameBoat = await api("/permanenze", "POST", { postoId: posti[1].id, proprietarioId, boatId: reused.data.boatId, inizioAt: today });
  check("anche la stessa barca può iniziare una nuova sosta dopo la chiusura", sameBoat.status === 201);

  const future = await create(2, "Assegnazione futura", { inizioAt: "2033-01-02T00:00:00.000Z", finePrevistaAt: "2033-01-03T00:00:00.000Z" });
  assert.equal(future.status, 201);
  const adjacent = await api("/permanenze", "POST", { postoId: posti[2].id, proprietarioId, boatId: future.data.boatId, inizioAt: "2033-01-01T00:00:00.000Z", finePrevistaAt: "2033-01-02T00:00:00.000Z" });
  check("posto e barca accettano periodi adiacenti senza falso conflitto", adjacent.status === 201);
  const realOverlap = await create(2, "Un millisecondo di sovrapposizione", { inizioAt: "2032-12-31T00:00:00.000Z", finePrevistaAt: "2033-01-01T00:00:00.001Z" });
  check("anche un millisecondo di sovrapposizione resta vietato", realOverlap.status === 409);
  const source = await create(3, "Trasferimento consecutivo", { inizioAt: "2032-12-31T00:00:00.000Z", finePrevistaAt: "2033-01-01T00:00:00.000Z" });
  assert.equal(source.status, 201);
  const adjacentMove = await api(`/permanenze/${source.data.id}`, "PATCH", { azione: "sposta", postoId: posti[2].id, decorrenza: "2032-12-31T12:00:00.000Z" });
  check("trasferimento accetta una destinazione occupata solo dopo la sua fine", adjacentMove.status === 200);
  const invalidChange = await api(`/permanenze/${source.data.id}`, "PATCH", { azione: "aggiorna", finePrevistaAt: "2032-12-31T06:00:00.000Z", corrispettivoCent: 5000, rettifica: true });
  const afterInvalidChange = await api(`/permanenze/${source.data.id}`);
  check("fine precedente all'ultimo trasferimento rifiutata senza alterare date o conto", invalidChange.status === 422 && afterInvalidChange.data.finePrevistaAt === source.data.finePrevistaAt && afterInvalidChange.data.addebiti.length === 0);
  const openEnded = await create(2, "Indeterminata contro futuro", { inizioAt: today });
  check("posto libero ora con impegni futuri richiede un periodo compatibile", openEnded.status === 409 && openEnded.data.error.includes("2032") && openEnded.data.error.includes(posti[2].codice));

  const beforeInvalid = await counters();
  for (const body of [{ inizioAt: "2026-02-30" }, { inizioAt: "2032-12-01", finePrevistaAt: "2032-11-30" }, { inizioAt: "2032-12-01", finePrevistaAt: "2032-12-01" }]) {
    check(`periodo non valido rifiutato: ${JSON.stringify(body)}`, (await create(4, "Date non valide", body)).status === 422);
  }
  check("periodi non validi non producono scritture", JSON.stringify(beforeInvalid) === JSON.stringify(await counters()));
  check("date inesistenti rifiutate anche dalla lettura del quadro", (await api("/griglia?data=2026-02-30")).status === 422 && (await api("/permanenze?data=2026-02-30")).status === 422);

  const results = await Promise.all([create(5, "Concorrenza uno", { inizioAt: today }), create(5, "Concorrenza due", { inizioAt: today })]);
  check("due salvataggi simultanei consentono una sola assegnazione", JSON.stringify(results.map((r) => r.status).sort()) === "[201,409]");
  check("concorrenza conserva un solo intervallo e una sola barca", await db.assegnazionePosto.count({ where: { tenantId, postoId: posti[5].id } }) === 1 && await db.boat.count({ where: { tenantId, nome: { startsWith: "Concorrenza " } } }) === 1);
  const deletedStay = await api("/permanenze", "POST", { postoId: posti[6].id, nuovoProprietario: { nome: "Proprietario da eliminare disponibilità" }, nuovaBarca: { nome: "Barca eliminata disponibilità" }, inizioAt: yesterday });
  assert.equal(deletedStay.status, 201);
  const deletedBoat = await db.boat.findFirst({ where: { tenantId, id: deletedStay.data.boatId }, select: { proprietarioId: true } });
  assert.equal((await api(`/proprietari/${deletedBoat.proprietarioId}`, "DELETE")).status, 200);
  const reusedAfterDeletion = await create(6, "Posto riusato dopo eliminazione proprietario", { inizioAt: today });
  check("eliminazione del proprietario libera il posto anche per un nuovo inserimento oggi", reusedAfterDeletion.status === 201);
  const deletedHistory = await db.assegnazionePosto.findMany({ where: { tenantId, postoId: posti[6].id }, orderBy: { dal: "asc" } });
  check("riuso dopo eliminazione conserva la precedente assegnazione chiusa", deletedHistory.length === 2 && deletedHistory[0].permanenzaId === deletedStay.data.id && deletedHistory[0].al <= deletedHistory[1].dal);
  const pricePatch = { azione: "aggiorna", corrispettivoCent: 5000, rettifica: true };
  const sameRevision = { "If-Match": String((await db.permanenza.findUnique({ where: { id: source.data.id } })).revisione) };
  const simultaneousPrices = await Promise.all([api(`/permanenze/${source.data.id}`, "PATCH", pricePatch, sameRevision), api(`/permanenze/${source.data.id}`, "PATCH", pricePatch, sameRevision)]);
  const afterPrice = (await api(`/permanenze/${source.data.id}`)).data;
  check("rettifiche prezzo simultanee non duplicano l'addebito", JSON.stringify(simultaneousPrices.map(r => r.status).sort()) === "[200,409]" && afterPrice.corrispettivoCent === 5000 && afterPrice.conto.totaleAddebitiCent === 5000 && afterPrice.addebiti.length === 1);
  check("rettificare il prezzo conserva date e assegnazioni della sosta", afterPrice.finePrevistaAt === source.data.finePrevistaAt && afterPrice.assegnazioni.length === afterInvalidChange.data.assegnazioni.length);
  const nextRevision = { "If-Match": String(afterPrice.revisione) };
  const competingPrices = await Promise.all([api(`/permanenze/${source.data.id}`, "PATCH", { ...pricePatch, corrispettivoCent: 6500 }, nextRevision), api(`/permanenze/${source.data.id}`, "PATCH", { ...pricePatch, corrispettivoCent: 7000 }, nextRevision)]);
  const afterCompeting = (await api(`/permanenze/${source.data.id}`)).data;
  check("prezzi diversi salvati in concorrenza mantengono conto e corrispettivo allineati", JSON.stringify(competingPrices.map(r => r.status).sort()) === "[200,409]" && afterCompeting.conto.totaleAddebitiCent === afterCompeting.corrispettivoCent && [6500, 7000].includes(afterCompeting.corrispettivoCent));
} finally {
  await db.$disconnect();
}
console.log(`Disponibilità Ormeggio: ${passed} PASS / 0 FAIL`);
