import { fetchConRevisioni } from "./_concorrenza-ormeggio.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const base = process.argv[2];
assicuraAmbienteSmoke("verifica-accesso-attivita.mjs", base);
const db = new PrismaClient();
const fetch = fetchConRevisioni(db);
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
  check("priorità normale predefinita per attività senza stelle esplicite", a.data.priorita === 2);
  const list = (await api(cookie, "/attivita?daFare=1")).data;
  check("attività trasversali identificano anche il cliente", list.find((v) => v.id === a.data.id)?.permanenza.boat.proprietario.nome === p.nome);
  await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato: "in_corso" });
  assert.equal((await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato: "completato" })).status, 200);
  const details = (await api(cookie, `/permanenze/${stay.data.id}`)).data;
  check("completamento usa il conto esistente senza doppio addebito", details.addebiti.filter((v) => v.attivitaId === a.data.id).length === 1 && details.conto.totaleAddebitiCent === 16700);
  check("attività non confluisce nel conto della sosta futura", (await api(cookie, `/permanenze/${future.data.id}`)).data.attivita.length === 0);
  const openActivity = (await api(cookie, "/attivita", "POST", { permanenzaId: stay.data.id, tipo: "Lavoro ancora aperto" })).data;
  await api(cookie, `/attivita/${openActivity.id}`, "PATCH", { stato: "in_corso" });
  const completed = (await api(cookie, "/attivita?stato=completato")).data;
  check("filtro completati esclude i lavori aperti", completed.length === 1 && completed[0].id === a.data.id);
  check("filtro in corso restituisce soltanto lo stato richiesto", (await api(cookie, "/attivita?stato=in_corso")).data.every((v) => v.stato === "in_corso"));
  check("filtro stato non valido rifiutato", (await api(cookie, "/attivita?stato=inesistente")).status === 422);
  check("lista aperte conserva il comportamento precedente", (await api(cookie, "/attivita?daFare=1")).data.every((v) => v.stato !== "completato"));
  check("completati senza permesso importi non espongono prezzi", (await api(limitedCookie, "/attivita?stato=completato")).data.every((v) => v.prezzoCent === null));
  const giorno = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" });
  const mezzanotteRoma = ["+01:00", "+02:00"].map((offset) => new Date(`${giorno}T00:00:00${offset}`)).find((d) => new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Rome", hourCycle: "h23", hour: "2-digit", minute: "2-digit" }).format(d) === "00:00");
  assert.ok(mezzanotteRoma);
  const casiArchivio = await Promise.all([
    { tipo: "Completata scadenza passata", dataPrevista: new Date("2000-01-01"), completatoAt: new Date() },
    { tipo: "Completata scadenza oggi", dataPrevista: new Date(giorno), completatoAt: new Date() },
    { tipo: "Completata scadenza futura", dataPrevista: new Date("2099-01-01"), completatoAt: new Date("2010-01-01") },
    { tipo: "Completata senza data ieri", completatoAt: new Date(mezzanotteRoma.getTime() - 1) },
    { tipo: "Completata senza data oggi", completatoAt: mezzanotteRoma },
    { tipo: "Completata storica senza timestamp", createdAt: new Date("2010-01-01") },
  ].map((data) => db.attivita.create({ data: { tenantId, permanenzaId: stay.data.id, stato: "completato", prezzoCent: 1500, ...data } })));
  const attuali = (await api(cookie, "/attivita?stato=completato&completate=attuali")).data;
  const archiviate = (await api(cookie, "/attivita?stato=completato&completate=archiviate")).data;
  check("completate di oggi e future restano nelle attività correnti", [casiArchivio[1], casiArchivio[2], casiArchivio[4]].every((v) => attuali.some((r) => r.id === v.id)));
  check("scadenze passate archiviate anche se completate oggi", archiviate.some((v) => v.id === casiArchivio[0].id) && !attuali.some((v) => v.id === casiArchivio[0].id));
  check("senza scadenza il cambio giorno usa la mezzanotte di Roma", archiviate.some((v) => v.id === casiArchivio[3].id) && !attuali.some((v) => v.id === casiArchivio[3].id) && !archiviate.some((v) => v.id === casiArchivio[4].id));
  check("completate storiche senza data usano la data di creazione", archiviate.some((v) => v.id === casiArchivio[5].id));
  check("archivio e correnti non condividono attività", attuali.every((v) => !archiviate.some((r) => r.id === v.id)));
  check("archivio esclude le attività ancora aperte dei giorni passati", archiviate.every((v) => v.stato === "completato") && attuali.every((v) => v.stato === "completato"));
  check("archivio mantiene i prezzi nascosti senza permesso importi", (await api(limitedCookie, "/attivita?stato=completato&completate=archiviate")).data.every((v) => v.prezzoCent === null));
  for (const query of ["completate=inesistente", "completate=archiviate", "stato=da_fare&completate=attuali", "stato=completato&daFare=1&completate=archiviate"]) {
    check(`filtro archivio incompatibile o non valido rifiutato: ${query}`, (await api(cookie, `/attivita?${query}`)).status === 422);
  }
  await db.attivita.deleteMany({ where: { tenantId, id: { in: casiArchivio.filter((_, i) => i !== 2).map((v) => v.id) } } });
  await db.attivita.createMany({ data: Array.from({ length: 205 }, (_, i) => ({ tenantId, permanenzaId: stay.data.id, tipo: `Storico Kanban ${i}`, stato: "completato", createdAt: new Date("2020-01-01"), completatoAt: new Date(Date.UTC(2020, 0, 1 + i)) })) });
  const cappedCompleted = (await api(cookie, "/attivita?stato=completato")).data;
  check("ultimi 200 completati ordinati dal più recente", cappedCompleted.length === 200 && cappedCompleted[0].id === a.data.id && cappedCompleted.every((v, i) => i === 0 || Date.parse(cappedCompleted[i - 1].completatoAt) >= Date.parse(v.completatoAt)));
  check("storico ampio non nasconde i lavori aperti", (await api(cookie, "/attivita?daFare=1")).data.some((v) => v.id === openActivity.id));
  check("filtro correnti applicato prima del limite 200 anche con storico ampio", (await api(cookie, "/attivita?stato=completato&completate=attuali")).data.some((v) => v.id === casiArchivio[2].id));
  await db.attivita.deleteMany({ where: { tenantId, tipo: { startsWith: "Storico Kanban " } } });
  await db.attivita.deleteMany({ where: { tenantId, id: { in: casiArchivio.map((v) => v.id) } } });
  const high = await api(cookie, "/attivita", "POST", { permanenzaId: stay.data.id, tipo: "Priorità alta", priorita: 3, dataPrevista: "2029-01-01", note: "Controllare le cime." });
  check("creazione salva tre stelle e note", high.status === 201 && high.data.priorita === 3 && high.data.note === "Controllare le cime.");
  check("lavori aperti ordinati per priorità prima della data", (await api(cookie, "/attivita?daFare=1")).data[0].id === high.data.id);
  const early = (await api(cookie, "/attivita", "POST", {permanenzaId:stay.data.id,tipo:"Scadenza anticipata",priorita:1,dataPrevista:"2000-01-01"})).data;
  const byDay = (await api(cookie, "/attivita?daFare=1&ordine=giorno")).data;
  check("ordine giorno dà precedenza alla scadenza anche con priorità bassa", byDay[0].id === early.id && byDay[1].id === high.data.id);
  check("ordine giorno mette i lavori senza data in fondo", byDay.slice(2).every(v=>v.dataPrevista === null));
  check("ordine priorità esplicito dà precedenza alle tre stelle", (await api(cookie, "/attivita?daFare=1&ordine=priorita")).data[0].id === high.data.id);
  check("ordinamento non valido rifiutato", (await api(cookie, "/attivita?ordine=inesistente")).status === 422);
  check("ordine giorno mantiene i prezzi nascosti agli addetti senza permesso", (await api(limitedCookie, "/attivita?daFare=1&ordine=giorno")).data.every(v=>v.prezzoCent === null));
  await db.attivita.createMany({data:Array.from({length:201},(_,i)=>({tenantId,permanenzaId:stay.data.id,tipo:`Limite ordine ${i}`,priorita:3,dataPrevista:new Date("2035-01-01")}))});
  check("limite 200 applicato dopo l’ordinamento per scadenza", (await api(cookie, "/attivita?daFare=1&ordine=giorno")).data[0].id === early.id && (await api(cookie, "/attivita?daFare=1&ordine=priorita")).data.every(v=>v.id !== early.id));
  await db.attivita.deleteMany({where:{tenantId,tipo:{startsWith:"Limite ordine "}}});
  for (const priorita of [0, 4, 1.5, "3"]) {
    check(`creazione rifiuta priorità non valida ${JSON.stringify(priorita)}`, (await api(cookie, "/attivita", "POST", { permanenzaId: stay.data.id, tipo: "Priorità errata", priorita })).status === 422);
    check(`modifica rifiuta priorità non valida ${JSON.stringify(priorita)}`, (await api(cookie, `/attivita/${high.data.id}`, "PATCH", { priorita })).status === 422);
  }
  const lowered = await api(limitedCookie, `/attivita/${high.data.id}`, "PATCH", { priorita: 1 });
  check("addetto senza importi modifica la priorità senza cambiare il conto", lowered.status === 200 && lowered.data.priorita === 1 && await db.addebito.count({ where: { tenantId, attivitaId: high.data.id } }) === 0);
  let constrained = false;
  try { await db.$executeRaw`UPDATE "Attivita" SET "priorita" = 4 WHERE "id" = ${high.data.id} AND "tenantId" = ${tenantId}`; } catch (e) { constrained = e.code === "P2010" && e.meta?.code === "23514"; }
  check("vincolo database impedisce priorità fuori scala", constrained && (await db.attivita.findFirst({where:{tenantId,id:high.data.id}})).priorita === 1);
  await api(limitedCookie, `/attivita/${high.data.id}`, "PATCH", { stato: "completato" });
  for (const stato of ["in_corso", "da_fare"]) {
    const back = await api(limitedCookie, `/attivita/${high.data.id}`, "PATCH", { stato });
    check(`ritorno a ${stato} di un lavoro gratuito azzera completatoAt`, back.status === 200 && back.data.stato === stato && back.data.completatoAt === null);
  }
  check("riapertura di lavoro contabilizzato richiede storno esplicito", (await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato: "in_corso" })).status === 409);
  await db.addebito.updateMany({where:{tenantId,attivitaId:a.data.id},data:{stato:"pagato"}});
  check("addebito pagato blocca riapertura anche con storno esplicito", (await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato:"da_fare",storno:true })).status === 409);
  await db.addebito.updateMany({where:{tenantId,attivitaId:a.data.id},data:{stato:"da_pagare"}});
  const reopen = await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato:"in_corso",storno:true });
  check("storno confermato riapre e rimuove soltanto l’addebito collegato", reopen.status === 200 && reopen.data.stato === "in_corso" && reopen.data.completatoAt === null && await db.addebito.count({where:{tenantId,attivitaId:a.data.id}}) === 0);
  await api(cookie, `/attivita/${a.data.id}`, "PATCH", { stato:"completato" });
  check("ricompletare dopo storno non duplica l’addebito", await db.addebito.count({where:{tenantId,attivitaId:a.data.id}}) === 1);
  const secondTenant = await db.tenant.create({ data: { nome: "Altra azienda attività", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } });
  check("priorità non modificabile da un’altra azienda", (await api(await token(await user(secondTenant.id)), `/attivita/${high.data.id}`, "PATCH", {priorita:3})).status === 404);
  check("filtro completati isolato per azienda", (await api(await token(await user(secondTenant.id)), "/attivita?stato=completato")).data.length === 0);
  check("archivio completate isolato per azienda", (await api(await token(await user(secondTenant.id)), "/attivita?stato=completato&completate=archiviate")).data.length === 0);
  check("cliente di un'altra azienda non accessibile", (await api(await token(await user(secondTenant.id)), `/proprietari/${p.id}`)).status === 404);
  check("skipper non accede ai clienti Ormeggio", (await api(await token(await user(tenantId, "skipper")), `/proprietari/${p.id}`)).status === 403);
  const rental = await db.tenant.create({ data: { nome: "Noleggio attività", status: "active", tipoModulo: "noleggio", moduloOrmeggio: false } });
  check("azienda solo Noleggio non accede al selettore Ormeggio", (await api(await token(await user(rental.id)), `/proprietari/${p.id}`)).status === 403);
  check("cliente inesistente risponde 404", (await api(cookie, `/proprietari/${randomUUID()}`)).status === 404);
  const service = (await api(cookie, "/servizi", "POST", { nome: "Servizio eliminazione concorrente", prezzoCent: 900 })).data;
  check("eliminazione servizio di un'altra azienda rifiutata", (await api(await token(await user(secondTenant.id)), `/servizi/${service.id}`, "DELETE")).status === 404 && await db.servizioCatalogo.count({ where: { id: service.id, tenantId } }) === 1);
  check("configurazione catalogo riservata al titolare anche in eliminazione", (await api(limitedCookie, `/servizi/${service.id}`, "DELETE")).status === 403);
  const deletions = await Promise.all([api(cookie, `/servizi/${service.id}`, "DELETE"), api(cookie, `/servizi/${service.id}`, "DELETE")]);
  check("due eliminazioni simultanee restituiscono 200 e 404 senza errori interni", JSON.stringify(deletions.map((r) => r.status).sort()) === "[200,404]" && await db.servizioCatalogo.count({ where: { id: service.id, tenantId } }) === 0);
  await api(cookie, `/proprietari/${p.id}`, "DELETE");
  check("cliente eliminato non resta selezionabile", (await api(cookie, `/proprietari/${p.id}`)).status === 404 && !(await api(cookie, "/proprietari?q=Cliente scelta attività")).data.some((v) => v.id === p.id));
  console.log(`Accesso attività Ormeggio: ${passed} PASS / 0 FAIL`);
} finally {
  await db.$disconnect();
}
