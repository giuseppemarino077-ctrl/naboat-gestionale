import { fetchConRevisioni } from "./_concorrenza-ormeggio.mjs";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const base = process.argv[2];
assicuraAmbienteSmoke("verifica-catalogo-servizi.mjs", base);
const db = new PrismaClient();
const fetch = fetchConRevisioni(db);
let passed = 0;
const check = (name, value) => { assert.ok(value, name); passed++; console.log(`PASS  catalogo servizi: ${name}`); };
async function accesso(tenantId, vedeImporti = true) {
  const user = await db.user.create({ data: { tenantId, vedeImporti, role: vedeImporti ? "owner" : "operatore", email: `${randomUUID()}@catalogo.test`, emailVerified: true, passwordHash: "solo-database-temporaneo" } });
  return new SignJWT({ sub: user.id, tenantId, role: user.role, twofa: true, ver: user.sessionVersion }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
async function api(cookie, path = "/servizi", method = "GET", body) {
  const r = await fetch(`${base}/api/v1/ormeggio${path}`, { method, headers: { Cookie: `nb_session=${cookie}`, "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await r.json();
  assert.ok(r.ok, `${path}: ${data.error ?? r.status}`);
  return data;
}
try {
  const tenant = await db.tenant.create({ data: { nome: "Ordine catalogo", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } });
  const tenantId = tenant.id;
  const cookie = await accesso(tenantId);
  const prima = await api(cookie, "/servizi", "POST", { nome: "Zeta creato prima dei predefiniti", prezzoCent: 1200 });
  await api(cookie, "/servizi/predefiniti", "POST", {});
  const iniziali = await api(cookie);
  check("servizio manuale creato prima dell’inizializzazione resta in cima", iniziali[0].id === prima.id && !iniziali[0].predefinito && iniziali.slice(1).every(s => s.predefinito));
  const recente = await api(cookie, "/servizi", "POST", { nome: "Zeta nuovo servizio", prezzoCent: 1000 });
  const ultimo = await api(cookie, "/servizi", "POST", { nome: "Alfa ultimo servizio", prezzoCent: 1500 });
  let elenco = await api(cookie);
  check("servizi personalizzati ordinati dal più recente prima dei predefiniti", JSON.stringify(elenco.slice(0, 3).map(s => s.id)) === JSON.stringify([ultimo.id, recente.id, prima.id]) && elenco.slice(3).every(s => s.predefinito));
  const baseService = elenco.find(s => s.nome === "Lavaggio esterno");
  await api(cookie, `/servizi/${baseService.id}`, "PATCH", { nome: "AAA predefinito rinominato", predefinito: false });
  await api(cookie, `/servizi/${prima.id}`, "PATCH", { nome: "AAA personalizzato rinominato" });
  elenco = await api(cookie);
  check("rinomina dei predefiniti non cambia l’origine né li porta sopra i personalizzati", elenco.find(s => s.id === baseService.id).predefinito && elenco.findIndex(s => s.id === baseService.id) >= 3);
  check("modifica di un servizio personalizzato conserva l’ordine di creazione", elenco[2].id === prima.id);
  const omonimo = await api(cookie, "/servizi", "POST", { nome: "Ormeggio mensile", prezzoCent: 2000, predefinito: true });
  elenco = await api(cookie);
  check("servizio manuale omonimo a un predefinito resta personalizzato e primo", elenco[0].id === omonimo.id && !elenco[0].predefinito);
  const predefiniti = elenco.filter(s => s.predefinito).map(s => s.nome);
  check("predefiniti mantengono l’ordine alfabetico", predefiniti.every((s, i) => i === 0 || predefiniti[i - 1].localeCompare(s, "it-IT") <= 0));
  check("inizializzazione ripetuta non duplica o riclassifica i servizi manuali", (await api(cookie, "/servizi/predefiniti", "POST", {})).aggiunti === 0 && (await api(cookie)).length === elenco.length);
  const limitati = await api(await accesso(tenantId, false));
  check("ordine identico per addetti senza importi e prezzi protetti", JSON.stringify(limitati.map(s => s.id)) === JSON.stringify(elenco.map(s => s.id)) && limitati.every(s => s.prezzoCent === null));
  const altro = await db.tenant.create({ data: { nome: "Altro catalogo", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } });
  check("elenco resta isolato per azienda", (await api(await accesso(altro.id))).length === 0);

  const storico = await db.tenant.create({ data: { nome: "Catalogo storico", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true } });
  const batch = new Date("2026-01-01T10:00:00.000Z");
  const manuale = await db.servizioCatalogo.create({ data: { tenantId: storico.id, nome: "Ormeggio mensile", createdAt: new Date(batch.getTime() - 1000) } });
  await db.servizioCatalogo.createMany({ data: ["Predefinito rinominato uno", "Predefinito rinominato due"].map(nome => ({ tenantId: storico.id, nome, createdAt: batch })) });
  const estraneo = await db.servizioCatalogo.create({ data: { tenantId: altro.id, nome: "Altra azienda stessa data", createdAt: batch } });
  await db.auditLog.create({ data: { tenantId: storico.id, azione: "ormeggio.servizi.predefiniti", entita: "ServizioCatalogo", dettagli: JSON.stringify({ aggiunti: 3 }), createdAt: new Date(batch.getTime() + 7) } });
  const migrazione = await readFile("prisma/migrations/20261010120000_ormeggio_servizi_personalizzati/migration.sql", "utf8");
  const recuperoOrigine = migrazione.slice(migrazione.indexOf('UPDATE "ServizioCatalogo"'));
  await db.$executeRawUnsafe(recuperoOrigine);
  const recuperati = await db.servizioCatalogo.findMany({ where: { tenantId: storico.id } });
  check("migrazione riconosce lotto storico rinominato anche dopo eliminazioni", recuperati.filter(s => s.predefinito).length === 2);
  check("migrazione conserva servizio manuale anteriore anche con nome predefinito", !recuperati.find(s => s.id === manuale.id).predefinito);
  check("migrazione non confonde aziende con la stessa data di creazione", !(await db.servizioCatalogo.findFirst({ where: { id: estraneo.id, tenantId: altro.id } })).predefinito);
  await db.$executeRawUnsafe(recuperoOrigine);
  check("recupero origine storico idempotente", await db.servizioCatalogo.count({ where: { tenantId: storico.id, predefinito: true } }) === 2);
  console.log(`Catalogo servizi Ormeggio: ${passed} PASS / 0 FAIL`);
} finally {
  await db.$disconnect();
}
