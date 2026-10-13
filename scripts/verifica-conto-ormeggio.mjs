import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import ts from "typescript";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const base = process.argv[2];
assicuraAmbienteSmoke("verifica-conto-ormeggio.mjs", base);
const db = new PrismaClient();
const moduleUrl = (s) => "data:text/javascript;base64," + Buffer.from(ts.transpileModule(s, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText).toString("base64");
const dates = await import(moduleUrl(await readFile("src/modules/piattaforma/date.ts", "utf8")));
const { calcolaConto } = await import(moduleUrl(await readFile("src/modules/ormeggio/conto.ts", "utf8")));
const tenants = [], people = [];
let pass = 0;
const check = (name, value) => { assert.ok(value, name); pass++; console.log(`PASS  conto Ormeggio: ${name}`); };
async function token(u, tenantId = u.tenantId) { return new SignJWT({ sub: u.id, tenantId, role: u.role, twofa: true, ver: u.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET)); }
async function api(cookie, path, method = "GET", body, headers = {}) {
  const r = await fetch(`${base}/api/v1${path}`, { method, headers: { ...(cookie ? { Cookie: `nb_session=${cookie}` } : {}), "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
async function fixture() {
  const tenant = await db.tenant.create({ data: { nome: "Conto Ormeggio isolato", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } }); tenants.push(tenant.id);
  const owner = await db.user.create({ data: { tenantId: tenant.id, role: "owner", email: `${randomUUID()}@conto.test`, emailVerified: true } });
  const area = await db.area.create({ data: { tenantId: tenant.id, nome: "Area conto", righe: 1, colonne: 10 } });
  const prop = await db.proprietario.create({ data: { tenantId: tenant.id, nome: "Proprietario conto", dedupKey: randomUUID() } });
  return { tenantId: tenant.id, cookie: await token(owner), area, prop, n: 0 };
}
async function stay(f) {
  const boat = await db.boat.create({ data: { tenantId: f.tenantId, nome: `Barca conto ${++f.n}`, uso: "custodia", proprietarioId: f.prop.id } });
  const posto = await db.posto.create({ data: { tenantId: f.tenantId, areaId: f.area.id, codice: `A${f.n}`, riga: 1, colonna: f.n } });
  const p = await db.permanenza.create({ data: { tenantId: f.tenantId, boatId: boat.id, postoId: posto.id, inizioAt: dates.inizioGiorno(dates.oggi()) } });
  await db.assegnazionePosto.create({ data: { tenantId: f.tenantId, permanenzaId: p.id, boatId: boat.id, postoId: posto.id, dal: p.inizioAt } });
  return p;
}
async function charge(f, p, importoCent, extra = {}) { return db.addebito.create({ data: { tenantId: f.tenantId, permanenzaId: p.id, descrizione: `Servizio ${randomUUID()}`, importoCent, ...extra } }); }
async function pay(f, a, body = {}, revision) {
  const cur = await db.addebito.findFirst({ where: { tenantId: f.tenantId, id: a.id } });
  return api(f.cookie, `/ormeggio/addebiti/${a.id}`, "PATCH", { stato: "pagato", ...body }, { "If-Match": String(revision ?? cur.revisione) });
}
async function receipt(f, p, amount, key = randomUUID()) { return api(f.cookie, "/ormeggio/incassi", "POST", { permanenzaId: p.id, importoCent: amount, metodo: "contanti" }, { "Idempotency-Key": key }); }
async function detail(f, p) { const r = await api(f.cookie, `/ormeggio/permanenze/${p.id}`); assert.equal(r.status, 200, JSON.stringify(r.data)); return r.data; }
try {
  const f = await fixture(), other = await fixture();
  const p = await stay(f), a = await charge(f, p, 10000);
  const key = randomUUID();
  check("acconto esterno registrato una volta anche se ritentato", (await receipt(f, p, 2500, key)).status === 201 && (await receipt(f, p, 2500, key)).status === 201 && await db.payment.count({ where: { tenantId: f.tenantId, permanenzaId: p.id } }) === 1);
  let d = await detail(f, p);
  check("acconto copre parzialmente la voce e riduce il residuo", d.addebiti[0].incassatoCent === 2500 && d.addebiti[0].residuoCent === 7500 && d.conto.residuoCent === 7500);
  const paid = await pay(f, a, { metodo: "bonifico", dataIncasso: dates.oggi(), incassoAttesoCent: 7500 });
  assert.equal(paid.status, 200, JSON.stringify(paid.data));
  check("segna pagato registra solo i 75 euro ancora scoperti", paid.data.incassoCreatoCent === 7500 && paid.data.incasso.addebitoId === a.id && paid.data.incasso.metodo === "bonifico" && paid.data.incasso.descrizione === a.descrizione);
  check("incasso di oggi conserva l'orario reale per attribuirlo all'area corretta", Math.abs(+new Date(paid.data.incasso.paidAt) - Date.now()) < 60000);
  check("risposta espone la revisione aggiornata", paid.data.revisione === (await db.addebito.findFirst({ where: { tenantId: f.tenantId, id: a.id } })).revisione && paid.data.revisione > a.revisione);
  d = await detail(f, p);
  check("conto e incassi si aggiornano insieme allo stato pagato", d.addebiti[0].stato === "pagato" && d.payments.length === 2 && d.conto.incassatoCent === 10000 && d.conto.residuoCent === 0);
  check("ripetere segna pagato non crea un nuovo incasso", (await pay(f, a)).data.incassoCreatoCent === 0 && await db.payment.count({ where: { tenantId: f.tenantId, addebitoId: a.id } }) === 1);
  check("incasso compare nel registro e nell'audit", (await api(f.cookie, `/ormeggio/incassi?permanenzaId=${p.id}`)).data.some((x) => x.addebitoId === a.id && x.totaleCent === 7500) && await db.auditLog.count({ where: { tenantId: f.tenantId, entitaId: paid.data.incasso.id, azione: "ormeggio.incasso.addebito" } }) === 1);
  check("mappa non segnala più il conto da saldare", !(await api(f.cookie, "/ormeggio/griglia")).data.aree[0].posti.find((x) => x.id === p.postoId).permanenza.motivi.includes("conto da saldare"));
  const contract = await db.contrattoOrmeggio.create({ data: { tenantId: f.tenantId, permanenzaId: p.id, tipo: "ormeggio_custodia", token: randomUUID() } });
  const publicAccount = await api(null, `/ormeggio/contratto-public/${contract.token}`);
  check("contratto pubblico legge lo stesso saldo", publicAccount.status === 200 && publicAccount.data.conto.incassatoCent === 10000 && publicAccount.data.conto.residuoCent === 0);
  const pdf = await fetch(`${base}/api/v1/ormeggio/permanenze/${p.id}/riepilogo`, { headers: { Cookie: `nb_session=${f.cookie}` } });
  const pdfText = Buffer.from(await pdf.arrayBuffer()).toString("latin1");
  check("PDF comprende l'incasso e il saldo aggiornati", pdf.status === 200 && pdfText.startsWith("%PDF-") && pdfText.includes("Totale incassato: 100,00") && pdfText.includes("RESIDUO DA PAGARE: 0,00"));
  const stats = await api(f.cookie, `/ormeggio/statistiche?dal=${dates.oggi()}&al=${dates.oggi()}`);
  check("statistiche e composizione incassi includono il pagamento una volta", stats.status === 200 && stats.data.metriche.incassiCent === 10000 && stats.data.metriche.residuoCent === 0 && (await api(f.cookie, `/ormeggio/statistiche?dal=${dates.oggi()}&al=${dates.oggi()}&dettaglio=incassi`)).data.totale === 2);
  const paidRev = (await db.addebito.findFirst({ where: { tenantId: f.tenantId, id: a.id } })).revisione;
  for (const [method, body] of [["PATCH", { stato: "da_pagare" }], ["PATCH", { importoCent: 20000 }], ["DELETE", undefined]]) check(`voce incassata protetta da ${method} ${JSON.stringify(body)}`, (await api(f.cookie, `/ormeggio/addebiti/${a.id}`, method, body, { "If-Match": String(paidRev) })).status === 409);
  check("altra azienda non può pagare l'addebito", (await api(other.cookie, `/ormeggio/addebiti/${a.id}`, "PATCH", { stato: "pagato" }, { "If-Match": String(paidRev) })).status === 404);
  const limited = await db.user.create({ data: { email: `${randomUUID()}@conto.test`, emailVerified: true, role: "operatore" } }); people.push(limited.id);
  await db.appartenenza.create({ data: { tenantId: f.tenantId, userId: limited.id, ruoloOrmeggio: "responsabile", accessoOrmeggio: true, vedeImporti: false } });
  check("permesso importi obbligatorio per registrare denaro", (await api(await token(limited, f.tenantId), `/ormeggio/addebiti/${a.id}`, "PATCH", { stato: "pagato" }, { "If-Match": String(paidRev) })).status === 403);
  const p2 = await stay(f), race = await charge(f, p2, 5000);
  const results = await Promise.all([pay(f, race, {}, race.revisione), pay(f, race, {}, race.revisione)]);
  check("due sessioni sulla stessa voce registrano un solo pagamento", results.filter((r) => r.status === 200).length === 1 && results.filter((r) => r.status === 409).length === 1 && await db.payment.count({ where: { tenantId: f.tenantId, addebitoId: race.id } }) === 1);
  const a2 = await charge(f, p2, 2000), a3 = await charge(f, p2, 3000);
  const separate = await Promise.all([pay(f, a2), pay(f, a3)]);
  check("pagamenti simultanei di due voci conservano entrambi i collegamenti", separate.every((r) => r.status === 200) && (await detail(f, p2)).conto.incassatoCent === 10000 && (await detail(f, p2)).conto.residuoCent === 0);
  const p3 = await stay(f), legacy = await charge(f, p3, 4000, { stato: "pagato" });
  check("vecchia etichetta pagato non inventa denaro ricevuto", (await detail(f, p3)).addebiti[0].incassoDaVerificare && await db.payment.count({ where: { tenantId: f.tenantId, permanenzaId: p3.id } }) === 0);
  check("conferma esplicita riconcilia la voce con la data reale", (await pay(f, legacy, { metodo: "pos", dataIncasso: "2026-03-10" })).status === 200 && dates.giornoDi((await db.payment.findFirst({ where: { tenantId: f.tenantId, addebitoId: legacy.id } })).paidAt) === "2026-03-10");
  check("incasso storico entra solo nel periodo della sua data", (await api(f.cookie, "/ormeggio/statistiche?dal=2026-03-10&al=2026-03-10")).data.metriche.incassiCent === 4000);
  const p4 = await stay(f), first = await charge(f, p4, 1000, { data: new Date("2026-01-01") }), second = await charge(f, p4, 2000, { data: new Date("2026-01-02") });
  await receipt(f, p4, 1500);
  d = await detail(f, p4);
  check("incasso generale copre prima la voce più vecchia, poi la successiva", d.addebiti.find((x) => x.id === first.id).stato === "pagato" && d.addebiti.find((x) => x.id === second.id).residuoCent === 1500);
  check("preventivo d'incasso superato viene rifiutato senza scritture", (await pay(f, second, { incassoAttesoCent: 2000 })).status === 409 && await db.payment.count({ where: { tenantId: f.tenantId, addebitoId: second.id } }) === 0);
  for (const body of [{ dataIncasso: "2026-02-30" }, { dataIncasso: "2099-01-01" }, { metodo: "inesistente" }, { importoCent: 2000 }, { incassoAttesoCent: -1 }]) check(`input non valido rifiutato: ${JSON.stringify(body)}`, (await pay(f, second, body)).status === 422);
  check("voce gratuita non genera un movimento da zero euro", (await pay(f, await charge(f, p4, 0))).data.incassoCreatoCent === 0);
  const job = await db.attivita.create({ data: { tenantId: f.tenantId, permanenzaId: p4.id, tipo: "Servizio coperto", stato: "completato" } });
  await db.addebito.update({ where: { id: first.id, tenantId: f.tenantId }, data: { attivitaId: job.id } });
  check("storno attività rifiutato anche se coperta da un incasso generale", (await api(f.cookie, `/ormeggio/attivita/${job.id}`, "PATCH", { storno: true }, { "If-Match": String(job.revisione) })).status === 409);
  await receipt(f, p4, 3500);
  d = await detail(f, p4);
  check("eccedenza diventa credito, senza un nuovo pagamento per le voci coperte", d.conto.creditoCent === 2000 && (await pay(f, second)).data.incassoCreatoCent === 0);
  const newCharge = await charge(f, p4, 500);
  check("credito copre i nuovi addebiti della stessa sosta", (await detail(f, p4)).addebiti.find((x) => x.id === newCharge.id).residuoCent === 0 && (await detail(f, p4)).conto.creditoCent === 1500);
  const p5 = await stay(f), refunded = await charge(f, p5, 10000);
  const original = (await pay(f, refunded)).data.incasso;
  await db.payment.update({ where: { id: original.id, tenantId: f.tenantId }, data: { stato: "rimborsato_parziale", rimborsoCent: 2500 } });
  await db.refund.create({ data: { tenantId: f.tenantId, paymentId: original.id, importoCent: 2500, stato: "riuscito", completatoAt: new Date() } });
  await db.refund.create({ data: { tenantId: f.tenantId, paymentId: original.id, importoCent: 1000, stato: "pendente" } });
  d = await detail(f, p5);
  check("rimborso confermato riapre solo la quota restituita senza contarlo due volte", d.conto.incassatoCent === 7500 && d.conto.residuoCent === 2500 && !d.addebiti[0].incassoDaVerificare);
  check("saldo dopo il rimborso registra soltanto la nuova quota", (await pay(f, refunded)).data.incassoCreatoCent === 2500 && (await detail(f, p5)).conto.residuoCent === 0);
  const p6 = await stay(f), debt = await charge(f, p6, 7000);
  const accounts = await api(f.cookie, "/ormeggio/conti");
  const account = accounts.data.find((x) => x.id === f.prop.id);
  check("credito di una barca non cancella il residuo di un'altra", account.residuoCent === 7000 && account.creditoCent === 1500 && account.dettaglio.find((x) => x.permanenzaId === p6.id).residuoCent === debt.importoCent);
  const summary = await api(f.cookie, `/ormeggio/statistiche?dal=${dates.oggi()}&al=${dates.oggi()}`);
  check("statistiche riconciliano tutti i residui con Economia", summary.data.metriche.residuoCent === account.residuoCent && summary.data.metriche.creditoCent === account.creditoCent);
  const pure = calcolaConto([{ id: "a", importoCent: 1000 }, { id: "s", importoCent: -200 }], [{ stato: "pagato", totaleCent: 300, tipo: "totale" }, { stato: "pagato", totaleCent: 5000, condizioniSnapshot: { tipo: "cauzione" } }]);
  check("cauzione non salda servizi e rettifica negativa riduce il debito", pure.residuoCent === 500 && pure.addebiti[0].residuoCent === 500 && pure.incassatoCent === 300);
  console.log(`Conto Ormeggio: ${pass} PASS / 0 FAIL`);
} finally {
  for (const tenantId of tenants.reverse()) await db.tenant.delete({ where: { id: tenantId } });
  if (people.length) await db.user.deleteMany({ where: { id: { in: people } } });
  await db.$disconnect();
}
