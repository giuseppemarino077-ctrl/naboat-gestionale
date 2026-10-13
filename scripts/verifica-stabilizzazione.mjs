import { fetchConRevisioni } from "./_concorrenza-ormeggio.mjs";
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import { assicuraAmbienteSmoke } from "./_guardia-ambiente.mjs";

const base = process.argv[2];
assicuraAmbienteSmoke("verifica-stabilizzazione.mjs", base);
const db = new PrismaClient();
const fetch = fetchConRevisioni(db);
let passed = 0;
async function token(user) {
  return new SignJWT({ sub: user.id, role: user.role, tenantId: user.tenantId, twofa: true, ver: user.sessionVersion })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h")
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET));
}
async function api(cookie, path, method = "GET", body) {
  const res = await fetch(`${base}/api/v1${path}`, {
    method,
    headers: { Cookie: `nb_session=${cookie}`, ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = res.headers.get("content-type")?.includes("application/json") ? await res.json() : await res.text();
  return { status: res.status, data };
}
function check(name, value) {
  assert.ok(value, name);
  passed++;
  console.log(`PASS  ${name}`);
}
try {
  await db.platformSettings.update({ where: { id: "singleton" }, data: { abbonamentoObbligatorio: false } });
  const owner = await db.user.findUniqueOrThrow({ where: { email: "titolare@demo.naboat.it" } });
  await db.tenant.update({ where: { id: owner.tenantId }, data: { pianoTipo: "pro" } });
  const cookie = await token(owner);
  const boat = await api(cookie, "/boats", "POST", { nome: "Verifica tipo modello", tipoCodice: "gommone", modelloTesto: "Marca Modello", capienza: 6 });
  check("tipo canonico e modello persistiti", boat.status === 201 && boat.data.tipo === "Gommone (pneumatico)" && boat.data.modelloTesto === "Marca Modello");
  check("tipo sconosciuto rifiutato in creazione", (await api(cookie, "/boats", "POST", { nome: "Tipo errato", tipoCodice: "inesistente" })).status === 422);
  check("tipo sconosciuto rifiutato in modifica", (await api(cookie, `/boats/${boat.data.id}`, "PATCH", { tipoCodice: "inesistente" })).status === 422);
  const copy = await api(cookie, `/boats/${boat.data.id}/duplicate`, "POST");
  check("duplicazione conserva tipo canonico e modello", copy.status === 201 && copy.data.tipoCodice === "gommone" && copy.data.modelloTesto === "Marca Modello");
  const tariff = await api(cookie, "/tariffe", "POST", { boatId: boat.data.id, tipo: "giornata", stagione: "tutto_anno", prezzoEuro: "100,00" });
  check("listino per la prova creato", tariff.status === 201);
  const extra = await api(cookie, "/extras", "POST", { nome: "Extra riservato", prezzo: 12.34 });
  check("extra creato", extra.status === 201);
  await api(cookie, `/boats/${boat.data.id}/extra`, "PUT", { voci: [{ extraId: extra.data.id, associato: true }] });
  await api(cookie, `/boats/${boat.data.id}/extra`, "PUT", { voci: [{ extraId: extra.data.id, associato: false }] });
  const removed = await db.extra.findFirstOrThrow({ where: { id: extra.data.id, tenantId: owner.tenantId } });
  check("ultima associazione rimossa non estende l'extra a tutte", removed.scope === "elenco" && removed.boatIds.length === 0);

  const booking = await api(cookie, "/bookings", "POST", { boatId: boat.data.id, startAt: "2029-09-10T09:00:00.000Z", endAt: "2029-09-10T18:00:00.000Z", clienteNome: "Cliente verifica", passeggeri: 2, prezzoEuro: "100,00" });
  check("prenotazione per contratto creata", booking.status === 201);
  const contract = await api(cookie, `/bookings/${booking.data.id}/contratto`, "POST");
  const publicToken = contract.data.url.split("/contratto/")[1];
  const publicContract = await fetch(`${base}/api/v1/contratto/public/${publicToken}`).then((r) => r.json());
  check("contratto espone il modello congelato", publicContract.barca.modello === "Marca Modello");
  const signed = await fetch(`${base}/api/v1/contratto/public/${publicToken}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Cliente verifica", accettato: true, versione: publicContract.versione, hash: publicContract.hash }) });
  check("firma della versione congelata", signed.status === 200);
  await api(cookie, `/boats/${boat.data.id}`, "PATCH", { modelloTesto: "Modello modificato" });
  const after = await fetch(`${base}/api/v1/contratto/public/${publicToken}`).then((r) => r.json());
  check("modificare la barca non riscrive il contratto firmato", after.barca.modello === "Marca Modello" && after.hash === publicContract.hash);

  const limited = await db.user.create({ data: { tenantId: owner.tenantId, email: "senza-importi@verifica.test", role: "operatore", vedeImporti: false, emailVerified: true } });
  const restricted = await token(limited);
  for (const [path, method, body] of [
    ["/extras", "GET"],
    ["/extras", "POST", { nome: "Vietato", prezzo: 10 }],
    [`/extras/${extra.data.id}`, "PATCH", { prezzo: 10 }],
    [`/extras/${extra.data.id}`, "DELETE"],
    [`/bookings/${booking.data.id}/contratto/pdf`, "GET"],
  ]) check(`senza importi: ${method} ${path} -> 403`, (await api(restricted, path, method, body)).status === 403);

  const orm = await db.user.findUniqueOrThrow({ where: { email: process.env.SMOKE_ORM_EMAIL } });
  const ormCookie = await token(orm);
  const area = await api(ormCookie, "/ormeggio/aree", "POST", { nome: "Verifica nuovi campi", righe: 1, colonne: 1 });
  const areas = await api(ormCookie, "/ormeggio/aree");
  const place = areas.data.find((a) => a.id === area.data.id).posti[0];
  const payload = { postoId: place.id, nuovoProprietario: { nome: "Proprietario verifica", telefono: "3338881122" }, nuovaBarca: { nome: "Custodia verifica", tipoCodice: "vela", modelloTesto: "Modello vela" }, inizioAt: "2026-10-01", finePrevistaAt: "2027-10-01", corrispettivoCent: 12000 };
  check("Ormeggio rifiuta il tipo sconosciuto", (await api(ormCookie, "/ormeggio/permanenze", "POST", { ...payload, nuovaBarca: { ...payload.nuovaBarca, tipoCodice: "inesistente" } })).status === 422);
  const stay = await api(ormCookie, "/ormeggio/permanenze", "POST", payload);
  check("Ormeggio crea permanenza con nome e tipo", stay.status === 201);
  const detail = await api(ormCookie, `/ormeggio/permanenze/${stay.data.id}`);
  check("scheda Ormeggio usa solo nome e tipo", detail.data.boat.tipoCodice === "vela" && detail.data.boat.modelloTesto === null);
  await api(ormCookie, `/ormeggio/permanenze/${stay.data.id}/contratto`, "POST");
  const limitedOrm = await db.user.create({ data: { tenantId: orm.tenantId, email: "orm-senza-importi@verifica.test", role: "operatore", vedeImporti: false, emailVerified: true } });
  const ormRestricted = await token(limitedOrm);
  const hidden = await api(ormRestricted, `/ormeggio/permanenze/${stay.data.id}`);
  check("scheda Ormeggio senza importi né snapshot contrattuale", hidden.status === 200 && hidden.data.conto === null && hidden.data.contratto === null && hidden.data.addebiti.length === 0 && hidden.data.payments.length === 0);
  check("PDF Ormeggio vietato senza importi", (await api(ormRestricted, `/ormeggio/permanenze/${stay.data.id}/riepilogo`)).status === 403);
  check("altro tenant non legge la permanenza", (await api(cookie, `/ormeggio/permanenze/${stay.data.id}`)).status === 403);
  console.log(`\nStabilizzazione: ${passed} PASS / 0 FAIL`);
} finally {
  await db.$disconnect();
}
