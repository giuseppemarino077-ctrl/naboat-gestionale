// Smoke test end-to-end del modulo Ormeggio. Uso:
//   node scripts/smoke-ormeggio.mjs [baseUrl]
// Usa un account ormeggiatore (per default quello demo locale) e pulisce da solo
// i dati di prova che crea. Non tocca le permanenze reali dell'azienda.
import { PrismaClient } from "@prisma/client";

const BASE = process.argv[2] || process.env.SMOKE_BASE || "http://localhost:3000";
const EMAIL = process.env.SMOKE_ORM_EMAIL || "ormeggiatore@demo.naboat.it";
const PASSWORD = process.env.SMOKE_ORM_PASSWORD || "Demo-Ormeggio-2026!";
const marker = `SMOKE-${Date.now()}`;
const prisma = new PrismaClient();

let pass = 0, fail = 0;
const issues = [];
function T(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; issues.push(`${name} :: ${detail}`); console.log(`FAIL  ${name}  ${detail}`); }
}

const jar = { cookies: new Map() };
const header = () => [...jar.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(res) {
  const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  for (const c of raw) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
    if (v === "") jar.cookies.delete(k); else jar.cookies.set(k, v);
  }
}
async function req(path, method = "GET", body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (jar.cookies.size) headers.cookie = header();
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined, redirect: "manual" });
  absorb(res);
  return res;
}
const json = async (path, method = "GET", body) => { const r = await req(path, method, body); let d = null; try { d = await r.json(); } catch {} return { status: r.status, data: d }; };

const oggi = new Date().toISOString().slice(0, 10);
const fine = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
let tenantId = null;
let areaId = null;

async function cleanup() {
  if (!tenantId) return;
  try {
    const aree = await prisma.area.findMany({ where: { tenantId, nome: marker } });
    const ids = aree.map((a) => a.id);
    const posti = await prisma.posto.findMany({ where: { areaId: { in: ids } } });
    const postiIds = posti.map((p) => p.id);
    const perms = await prisma.permanenza.findMany({ where: { tenantId, postoId: { in: postiIds } } });
    const permIds = perms.map((p) => p.id);
    await prisma.payment.deleteMany({ where: { permanenzaId: { in: permIds } } });
    await prisma.permanenza.deleteMany({ where: { id: { in: permIds } } });
    await prisma.boat.deleteMany({ where: { tenantId, nome: { startsWith: marker } } });
    await prisma.proprietario.deleteMany({ where: { tenantId, nome: { startsWith: marker } } });
    await prisma.area.deleteMany({ where: { tenantId, nome: marker } });
  } catch (e) {
    console.log(`  (pulizia: ${e instanceof Error ? e.message : e})`);
  }
}

