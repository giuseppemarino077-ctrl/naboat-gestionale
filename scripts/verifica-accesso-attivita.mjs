import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const base = process.argv[2];
assicuraAmbienteSmoke("verifica-accesso-attivita.mjs", base);
const db = new PrismaClient();
let passed = 0;
const check = (name, value) => { assert.ok(value, name); passed++; console.log(`PASS  accesso attività: ${name}`); };
async function token(user) {
  return new SignJWT({ sub: user.id, tenantId: user.tenantId, role: user.role, twofa: true, ver: user.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
async function user(tenantId, role = "owner", vedeImporti = true) {
  return db.user.create({ data: { tenantId, role, vedeImporti, email: `${randomUUID()}@accesso-attivita.test`, emailVerified: true, passwordHash: "solo-database-temporaneo" } });
}
async function api(cookie, path, method = "GET", body) {
  const r = await fetch(`${base}/api/v1/ormeggio${path}`, { method, headers: { Cookie: `nb_session=${cookie}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, data: await r.json() };
}
try {
  const tenant = await db.tenant.create({ data: { nome: "Accesso attività", status: "active", tipoModulo: "entrambi", moduloOrmeggio: true } });
  const tenantId = tenant.id;
  const owner = await user(tenantId);
  const cookie = await token(owner);
  const limitedCookie = await token(await user(tenantId, "operatore", false));
  const p = (await api(cookie, "/proprietari", "POST", { nome: "Cliente scelta attività", telefono: "3330008765", email: "attivita@cliente.test" })).data;
  const other = (await api(cookie, "/proprietari", "POST", { nome: "Altro cliente scelta attività" })).data;
  const area = (await api(cookie, "/aree", "POST", { nome: "Attività", righe: 1, colonne: 3 })).data;
  const posti = (await api(cookie, "/aree")).data.find((a) => a.id === area.id).posti;
  const stay = await api(cookie, "/permanenze", "POST", { postoId: posti[0].id, proprietarioId: p.id, nuovaBarca: { nome: "Barca cliente attività" }, inizioAt: new Date(Date.now() - 86400000).toISOString(), finePrevistaAt: "2030-01-01T00:00:00Z", corrispettivoCent: 15000 });
  assert.equal(stay.status, 201);
  const future = await api(cookie, "/permanenze", "POST", { postoId: posti[1].id, proprietarioId: p.id, boatId: stay.data.boatId, inizioAt: "2031-01-01T00:00:00Z", finePrevistaAt: "2031-02-01T00:00:00Z" });
  assert.equal(future.status, 201);
  await db.boat.create({ data: { tenantId, proprietarioId: p.id, nome: "Barca noleggio esclusa", uso: "noleggio" } });
  await db.boat.create({ data: { tenantId, proprietarioId: p.id, nome: "Barca archiviata esclusa", uso: "custodia", archiviato: true } });
  const noStay = await db.boat.create({ data: { tenantId, proprietarioId: p.id, nome: "Barca senza sosta", uso: "custodia" } });
  await db.boat.create({ data: { tenantId, proprietarioId: other.id, nome: "Barca altro cliente", uso: "custodia" } });
  const context = await api(cookie, `/proprietari/${p.id}`);
  check("cliente selezionato espone solo le sue barche operative in custodia", context.status === 200 && context.data.boats.length === 2 && context.data.boats.some((b) => b.id === stay.data.boatId) && context.data.boats.some((b) => b.id === noStay.id));
  const boat = context.data.boats.find((b) => b.id === stay.data.boatId);
  check("soste corrente e futura restano selezionabili separatamente", boat.permanenze.length === 2 && boat.permanenze.some((s) => s.id === stay.data.id) && boat.permanenze.some((s) => s.id === future.data.id));
  check("soste includono periodo e posto senza importi", boat.permanenze.every((s) => s.inizioAt && s.posto?.area.nome === "Attività" && !("corrispettivoCent" in s)));
  check("barca senza sosta non riceve una permanenza inventata", context.data.boats.find((b) => b.id === noStay.id).permanenze.length === 0);
  check("cliente senza barche restituisce elenco vuoto", (await api(cookie, `/proprietari/${(await api(cookie, "/proprietari", "POST", { nome: "Cliente senza barche" })).data.id}`)).data.boats.length === 0);
  check("operatore senza importi può scegliere cliente, barca e periodo", (await api(limitedCookie, `/proprietari/${p.id}`)).status === 200);
  for (const q of ["3330008765", "attivita@cliente.test"]) check(`ricerca cliente per ${q}`, (await api(cookie, `/proprietari?q=${encodeURIComponent(q)}`)).data.some((c) => c.id === p.id));
  const a = await api(cookie, "/attivita", "POST", { permanenzaId: stay.data.id, tipo: "Servizio dallo shortcut", prezzoCent: 1700 });
  check("attività creata sulla sosta scelta", a.status === 201 && a.data.permanenzaId === stay.data.id);
  const list = (await api(cookie, "/attivita?daFare=1")).data;
  check("attività trasversali identificano anche il cliente", list.find((v) => v.id === a.data.id)?.permanenza.boat.proprietario.nome === p.nome);
  await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato: "in_corso" });
  assert.equal((await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato: "completato" })).status, 200);
  const details = (await api(cookie, `/permanenze/${stay.data.id}`)).data;
  check("completamento usa il conto esistente senza doppio addebito", details.addebiti.filter((v) => v.attivitaId === a.data.id).length === 1 && details.conto.totaleAddebitiCent === 16700);
  check("attività non confluisce nel conto della sosta futura", (await api(cookie, `/permanenze/${future.data.id}`)).data.attivita.length === 0);
  const secondTenant = await db.tenant.create({ data: { nome: "Altra azienda attività", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } });
  check("cliente di un'altra azienda non accessibile", (await api(await token(await user(secondTenant.id)), `/proprietari/${p.id}`)).status === 404);
  check("skipper non accede ai clienti Ormeggio", (await api(await token(await user(tenantId, "skipper")), `/proprietari/${p.id}`)).status === 403);
  const rental = await db.tenant.create({ data: { nome: "Noleggio attività", status: "active", tipoModulo: "noleggio", moduloOrmeggio: false } });
  check("azienda solo Noleggio non accede al selettore Ormeggio", (await api(await token(await user(rental.id)), `/proprietari/${p.id}`)).status === 403);
  check("cliente inesistente risponde 404", (await api(cookie, `/proprietari/${randomUUID()}`)).status === 404);
  const service = (await api(cookie, "/servizi", "POST", { nome: "Servizio eliminazione concorrente", prezzoCent: 900 })).data;
  check("eliminazione servizio di un'altra azienda rifiutata", (await api(await token(await user(secondTenant.id)), `/servizi/${service.id}`, "DELETE")).status === 404 && await db.servizioCatalogo.count({ where: { id: service.id, tenantId } }) === 1);
  const deletions = await Promise.all([api(cookie, `/servizi/${service.id}`, "DELETE"), api(limitedCookie, `/servizi/${service.id}`, "DELETE")]);
  check("due eliminazioni simultanee restituiscono 200 e 404 senza errori interni", JSON.stringify(deletions.map((r) => r.status).sort()) === "[200,404]" && await db.servizioCatalogo.count({ where: { id: service.id, tenantId } }) === 0);
  await api(cookie, `/proprietari/${p.id}`, "DELETE");
  check("cliente eliminato non resta selezionabile", (await api(cookie, `/proprietari/${p.id}`)).status === 404 && !(await api(cookie, "/proprietari?q=Cliente scelta attività")).data.some((v) => v.id === p.id));
  console.log(`Accesso attività Ormeggio: ${passed} PASS / 0 FAIL`);
} finally {
  await db.$disconnect();
}
