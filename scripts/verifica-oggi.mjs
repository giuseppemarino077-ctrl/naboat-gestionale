// Verifica end-to-end delle funzionalità introdotte oggi (API-level), con pulizia.
// Uso: node scripts/verifica-oggi.mjs [baseUrl]
// Sceglie una barca di un'azienda "test" (non i dati reali) e firma una sessione
// owner con AUTH_SECRET, senza bisogno di password.
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";

for (const file of [".env.local", ".env"]) {
  try {
    for (const riga of readFileSync(file, "utf8").split("\n")) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* assente */ }
}

const BASE = process.argv[2] || "http://localhost:3000";
const prisma = new PrismaClient();
let pass = 0, fail = 0;
const issues = [];
const T = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; issues.push(`${name} :: ${detail}`); console.log(`FAIL  ${name}  ${detail}`); }
};

const corsia = async (path, method = "GET", body) => {
  const r = await fetch(BASE + path, {
    method,
    headers: body ? { ...H, "Content-Type": "application/json" } : H,
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let data = null; try { data = await r.json(); } catch {}
  return { status: r.status, data, headers: r.headers };
};
let H = {};

const run = async () => {
  const boat = await prisma.boat.findFirst({
    where: { uso: "noleggio", archiviato: false, tenant: { status: "active", users: { some: { email: { endsWith: "test.local" } } } } },
    select: { id: true, nome: true, tenantId: true },
  });
  if (!boat) { console.log("Nessuna barca di test disponibile: esegui prima lo smoke test."); return; }
  const owner = await prisma.user.findFirst({ where: { tenantId: boat.tenantId, role: "owner" }, select: { id: true } });
  if (!owner) { console.log("Nessun owner di test."); return; }
  const jwt = await new SignJWT({ sub: owner.id, tenantId: boat.tenantId, role: "owner", tenantStatus: "active", twofa: true, ver: 0 })
    .setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("1h").sign(new TextEncoder().encode(process.env.AUTH_SECRET));
  H = { Cookie: `nb_session=${jwt}` };
  console.log(`Barca di test: ${boat.nome} (${boat.id})\n`);

  const stamp = Date.now();
  const key = (s) => `verifica-oggi-${stamp}-${s}`;
  const mk = (body) => corsia("/api/v1/bookings", "POST", body);
  const creata = [];

  // ---- 1. Anagrafica: riconoscimento e allineamento per nome/telefono ----
  const bA = await mk({ boatId: boat.id, startAt: `2029-01-10T09:00:00.000Z`, endAt: `2029-01-10T17:00:00.000Z`, passeggeri: 2, clienteNome: "Oggi Test Rossi", telefono: "+393330010001", stato: "prenotata", patenteRisposta: "YES", idempotencyKey: key("a") });
  T("prenotazione 1 creata", bA.status === 201, `${bA.status} ${JSON.stringify(bA.data).slice(0, 120)}`);
  creata.push(bA.data?.id);
  const bB = await mk({ boatId: boat.id, startAt: `2029-01-11T09:00:00.000Z`, endAt: `2029-01-11T17:00:00.000Z`, passeggeri: 2, clienteNome: "Oggi Test Rossi", stato: "prenotata", patenteRisposta: "YES", idempotencyKey: key("b") });
  creata.push(bB.data?.id);
  const bC = await mk({ boatId: boat.id, startAt: `2029-01-12T09:00:00.000Z`, endAt: `2029-01-12T17:00:00.000Z`, passeggeri: 2, clienteNome: "Oggi Test Sbagliato", telefono: "+393330010001", stato: "prenotata", patenteRisposta: "YES", idempotencyKey: key("c") });
  creata.push(bC.data?.id);
  T("telefono mancante compilato dall'anagrafica", bB.data?.telefono === "+393330010001", `${bB.data?.telefono}`);
  T("nome sbagliato corretto dall'anagrafica", bC.data?.clienteNome === "Oggi Test Rossi", `${bC.data?.clienteNome}`);
  const dup = await prisma.customer.count({ where: { tenantId: boat.tenantId, nome: "Oggi Test Rossi" } });
  T("nessun doppione in anagrafica", dup === 1, `trovati ${dup}`);

  // ---- 2. Eliminazione cliente ----
  const cli = await prisma.customer.findFirst({ where: { tenantId: boat.tenantId, nome: "Oggi Test Rossi" }, select: { id: true } });
  const del = await corsia(`/api/v1/customers/${cli.id}`, "DELETE");
  const restanti = await prisma.customer.count({ where: { id: cli.id } });
  T("eliminazione cliente", del.status === 200 && restanti === 0, `${del.status}`);
  const scollegata = await prisma.booking.findUnique({ where: { id: bA.data.id }, select: { customerId: true } });
  T("prenotazioni restano con collegamento azzerato", scollegata?.customerId === null);

  // ---- 3. Riprogrammazione senza motivo ----
  const rip = await corsia(`/api/v1/bookings/${bA.data.id}/riprogramma`, "POST", { boatId: boat.id, startAt: "2029-01-13T09:00:00.000Z", endAt: "2029-01-13T17:00:00.000Z", passeggeri: 2 });
  creata.push(rip.data?.id);
  T("riprogrammazione senza motivo", rip.status === 201 && rip.data?.motivoRiprogrammazione === null, `${rip.status}`);

  // ---- 4. Contratto: testo, PDF, invio ----
  const patchContr = await corsia(`/api/v1/bookings/${bB.data.id}`, "PATCH", { contrattoTesto: "Clausola di prova uno\nClausola di prova due" });
  T("testo contratto salvato", patchContr.status === 200, `${patchContr.status}`);
  const link = await corsia(`/api/v1/bookings/${bB.data.id}/contratto`, "POST");
  const tokenC = String(link.data?.url ?? "").split("/contratto/")[1] ?? "";
  T("link contratto generato", link.status === 200 && tokenC.length > 0, `${link.status}`);
  const pub = await fetch(`${BASE}/api/v1/contratto/public/${tokenC}`).then((r) => r.json()).catch(() => ({}));
  T("il contratto pubblico usa il testo personalizzato", Array.isArray(pub.condizioni) && pub.condizioni[0] === "Clausola di prova uno", JSON.stringify(pub.condizioni));
  const pdf = await fetch(`${BASE}/api/v1/bookings/${bB.data.id}/contratto/pdf`, { headers: H });
  const pdfBuf = Buffer.from(await pdf.arrayBuffer());
  T("contratto PDF scaricabile", pdf.status === 200 && pdf.headers.get("content-type")?.includes("application/pdf") && pdfBuf.slice(0, 5).toString() === "%PDF-", `${pdf.status}`);
  const invia = await corsia(`/api/v1/bookings/${bB.data.id}/contratto/invia`, "POST", { canale: "email" });
  T("invio contratto non genera errori server", invia.status === 200 || invia.status === 422, `${invia.status}`);

  // ---- 5. Esperienze: attivazione, allocazione, filtro, rimozione ----
  const noleggioBase = await fetch(`${BASE}/noleggia`).then((r) => r.text());
  const att = await corsia("/api/v1/esperienze", "PUT", { attive: ["taxi"], personalizzate: [], allocazioni: [{ boatId: boat.id, esperienze: ["taxi"], personalizzate: [] }] });
  T("esperienza attivata e allocata", att.status === 200 && att.data?.attive?.includes("taxi"), `${att.status}`);
  const dopo = await corsia("/api/v1/esperienze");
  T("stato esperienze coerente", dopo.data?.barche?.find((b) => b.id === boat.id)?.esperienze?.includes("taxi") === true);
  const rim = await corsia(`/api/v1/boats/${boat.id}`, "PATCH", { esperienze: [] });
  T("rimozione esperienza dalla barca", rim.status === 200 && (rim.data?.esperienze ?? []).length === 0, `${rim.status}`);
  await corsia("/api/v1/esperienze", "PUT", { attive: [], personalizzate: [], allocazioni: [] });
  void noleggioBase;

  // ---- 6. Meteo a base unica ----
  const meteo = await corsia("/api/v1/meteo");
  T("meteo: una sola previsione, senza barca", meteo.status === 200 && (meteo.data?.luoghi ?? []).length <= 1 && meteo.data?.luoghi?.every((l) => l.boatId === undefined) !== false, `${meteo.status}`);

  // ---- 7. Blocco a giornata intera impedisce la prenotazione ----
  const blk = await corsia("/api/v1/blocks", "POST", { boatId: boat.id, startAt: "2029-02-15T00:00:00.000Z", endAt: "2029-02-15T23:59:59.000Z", motivo: "Verifica oggi" });
  T("blocco giornaliero creato", blk.status === 201, `${blk.status}`);
  const bkBloccata = await mk({ boatId: boat.id, startAt: "2029-02-15T09:00:00.000Z", endAt: "2029-02-15T17:00:00.000Z", passeggeri: 2, clienteNome: "Oggi Bloccata", stato: "prenotata", patenteRisposta: "YES", idempotencyKey: key("blk") });
  T("prenotazione su giornata bloccata rifiutata (409)", bkBloccata.status === 409, `${bkBloccata.status}`);
  if (blk.data?.id) {
    const sblocca = await corsia(`/api/v1/blocks/${blk.data.id}`, "DELETE");
    T("sblocco del blocco", sblocca.status === 200, `${sblocca.status}`);
  }

  // ---- Pulizia ----
  const idValori = creata.filter(Boolean);
  await prisma.booking.deleteMany({ where: { OR: [{ id: { in: idValori } }, { sostituisceId: { in: idValori } }, { idempotencyKey: { startsWith: `verifica-oggi-${stamp}` } }] } });
  await prisma.customer.deleteMany({ where: { tenantId: boat.tenantId, nome: { in: ["Oggi Test Rossi", "Oggi Test Sbagliato", "Oggi Bloccata"] } } });
  await prisma.tenant.update({ where: { id: boat.tenantId }, data: { esperienzeAttive: [], esperienzePersonalizzate: [] } });
  console.log("\n(pulizia completata)");
};

run()
  .catch((e) => { console.error("ERRORE:", e); process.exitCode = 1; })
  .finally(async () => {
    console.log("\n====================================");
    console.log(`RISULTATO: ${pass} PASS / ${fail} FAIL`);
    if (issues.length) console.log("PROBLEMI:\n - " + issues.join("\n - "));
    console.log("====================================");
    await prisma.$disconnect();
    if (fail > 0) process.exitCode = 1;
  });