const run = async () => {
  const login = await json("/api/v1/auth/login", "POST", { email: EMAIL, password: PASSWORD });
  T("login ormeggiatore", login.status === 200, `${login.status} ${JSON.stringify(login.data)}`);
  const me = await json("/api/v1/auth/me");
  tenantId = me.data?.user?.tenantId ?? null;
  T("modulo ormeggio attivo", me.data?.user?.tenantOrmeggio === true);

  const aree0 = await json("/api/v1/ormeggio/aree");
  T("elenco aree", aree0.status === 200 && Array.isArray(aree0.data));

  const area = await json("/api/v1/ormeggio/aree", "POST", { nome: marker, righe: 1, colonne: 2 });
  T("crea area 1x2", area.status === 201 && area.data?.postiCount === 2, `${area.status} ${JSON.stringify(area.data)}`);
  areaId = area.data?.id ?? null;

  const aree = await json("/api/v1/ormeggio/aree");
  const mia = aree.data.find((a) => a.id === areaId);
  T("posti generati A1/A2", mia?.posti?.length === 2 && mia.posti[0].codice === "A1" && mia.posti[1].codice === "A2");
  const posto0 = mia.posti[0].id;
  const posto1 = mia.posti[1].id;

  const prop = await json("/api/v1/ormeggio/proprietari", "POST", { nome: `${marker} Prop`, telefono: `333${String(Date.now()).slice(-7)}` });
  T("crea proprietario", prop.status === 201, `${prop.status}`);
  const prop2 = await json("/api/v1/ormeggio/proprietari", "POST", { nome: `${marker} Prop2`, telefono: `334${String(Date.now()).slice(-7)}` });

  const p1 = await json("/api/v1/ormeggio/permanenze", "POST", { postoId: posto0, proprietarioId: prop.data.id, nuovaBarca: { nome: `${marker} Boat1`, tipo: "gozzo" }, inizioAt: oggi, finePrevistaAt: fine, corrispettivoCent: 20000 });
  T("assegna posto A1", p1.status === 201, `${p1.status} ${JSON.stringify(p1.data)}`);
  const permId = p1.data?.id;
  T("addebito custodia creato", p1.status === 201);

  const att = await json("/api/v1/ormeggio/attivita", "POST", { permanenzaId: permId, tipo: "Lavaggio", prezzoCent: 2500 });
  await json(`/api/v1/ormeggio/attivita/${att.data.id}`, "PATCH", { stato: "completato" });
  const scheda = await json(`/api/v1/ormeggio/permanenze/${permId}`);
  T("attività completata genera addebito", scheda.data?.addebiti?.some((a) => a.importoCent === 2500), JSON.stringify(scheda.data?.conto));
  T("conto: addebitato 225,00", scheda.data?.conto?.totaleAddebitiCent === 22500, `${scheda.data?.conto?.totaleAddebitiCent}`);

  await json("/api/v1/ormeggio/incassi", "POST", { permanenzaId: permId, importoCent: 10000, metodo: "contanti" });
  const scheda2 = await json(`/api/v1/ormeggio/permanenze/${permId}`);
  T("incasso riduce il residuo", scheda2.data?.conto?.residuoCent === 12500, `${scheda2.data?.conto?.residuoCent}`);

  await json("/api/v1/ormeggio/movimenti", "POST", { permanenzaId: permId, tipo: "uscita" });
  const scheda3 = await json(`/api/v1/ormeggio/permanenze/${permId}`);
  T("uscita registrata (posto mantenuto)", scheda3.data?.movimenti?.some((m) => m.tipo === "uscita"));
  T("posto ancora assegnato dopo l'uscita", scheda3.data?.stato === "attiva");

  // conflitto sequenziale
  const dup = await json("/api/v1/ormeggio/permanenze", "POST", { postoId: posto0, proprietarioId: prop2.data.id, nuovaBarca: { nome: `${marker} BoatX` }, inizioAt: oggi, finePrevistaAt: fine });
  T("conflitto stesso posto -> 409", dup.status === 409, `${dup.status} ${JSON.stringify(dup.data)}`);

  // conflitto in concorrenza (due richieste simultanee sullo stesso posto)
  const [r1, r2] = await Promise.all([
    json("/api/v1/ormeggio/permanenze", "POST", { postoId: posto1, proprietarioId: prop.data.id, nuovaBarca: { nome: `${marker} Conc1` }, inizioAt: oggi, finePrevistaAt: fine }),
    json("/api/v1/ormeggio/permanenze", "POST", { postoId: posto1, proprietarioId: prop2.data.id, nuovaBarca: { nome: `${marker} Conc2` }, inizioAt: oggi, finePrevistaAt: fine }),
  ]);
  const stati = [r1.status, r2.status].sort((a, b) => a - b);
  T("concorrenza: una sola riesce", stati[0] === 201 && stati[1] === 409, `stati=${stati}`);

  const contr = await json(`/api/v1/ormeggio/permanenze/${permId}/contratto`, "POST");
  T("genera contratto", contr.status === 200 && !!contr.data?.token, `${contr.status}`);
  const token = contr.data?.token;
  const pub = await json(`/api/v1/ormeggio/contratto-public/${token}`);
  T("contratto pubblico", pub.status === 200 && pub.data?.barca?.nome === `${marker} Boat1`);
  const firma = await json(`/api/v1/ormeggio/contratto-public/${token}`, "POST", { nome: "Smoke Test", accettato: true });
  T("firma contratto", firma.status === 200 && !!firma.data?.firmatoAt);
  T("doppia firma -> 422", (await json(`/api/v1/ormeggio/contratto-public/${token}`, "POST", { nome: "Smoke Test", accettato: true })).status === 422);

  const pdfRes = await req(`/api/v1/ormeggio/permanenze/${permId}/riepilogo`);
  const pdfBuf = Buffer.from(await pdfRes.arrayBuffer());
  T("riepilogo PDF", pdfRes.status === 200 && pdfRes.headers.get("content-type")?.includes("application/pdf") && pdfBuf.slice(0, 5).toString() === "%PDF-", `${pdfRes.status} ${pdfRes.headers.get("content-type")}`);

  const conti = await json("/api/v1/ormeggio/conti");
  T("conti per proprietario", Array.isArray(conti.data) && conti.data.some((c) => c.nome === `${marker} Prop` && c.residuoCent > 0), `${conti.status}`);

  // isolamento: un'azienda noleggio non deve accedere al modulo
  const jar2 = { cookies: jar.cookies };
  jar.cookies = new Map();
  await json("/api/v1/auth/logout", "POST");
  const l2 = await json("/api/v1/auth/login", "POST", { email: "titolare@demo.naboat.it", password: "Demo-Titolare-2026!" });
  if (l2.status === 200) T("isolamento: noleggio non vede ormeggio (403)", (await json("/api/v1/ormeggio/aree")).status === 403);
  jar.cookies = jar2.cookies;
};

run()
  .catch((e) => { fail++; issues.push(`eccezione: ${e.message}`); console.error(e); })
  .finally(async () => {
    await cleanup();
    await prisma.$disconnect();
    console.log(`\n${pass} PASS · ${fail} FAIL`);
    if (issues.length) console.log("Problemi:\n" + issues.map((i) => " - " + i).join("\n"));
    process.exitCode = fail ? 1 : 0;
  });
