// Smoke test end-to-end delle API. Uso:
//   node scripts/smoke-test.mjs [baseUrl]
// Richiede un DB con dati demo (npm run db:seed). Non tocca i dati esistenti
// se non per creare/eliminare tenant di test (li lascia, sono pending/active isolati).
import { readFileSync } from "fs";

// Carica le variabili da .env.local / .env (come fa Next) senza dipendenze esterne.
for (const file of [".env.local", ".env"]) {
  try {
    for (const riga of readFileSync(file, "utf8").split("\n")) {
      const m = riga.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, "");
    }
  } catch { /* file assente */ }
}

const BASE = process.argv[2] || process.env.SMOKE_BASE || "http://localhost:3000";
import sharp from "sharp";
// Nessuna password predefinita: il test rifiuta di partire senza credenziali esplicite.
if (!process.env.SUPERADMIN_EMAIL || !process.env.SUPERADMIN_PASSWORD) {
  console.error("Imposta SUPERADMIN_EMAIL e SUPERADMIN_PASSWORD (es. in .env.local) prima di eseguire lo smoke test.");
  process.exit(1);
}
const SUPERADMIN = { email: process.env.SUPERADMIN_EMAIL, password: process.env.SUPERADMIN_PASSWORD };

let pass = 0, fail = 0;
const issues = [];
function T(name, cond, detail = "") {
  if (cond) { pass++; console.log(`PASS  ${name}`); }
  else { fail++; issues.push(`${name} :: ${detail}`); console.log(`FAIL  ${name}  ${detail}`); }
}

class Jar {
  constructor() { this.cookies = new Map(); }
  header() { return [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "); }
  absorb(res) {
    const raw = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
    for (const c of raw) {
      const [pair] = c.split(";");
      const i = pair.indexOf("=");
      const k = pair.slice(0, i).trim(), v = pair.slice(i + 1).trim();
      if (v === "") this.cookies.delete(k); else this.cookies.set(k, v);
    }
  }
  async fetch(path, opts = {}) {
    const headers = { ...(opts.headers || {}) };
    if (this.cookies.size) headers.cookie = this.header();
    const r = await fetch(BASE + path, { ...opts, headers, redirect: "manual" });
    this.absorb(r);
    return r;
  }
}

const jar = new Jar();
async function json(prefix, path, method = "GET", body) {
  const res = await jar.fetch(path, { method, headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
  let data = null; try { data = await res.json(); } catch {}
  return { status: res.status, data };
}
const reg = (name, email) => ({ azienda: name, nome: "Owner " + name, email, password: "password-smoke-123", accettaTermini: true });

const run = async () => {
  const h = await json("", "/api/healthz"); T("healthz", h.data?.ok === true);
  const r = await json("", "/api/readyz"); T("readyz (db+redis)", r.data?.ok === true, JSON.stringify(r.data));

  // tenant A
  const ea = `smokeA${Date.now()}@test.local`;
  const ra = await json("A", "/api/v1/auth/register", "POST", reg("Smoke A", ea));
  T("register A -> pending", ra.data?.status === "pending", `${ra.status}`);
  const meA0 = await json("A", "/api/v1/auth/me"); T("me pending", meA0.data?.user?.tenantStatus === "pending");
  T("pending bloccato", (await json("A", "/api/v1/boats")).status === 403);

  // admin approve
  const adm = new Jar();
  const l = await adm.fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(SUPERADMIN) });
  T("login superadmin", l.status === 200, `status=${l.status}`);
  const list = await (await adm.fetch("/api/v1/admin/tenants")).json();
  const tA = list.find((t) => t.nome === "Smoke A" && t.status === "pending");
  const ap = await adm.fetch("/api/v1/admin/tenants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tA.id, azione: "approve" }) });
  T("approve A", (await ap.json()).status === "active");
  // Extra e collaboratori sono del piano Pro: lo assegniamo per proseguire i test.
  await adm.fetch("/api/v1/admin/piani", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenantId: tA.id, piano: "pro" }) });
  T("superadmin senza tenantId 400", (await adm.fetch("/api/v1/boats")).status === 400);

  // owner A active
  const la = await jar.fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: ea, password: "password-smoke-123" }) });
  T("login A active", la.status === 200);

  const b = await json("A", "/api/v1/boats", "POST", { nome: "Smoke Boat", capienza: 4, patenteRichiesta: true });
  T("crea barca", b.data?.nome === "Smoke Boat", `${b.status}`);
  T("capienza 999 -> 422", (await json("A", "/api/v1/boats", "POST", { nome: "X", capienza: 999 })).status === 422);
  const dup = await json("A", `/api/v1/boats/${b.data.id}/duplicate`, "POST");
  T("duplica barca", dup.data?.nome?.includes("copia"));
  const sk = await json("A", "/api/v1/skippers", "POST", { nome: "Skipper Smoke" });
  T("crea skipper", sk.data?.nome === "Skipper Smoke");
  const ex = await json("A", "/api/v1/extras", "POST", { nome: "Extra Smoke", prezzo: 10 });
  T("crea extra", ex.data?.nome === "Extra Smoke");

  // bookings
  const t0 = "2028-05-10T09:00:00.000Z", t1 = "2028-05-10T18:00:00.000Z";
  const key = "smoke-" + Date.now();
  const bk = await json("A", "/api/v1/bookings", "POST", { boatId: b.data.id, startAt: t0, endAt: t1, clienteNome: "Cliente Smoke", telefono: "333123456", passeggeri: 3, skipperId: sk.data.id, idempotencyKey: key });
  T("crea prenotazione", bk.data?.stato === "prenotata", JSON.stringify(bk.data));
  const bk2 = await json("A", "/api/v1/bookings", "POST", { boatId: b.data.id, startAt: t0, endAt: t1, clienteNome: "Cliente Smoke", telefono: "333123456", passeggeri: 3, skipperId: sk.data.id, idempotencyKey: key });
  T("idempotency replay", bk2.data?.id === bk.data?.id);
  T("overlap 409", (await json("A", "/api/v1/bookings", "POST", { boatId: b.data.id, startAt: "2028-05-10T12:00:00.000Z", endAt: "2028-05-10T14:00:00.000Z", clienteNome: "X", telefono: "333999888", skipperId: sk.data.id, idempotencyKey: key + "b" })).status === 409);
  T("stato -> in_mare", (await json("A", `/api/v1/bookings/${bk.data.id}`, "PATCH", { stato: "in_mare" })).data?.stato === "in_mare");
  T("regressione stato 422", (await json("A", `/api/v1/bookings/${bk.data.id}`, "PATCH", { stato: "prenotata" })).status === 422);
  T("patente senza skipper 422", (await json("A", "/api/v1/bookings", "POST", { boatId: b.data.id, startAt: "2028-06-01T09:00:00.000Z", endAt: "2028-06-01T18:00:00.000Z", clienteNome: "Y", telefono: "333000777", idempotencyKey: key + "c" })).status === 422);
  T("calendario", (await json("A", "/api/v1/calendar?from=2028-05-01T00:00:00.000Z&to=2028-06-01T00:00:00.000Z")).data?.bookings?.length >= 1);
  T("clienti", (await json("A", "/api/v1/customers")).data?.length >= 1);

  // ---- Pagamenti ----
  const pset0 = await json("A", "/api/v1/payments/settings");
  T("impostazioni pagamenti (spenti)", pset0.status === 200 && pset0.data?.pagamentiAttivi === false);
  T("attivare senza fornitore -> 422", (await json("A", "/api/v1/payments/settings", "PATCH", { pagamentiAttivi: true })).status === 422);
  const pset1 = await json("A", "/api/v1/payments/settings", "PATCH", {
    stripeSecretKey: "sk_test_finta_per_smoke",
    stripeWebhookSecret: "whsec_finta_per_smoke",
    stripeAttivo: true,
    pagamentiAttivi: true,
    accontoPct: 30,
  });
  T("attiva pagamenti azienda", pset1.status === 200 && pset1.data?.pagamentiAttivi === true && pset1.data?.stripeAttivo === true, `${pset1.status} ${JSON.stringify(pset1.data)}`);
  // La fee NaBoat la imposta solo NaBoat: l'azienda non può modificarla.
  T("azienda non può modificare la fee NaBoat", (await json("A", "/api/v1/payments/settings", "PATCH", { feeNaboatPct: 99 })).status === 422);
  const condA = await adm.fetch("/api/v1/admin/subscriptions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ azione: "condizioniAzienda", id: tA.id, moduloMarketplace: true, feeNaboatPct: 10 }),
  });
  T("NaBoat imposta la fee dell'azienda", condA.status === 200 && (await condA.json()).feeNaboatPct === 10, `${condA.status}`);
  // Solo NaBoat decide il canale: la prenotazione di prova arriva da NaBoat (da qui matura la fee).
  const canaleBk = await adm.fetch("/api/v1/admin/bookings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: bk.data.id, origineCanale: "naboat" }) });
  T("NaBoat imposta il canale NaBoat della prenotazione", canaleBk.status === 200 && (await canaleBk.json()).origineCanale === "naboat", `${canaleBk.status}`);
  const pset2 = await json("A", "/api/v1/payments/settings");
  T("chiavi non esposte", pset2.data?.stripeSecretKey === undefined && pset2.data?.stripeConfigurato === true);

  T("link senza prezzo -> 422", (await json("A", "/api/v1/payments/checkout", "POST", { bookingId: bk.data.id })).status === 422);
  T("prezzo non valido -> 422", (await json("A", `/api/v1/bookings/${bk.data.id}`, "PATCH", { prezzoEuro: "abc" })).status === 422);
  const prezzo = await json("A", `/api/v1/bookings/${bk.data.id}`, "PATCH", { prezzoEuro: "500" });
  T("prezzo prenotazione salvato", prezzo.data?.prezzoCent === 50000, JSON.stringify(prezzo.data?.prezzoCent));

  const link = await json("A", "/api/v1/payments/checkout", "POST", { bookingId: bk.data.id });
  T("link di pagamento generato", link.status === 200 && String(link.data?.url).includes("/paga/"), `${link.status} ${JSON.stringify(link.data)}`);
  const token = String(link.data?.url ?? "").split("/paga/")[1] ?? "";

  const pub = await fetch(`${BASE}/api/v1/payments/public/${token}`);
  const pubData = await pub.json().catch(() => ({}));
  T("pagina pubblica accessibile senza login", pub.status === 200 && pubData?.prezzoCent === 50000, `status=${pub.status}`);
  T("link pubblico inesistente -> 404", (await fetch(`${BASE}/api/v1/payments/public/tokentinvalido12345`)).status === 404);
  T("webhook pagamenti: firma mancante -> 400", (await fetch(`${BASE}/api/v1/payments/webhook`, { method: "POST", body: "{}" })).status === 400);
  T("webhook abbonamenti: firma mancante -> 400", (await fetch(`${BASE}/api/v1/subscription/webhook`, { method: "POST", body: "{}" })).status === 400);

  const man = await json("A", "/api/v1/payments", "POST", { bookingId: bk.data.id, importoEuro: "500", metodo: "contanti", tipo: "totale" });
  T("incasso manuale registrato", man.status === 201 && man.data?.importoCent === 50000 && man.data?.feeNaboatCent === 5000, `${man.status} ${JSON.stringify(man.data)}`);
  const plist = await json("A", "/api/v1/payments");
  T("registro incassi", Array.isArray(plist.data) && plist.data.length >= 1);

  const rim = await json("A", `/api/v1/payments?id=${man.data.id}`, "PATCH", { azione: "rimborso" });
  T("rimborso parziale secondo regola (50%)", rim.status === 200 && rim.data?.rimborsoCent === 25000 && rim.data?.stato === "rimborsato_parziale", JSON.stringify(rim.data));
  // Il rimborso riguarda solo il capitale: la fee NaBoat (5000) non è rimborsabile.
  T("rimborso oltre il tetto (capitale) -> 422", (await json("A", `/api/v1/payments?id=${man.data.id}`, "PATCH", { azione: "rimborso", importoEuro: "300" })).status === 422);
  const idemRim = "smoke-rim-" + Date.now();
  const rimIdem1 = await json("A", `/api/v1/payments?id=${man.data.id}`, "PATCH", { azione: "rimborso", importoEuro: "50", idempotencyKey: idemRim });
  const rimIdem2 = await json("A", `/api/v1/payments?id=${man.data.id}`, "PATCH", { azione: "rimborso", importoEuro: "50", idempotencyKey: idemRim });
  T("stessa chiave idempotenza: un solo rimborso", rimIdem1.status === 200 && rimIdem2.status === 200 && rimIdem2.data?.riutilizzato === true && rimIdem2.data?.rimborsoCent === rimIdem1.data?.rimborsoCent, `${rimIdem1.status}/${rimIdem2.status} ${JSON.stringify(rimIdem2.data)}`);
  const rim2 = await json("A", `/api/v1/payments?id=${man.data.id}`, "PATCH", { azione: "rimborso", completo: true });
  T("rimborso totale completa il capitale", rim2.status === 200 && rim2.data?.rimborsoCent === 50000 && rim2.data?.stato === "rimborsato", JSON.stringify(rim2.data));
  T("non rimborsabile due volte", (await json("A", `/api/v1/payments?id=${man.data.id}`, "PATCH", { azione: "rimborso" })).status === 422);

  // ---- Canale diretto: niente fee NaBoat, residuo sul prezzo effettivo (P01/P03) ----
  const bDir = await json("A", "/api/v1/boats", "POST", { nome: "Smoke Diretta", capienza: 4 });
  const bkDir = await json("A", "/api/v1/bookings", "POST", {
    boatId: bDir.data.id,
    startAt: "2028-07-10T09:00:00.000Z",
    endAt: "2028-07-10T18:00:00.000Z",
    clienteNome: "Cliente Diretto",
    telefono: "333777999",
    idempotencyKey: key + "-dir",
    prezzoEuro: "300",
  });
  T("prenotazione canale diretto con prezzo", bkDir.status === 201 && bkDir.data?.prezzoCent === 30000, `${bkDir.status} ${JSON.stringify(bkDir.data?.prezzoCent)}`);
  const manDir = await json("A", "/api/v1/payments", "POST", { bookingId: bkDir.data.id, importoEuro: "100", metodo: "contanti", tipo: "acconto" });
  T("incasso su canale diretto: nessuna fee NaBoat", manDir.status === 201 && manDir.data?.feeNaboatCent === 0, `${manDir.status} ${JSON.stringify(manDir.data?.feeNaboatCent)}`);
  const linkDir = await json("A", "/api/v1/payments/checkout", "POST", { bookingId: bkDir.data.id });
  const tokenDir = String(linkDir.data?.url ?? "").split("/paga/")[1] ?? "";
  const pubDir = await (await fetch(`${BASE}/api/v1/payments/public/${tokenDir}`)).json().catch(() => ({}));
  T("residuo 300 - 100 = 200", pubDir?.residuoCent === 20000 && pubDir?.capitaleIncassatoCent === 10000, JSON.stringify({ residuo: pubDir?.residuoCent, capitale: pubDir?.capitaleIncassatoCent }));
  const coDir = await json("A", "/api/v1/payments/checkout", "PUT", { bookingId: bkDir.data.id, tipo: "saldo" });
  T("Checkout con chiave finta gestito (422, non 500)", coDir.status === 422, `${coDir.status} ${JSON.stringify(coDir.data?.error)}`);
  const saldoDir = await json("A", "/api/v1/payments", "POST", { bookingId: bkDir.data.id, importoEuro: "200", metodo: "contanti", tipo: "saldo" });
  T("saldo diretto registrato", saldoDir.status === 201, `${saldoDir.status}`);
  T("residuo zero: nessun Checkout (422)", (await json("A", "/api/v1/payments/checkout", "PUT", { bookingId: bkDir.data.id, tipo: "totale" })).status === 422);
  const bkCanc = await json("A", "/api/v1/bookings", "POST", {
    boatId: bDir.data.id,
    startAt: "2028-08-10T09:00:00.000Z",
    endAt: "2028-08-10T18:00:00.000Z",
    clienteNome: "Cliente Annullato",
    telefono: "333888111",
    idempotencyKey: key + "-canc",
    prezzoEuro: "150",
  });
  await json("A", `/api/v1/bookings/${bkCanc.data.id}`, "PATCH", { stato: "cancellata" });
  T("prenotazione annullata: nessun nuovo addebito", (await json("A", "/api/v1/payments/checkout", "PUT", { bookingId: bkCanc.data.id, tipo: "totale" })).status === 422);

  const now = Date.now();
  const bOggi = await json("A", "/api/v1/boats", "POST", { nome: "Smoke Oggi", capienza: 4 });
  T("barca senza patente creata", bOggi.status === 201, `${bOggi.status}`);
  const bkOggi = await json("A", "/api/v1/bookings", "POST", {
    boatId: bOggi.data.id,
    startAt: new Date(now + 2 * 3600 * 1000).toISOString(),
    endAt: new Date(now + 5 * 3600 * 1000).toISOString(),
    clienteNome: "Cliente Oggi",
    telefono: "333555111",
    passeggeri: 2,
    idempotencyKey: key + "-oggi",
  });
  T("prenotazione di oggi creata", bkOggi.status === 201, `${bkOggi.status} ${JSON.stringify(bkOggi.data?.error)}`);
  const manOggi = await json("A", "/api/v1/payments", "POST", { bookingId: bkOggi.data.id, importoEuro: "100", metodo: "pos" });
  T("incasso vicino all'uscita registrato", manOggi.status === 201, `${manOggi.status}`);
  const rimOggi = await json("A", `/api/v1/payments?id=${manOggi.data.id}`, "PATCH", { azione: "rimborso" });
  T("rimborso bloccato dentro le 24 ore -> 422", rimOggi.status === 422, `${rimOggi.status} ${JSON.stringify(rimOggi.data)}`);

  T("pagamenti richiedono login", (await fetch(`${BASE}/api/v1/payments`)).status === 401);

  // ---- Resoconto incassi/spese ----
  const r0 = await json("A", "/api/v1/reports/summary");
  T("resoconto accessibile", r0.status === 200 && typeof r0.data?.margineCent === "number", `${r0.status}`);
  T("resoconto: incassi contati", r0.data?.incassi?.noleggioCent >= 10000, JSON.stringify(r0.data?.incassi));
  T("resoconto: canale naboat separato", Array.isArray(r0.data?.perCanale));
  T("periodo non valido -> 422", (await json("A", "/api/v1/reports/summary?from=2028-01-01T00:00:00.000Z&to=2020-01-01T00:00:00.000Z")).status === 422);

  const sp = await json("A", "/api/v1/expenses", "POST", { descrizione: "Carburante smoke", importoEuro: "120,50", categoria: "carburante", data: "2028-05-10", boatId: b.data.id });
  T("spesa registrata", sp.status === 201 && sp.data?.importoCent === 12050, `${sp.status} ${JSON.stringify(sp.data)}`);
  T("spesa con importo non valido -> 422", (await json("A", "/api/v1/expenses", "POST", { descrizione: "X", importoEuro: "abc", categoria: "altro", data: "2028-05-10" })).status === 422);

  const r1 = await json("A", "/api/v1/reports/summary?from=2028-01-01T00:00:00.000Z&to=2028-12-31T23:59:59.999Z");
  T("resoconto: spesa nel totale", r1.data?.spese?.totaleCent >= 12050, JSON.stringify(r1.data?.spese));
  const rigaBarca = (r1.data?.perBarca ?? []).find((x) => x.boatId === b.data.id);
  T("resoconto: spesa attribuita alla barca", rigaBarca?.speseCent >= 12050, JSON.stringify(rigaBarca));
  T("resoconto: margine = noleggio - fee - spese", rigaBarca?.margineCent === rigaBarca.noleggioCent - rigaBarca.feeNaboatCent - rigaBarca.feeProviderCent - rigaBarca.speseCent);

  const csv = await jar.fetch("/api/v1/reports/summary?from=2028-01-01T00:00:00.000Z&to=2028-12-31T23:59:59.999Z&format=csv");
  const csvText = await csv.text();
  T("esportazione CSV", csv.status === 200 && csvText.includes("MARGINE") && csvText.includes("PER BARCA"), `status=${csv.status}`);
  T("CSV con nome file", String(csv.headers.get("content-disposition") ?? "").includes("attachment"));

  // ---- Blocco 1: identità azienda + skipper in sola consultazione ----
  const az = await json("A", "/api/v1/tenant");
  T("dati azienda leggibili", az.status === 200 && typeof az.data?.nome === "string", `${az.status}`);
  T("nome azienda non valido -> 422", (await json("A", "/api/v1/tenant", "PATCH", { nome: "x" })).status === 422);
  const az2 = await json("A", "/api/v1/tenant", "PATCH", { nome: "Smoke A Rinominata" });
  T("proprietario modifica nome azienda", az2.status === 200 && az2.data?.nome === "Smoke A Rinominata", JSON.stringify(az2.data));
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: "#087f8c" } }).png().toBuffer();
  const fdLogoKo = new FormData();
  fdLogoKo.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }), "x.pdf");
  T("logo non immagine -> 422", (await jar.fetch("/api/v1/tenant/logo", { method: "POST", body: fdLogoKo })).status === 422);
  const fdLogo = new FormData();
  fdLogo.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "logo.png");
  const logoRes = await jar.fetch("/api/v1/tenant/logo", { method: "POST", body: fdLogo });
  const logoJson = await logoRes.json().catch(() => ({}));
  T("logo azienda caricato e ottimizzato", logoRes.status === 201 && String(logoJson.logoUrl).startsWith("/uploads/"), `${logoRes.status} ${JSON.stringify(logoJson)}`);

  const utSkipper = await json("A", "/api/v1/users", "POST", { email: `skipper${Date.now()}@test.local`, password: "skipper-password-123", nome: "Skipper Smoke", role: "skipper" });
  T("utente skipper creato", utSkipper.status === 201, `${utSkipper.status}`);
  const jarSkipper = new Jar();
  await jarSkipper.fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: utSkipper.data.email, password: "skipper-password-123" }) });
  // Lo skipper vede solo Oggi, Calendario, Turni e Meteo: il resto è riservato a proprietario e operatore.
  T("skipper consulta Oggi", (await jarSkipper.fetch("/api/v1/today")).status === 200);
  T("skipper consulta il Calendario", (await jarSkipper.fetch("/api/v1/calendar?from=2028-01-01T00:00:00.000Z&to=2028-12-31T23:59:59.999Z")).status === 200);
  T("skipper consulta i Turni", (await jarSkipper.fetch("/api/v1/turni")).status === 200);
  T("skipper NON vede la Flotta", (await jarSkipper.fetch("/api/v1/boats")).status === 403);
  T("skipper NON vede i Clienti", (await jarSkipper.fetch("/api/v1/customers")).status === 403);
  T("skipper NON vede il registro incassi", (await jarSkipper.fetch("/api/v1/payments")).status === 403);
  T("skipper NON vede il Resoconto", (await jarSkipper.fetch("/api/v1/reports/summary")).status === 403);
  T("skipper NON vede il Registro modifiche", (await jarSkipper.fetch("/api/v1/audit")).status === 403);
  T("skipper non modifica (POST) -> 403", (await jarSkipper.fetch("/api/v1/boats", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Vietata", capienza: 2 }) })).status === 403);

  // ---- Blocco 2: scadenze e manutenzione ----
  const manut = await json("A", "/api/v1/maintenance", "POST", { boatId: b.data.id, tipo: "assicurazione", titolo: "Assicurazione RC smoke", dataScadenza: "2028-05-01", costoEuro: "150,00" });
  T("scadenza registrata", manut.status === 201 && manut.data?.costoCent === 15000, `${manut.status} ${JSON.stringify(manut.data)}`);
  T("scadenza con data non valida -> 422", (await json("A", "/api/v1/maintenance", "POST", { boatId: b.data.id, tipo: "altro", titolo: "Prova data", dataScadenza: "non-una-data" })).status === 422);
  const manList = await json("A", "/api/v1/maintenance");
  T("elenco scadenze", manList.status === 200 && manList.data?.items?.length >= 1);
  const eseguito = await json("A", `/api/v1/maintenance/${manut.data.id}`, "PATCH", { azione: "esegui", costoEuro: "150,00" });
  T("intervento segnato eseguito", eseguito.status === 200 && !!eseguito.data?.eseguitoAt, `${eseguito.status}`);
  const speseDopo = await json("A", "/api/v1/expenses");
  T("costo intervento registrato tra le spese", Array.isArray(speseDopo.data) && speseDopo.data.some((s) => s.descrizione.includes("Assicurazione RC smoke")), "spesa non trovata");
  const riaperto = await json("A", `/api/v1/maintenance/${manut.data.id}`, "PATCH", { azione: "riapri" });
  T("intervento riaperto", riaperto.status === 200 && riaperto.data?.eseguitoAt === null);
  T("scadenza eliminata", (await json("A", `/api/v1/maintenance/${manut.data.id}`, "DELETE")).status === 200);

  // ---- Blocco 3: listino prezzi ----
  T("tariffa con prezzo non valido -> 422", (await json("A", "/api/v1/tariffe", "POST", { boatId: null, tipo: "giornata", stagione: "alta", prezzoEuro: "abc" })).status === 422);
  const tar = await json("A", "/api/v1/tariffe", "POST", { boatId: null, tipo: "giornata", stagione: "alta", prezzoEuro: "200,00" });
  T("tariffa generale creata", tar.status === 201 && tar.data?.prezzoCent === 20000, `${tar.status} ${JSON.stringify(tar.data)}`);
  const tarAgg = await json("A", "/api/v1/tariffe", "POST", { boatId: null, tipo: "giornata", stagione: "alta", prezzoEuro: "250,00" });
  T("stessa tariffa aggiornata (non duplicata)", tarAgg.status === 200 && tarAgg.data?.prezzoCent === 25000, `${tarAgg.status}`);
  const quot = await json("A", `/api/v1/tariffe?boatId=${b.data.id}&data=2028-06-15&tipo=giornata`);
  T("preventivo listino in alta stagione = 250 EUR", quot.data?.prezzoCent === 25000 && quot.data?.stagione === "alta", JSON.stringify(quot.data));
  const quotBassa = await json("A", `/api/v1/tariffe?boatId=${b.data.id}&data=2028-02-15&tipo=giornata`);
  T("in bassa stagione nessuna tariffa alta", quotBassa.data?.prezzoCent === null, JSON.stringify(quotBassa.data));
  T("tariffa eliminata", (await json("A", `/api/v1/tariffe?id=${tar.data.id}`, "DELETE")).status === 200);

  // ---- Blocco 4: turni e meteo ----
  const turni = await json("A", "/api/v1/turni");
  T("turni leggibili", turni.status === 200 && Array.isArray(turni.data?.skippers), `${turni.status}`);
  T("periodo turni non valido -> 422", (await json("A", "/api/v1/turni?from=2028-01-10T00:00:00.000Z&to=2028-01-01T00:00:00.000Z")).status === 422);
  const meteo0 = await json("A", "/api/v1/meteo");
  T("meteo senza coordinate avvisa", meteo0.status === 200 && typeof meteo0.data?.messaggio === "string", JSON.stringify(meteo0.data));
  await json("A", `/api/v1/boats/${b.data.id}`, "PATCH", { lat: 40.8397, lon: 14.2524 });
  T("coordinate non valide -> 422", (await json("A", `/api/v1/boats/${b.data.id}`, "PATCH", { lat: 999, lon: 14 })).status === 422);
  const meteo1 = await json("A", "/api/v1/meteo");
  T("meteo include la barca con coordinate", meteo1.status === 200 && (meteo1.data?.barche ?? []).some((x) => x.boatId === b.data.id), JSON.stringify(meteo1.data?.barche?.[0]?.errore ?? ""));

  // ---- Contratto digitale ----
  T("dati azienda: punto di partenza e telefono", (await json("A", "/api/v1/tenant", "PATCH", { indirizzoPartenza: "Porto Smoke, Molo 1", telefonoContatto: "081 000000" })).status === 200);
  const linkContratto = await json("A", `/api/v1/bookings/${bk.data.id}/contratto`, "POST");
  T("link contratto generato", linkContratto.status === 200 && String(linkContratto.data?.url).includes("/contratto/"), `${linkContratto.status} ${JSON.stringify(linkContratto.data)}`);
  const tokenContratto = String(linkContratto.data?.url ?? "").split("/contratto/")[1] ?? "";
  const contrattoPub = await fetch(`${BASE}/api/v1/contratto/public/${tokenContratto}`);
  const contrattoDati = await contrattoPub.json();
  T("contratto pubblico senza login", contrattoPub.status === 200 && contrattoDati?.barca?.nome === "Smoke Boat", `status=${contrattoPub.status}`);
  T("contratto contiene punto di partenza", contrattoDati?.puntoPartenza === "Porto Smoke, Molo 1");
  T("contratto token inesistente -> 404", (await fetch(`${BASE}/api/v1/contratto/public/tokentinvalido12345`)).status === 404);
  T("firma senza accettazione -> 422", (await fetch(`${BASE}/api/v1/contratto/public/${tokenContratto}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Mario Rossi", accettato: false }) })).status === 422);
  const firma = await fetch(`${BASE}/api/v1/contratto/public/${tokenContratto}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Mario Rossi", accettato: true }) });
  const firmaDati = await firma.json();
  T("contratto firmato dal cliente", firma.status === 200 && firmaDati?.firmaNome === "Mario Rossi" && !!firmaDati?.firmatoAt, `${firma.status} ${JSON.stringify(firmaDati)}`);
  T("doppia firma rifiutata -> 422", (await fetch(`${BASE}/api/v1/contratto/public/${tokenContratto}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "Altro Nome", accettato: true }) })).status === 422);
  T("nuovo link su contratto firmato -> 422", (await json("A", `/api/v1/bookings/${bk.data.id}/contratto`, "POST")).status === 422);

  // ---- Check-in / check-out ----
  const checkin = await json("A", `/api/v1/bookings/${bk.data.id}/checkin`, "POST", { carburantePct: 100, note: "Tutto in ordine" });
  T("check-in registrato", checkin.status === 200 && checkin.data?.checkinCarburantePct === 100 && !!checkin.data?.checkinAt, `${checkin.status} ${JSON.stringify(checkin.data)}`);
  T("check-in ripetuto -> 422", (await json("A", `/api/v1/bookings/${bk.data.id}/checkin`, "POST", { carburantePct: 80 })).status === 422);
  const fotoCheckin = new FormData();
  fotoCheckin.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "checkin.png");
  fotoCheckin.append("bookingId", bk.data.id);
  fotoCheckin.append("tipo", "checkin");
  T("foto check-in caricata", (await jar.fetch("/api/v1/uploads", { method: "POST", body: fotoCheckin })).status === 201);
  T("tipo foto non valido -> 422", (await (async () => { const f = new FormData(); f.append("file", new Blob([new Uint8Array(png)], { type: "image/png" }), "x.png"); f.append("bookingId", bk.data.id); f.append("tipo", "altro"); return jar.fetch("/api/v1/uploads", { method: "POST", body: f }); })()).status === 422);
  const checkout = await json("A", `/api/v1/bookings/${bk.data.id}/checkout`, "POST", { carburantePct: 70, note: "Rientro regolare", danniEuro: "0" });
  T("check-out registrato con carburante", checkout.status === 200 && checkout.data?.checkoutCarburantePct === 70 && !!checkout.data?.checkoutAt, `${checkout.status}`);
  T("check-out ripetuto -> 422", (await json("A", `/api/v1/bookings/${bk.data.id}/checkout`, "POST", { carburantePct: 50 })).status === 422);
  T("check-out senza check-in -> 422", (await json("A", `/api/v1/bookings/${bkOggi.data.id}/checkout`, "POST", { carburantePct: 50 })).status === 422);

  // ---- Cauzione ----
  const cauzList0 = await json("A", "/api/v1/payments/cauzione");
  T("elenco cauzioni", cauzList0.status === 200 && Array.isArray(cauzList0.data), `${cauzList0.status}`);
  T("cauzione con importo non valido -> 422", (await json("A", "/api/v1/payments/cauzione", "POST", { bookingId: bkOggi.data.id, cauzioneEuro: "abc" })).status === 422);
  const cauzFinta = await json("A", "/api/v1/payments/cauzione", "POST", { bookingId: bkOggi.data.id, cauzioneEuro: "500" });
  T("cauzione con chiave Stripe non valida: errore gestito (non 201)", cauzFinta.status === 422, `${cauzFinta.status} ${JSON.stringify(cauzFinta.data)}`);
  T("rilascio senza cauzione autorizzata -> 422", (await json("A", `/api/v1/payments/cauzione?id=${bkOggi.data.id}`, "PATCH", { azione: "rilascia" })).status === 422);

  // ---- Promemoria ----
  T("promemoria: senza login -> 401", (await fetch(`${BASE}/api/v1/promemoria/invia`, { method: "POST" })).status === 401);
  const prom = await json("A", "/api/v1/promemoria/invia", "POST", {});
  T("promemoria: conteggi restituiti", prom.status === 200 && typeof prom.data?.trovate === "number" && typeof prom.data?.inviati === "number", `${prom.status} ${JSON.stringify(prom.data)}`);
  T("promemoria: parametro data non valido -> 422", (await json("A", "/api/v1/promemoria/invia", "POST", { data: "non-data" })).status === 422);

  // ---- SEO pagine pubbliche ----
  const seo0 = await adm.fetch("/api/v1/admin/seo");
  const seoDati = await seo0.json();
  T("NaBoat apre la pagina SEO", seo0.status === 200 && Array.isArray(seoDati?.pagine) && !!seoDati?.impostazioni, `${seo0.status}`);
  T("SEO riservata a NaBoat", (await jar.fetch("/api/v1/admin/seo")).status === 403);
  T("SEO preparata per la piattaforma", seoDati.pagine.some((p) => p.tipo === "piattaforma"));

  // Rigenerazione: crea le pagine di azienda/barca/skipper dai dati reali
  const rig = await adm.fetch("/api/v1/admin/seo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "rigenera" }) });
  const rigDati = await rig.json();
  T("rigenerazione automatica dei testi", rig.status === 200 && rigDati?.aziende >= 1 && rigDati?.barche >= 1 && rigDati?.skipper >= 1, JSON.stringify(rigDati));

  const seo1 = await (await adm.fetch("/api/v1/admin/seo")).json();
  const pagAzienda = seo1.pagine.find((p) => p.tipo === "azienda" && p.azienda === "Smoke A Rinominata");
  T("pagina SEO dell'azienda generata", !!pagAzienda && pagAzienda.titoloAuto.includes("Smoke A Rinominata"), JSON.stringify(pagAzienda?.titoloAuto));
  T("SEO azienda con parole chiave automatiche", !!pagAzienda?.keywordsAuto && pagAzienda.keywordsAuto.includes("noleggio barca"), JSON.stringify(pagAzienda?.keywordsAuto));
  T("SEO azienda con slug leggibile", !!pagAzienda?.slug && /^[a-z0-9-]+$/.test(pagAzienda.slug), pagAzienda?.slug);
  const pagBarca = seo1.pagine.find((p) => p.tipo === "barca" && p.nome === "Smoke Boat");
  T("pagina SEO della barca generata", !!pagBarca && pagBarca.titoloAuto.includes("Smoke Boat"), JSON.stringify(pagBarca?.titoloAuto));
  T("pagina SEO dello skipper generata", seo1.pagine.some((p) => p.tipo === "skipper" && p.nome === "Skipper Smoke"));

  // Modifica manuale di una pagina (le impostazioni le crea NaBoat)
  const seoPatch = await adm.fetch("/api/v1/admin/seo", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ azione: "pagina", id: pagAzienda.id, titolo: "Titolo scelto da NaBoat", keywords: "parola1, parola2", pubblica: true }),
  });
  T("NaBoat personalizza una pagina SEO", seoPatch.status === 200, `${seoPatch.status}`);
  const seo2 = await (await adm.fetch("/api/v1/admin/seo")).json();
  const pagDopo = seo2.pagine.find((p) => p.id === pagAzienda.id);
  T("titolo manuale ha la precedenza", pagDopo.titolo === "Titolo scelto da NaBoat" && pagDopo.effettivo.titolo === "Titolo scelto da NaBoat");
  T("campo marcato come personalizzato", pagDopo.effettivo.manuale.titolo === true);
  T("parole chiave personalizzate", pagDopo.effettivo.keywords === "parola1, parola2");
  T("slug non valido -> 422", (await adm.fetch("/api/v1/admin/seo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "pagina", id: pagAzienda.id, slug: "a" }) })).status === 422);
  const slugOccupato = seo2.pagine.find((p) => p.tipo === "barca" && p.slug);
  const slugDup = await adm.fetch("/api/v1/admin/seo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "pagina", id: slugOccupato.id, slug: pagDopo.slug }) });
  T("slug già usato -> 409", slugDup.status === 409, `${slugDup.status}`);
  T("campo sconosciuto rifiutato -> 422", (await adm.fetch("/api/v1/admin/seo", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "pagina", id: pagAzienda.id, campoInventato: "x" }) })).status === 422);

  // robots.txt: bloccato finché le pagine pubbliche sono spente
  const robots0 = await (await fetch(`${BASE}/robots.txt`)).text();
  T("robots blocca tutto quando le pagine pubbliche sono spente", robots0.includes("Disallow: /") && !robots0.includes("Sitemap"), robots0.replace(/\n/g, " | "));
  const sitemap0 = await (await fetch(`${BASE}/sitemap.xml`)).text();
  T("sitemap vuota quando le pagine pubbliche sono spente", !sitemap0.includes("<url>"), sitemap0.slice(0, 120));

  // Attivando le pagine pubbliche, robots apre solo le pagine dei turisti e la sitemap si popola
  await adm.fetch("/api/v1/admin/seo", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ azione: "impostazioni", seoPubblicheAttive: true, seoDominioPubblico: "https://naboat.test", seoTitoloDefault: "NaBoat Test", seoDescrizioneDefault: "Descrizione di prova", seoKeywordsDefault: "noleggio barca", seoLocalitaDefault: "Napoli" }),
  });
  const robots1 = await (await fetch(`${BASE}/robots.txt`)).text();
  T("robots apre le pagine pubbliche quando sono attive", robots1.includes("Allow: /") && robots1.includes("Disallow: /oggi") && robots1.includes("Sitemap: https://naboat.test/sitemap.xml"), robots1.replace(/\n/g, " | ").slice(0, 200));
  const sitemap1 = await (await fetch(`${BASE}/sitemap.xml`)).text();
  T("sitemap contiene le pagine pubblicate", sitemap1.includes("<urlset") && sitemap1.includes(pagDopo.slug), sitemap1.slice(0, 160));

  // L'azienda vede la propria SEO ma non può modificarla
  const seoTenant = await json("A", "/api/v1/seo");
  T("azienda vede la propria SEO", seoTenant.status === 200 && seoTenant.data?.pagine?.length >= 1, `${seoTenant.status}`);
  T("azienda non può modificare la SEO", (await json("A", "/api/v1/seo", "POST")).status === 403);

  // Si torna allo stato di sicurezza: tutto noindex
  await adm.fetch("/api/v1/admin/seo", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ azione: "impostazioni", seoPubblicheAttive: false, seoDominioPubblico: "", seoTitoloDefault: "", seoDescrizioneDefault: "", seoKeywordsDefault: "", seoLocalitaDefault: "" }),
  });
  T("pagine pubbliche rispente: robots blocca di nuovo", (await (await fetch(`${BASE}/robots.txt`)).text()).includes("Disallow: /"));

  // ---- Copie di sicurezza: impostazioni dal pannello ----
  const bk0 = await adm.fetch("/api/v1/admin/backup");
  const bkDati = await bk0.json();
  T("NaBoat apre la pagina dei backup", bk0.status === 200 && !!bkDati?.impostazioni && Array.isArray(bkDati?.crontab), `${bk0.status}`);
  T("backup riservati a NaBoat", (await jar.fetch("/api/v1/admin/backup")).status === 403);
  T("crontab generato", bkDati.crontab.join(" ").includes("backup-orchestrator.sh"));

  const bkAtt = await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ attivo: true, ogniOre: 1, retentionCopie: 48, includiFoto: true, destinazioneLocale: true, destinazioneObjectStorage: false, destinazioneFtp: false, registroCompleto: true, avvisoEmail: "lorenzo@naboat.test" }) });
  T("NaBoat attiva il backup ogni ora", bkAtt.status === 200, `${bkAtt.status}`);
  T("frequenza non valida -> 422", (await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ogniOre: 99 }) })).status === 422);
  T("email di avviso non valida -> 422", (await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ avvisoEmail: "non-una-email" }) })).status === 422);
  T("campo sconosciuto rifiutato -> 422", (await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ campoInventato: true }) })).status === 422);
  T("replica senza indirizzo -> 422", (await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ replicaAttiva: true }) })).status === 422);
  T("Object Storage senza credenziali -> 422", (await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinazioneObjectStorage: true }) })).status === 422);
  T("FTP senza credenziali -> 422", (await adm.fetch("/api/v1/admin/backup", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinazioneFtp: true }) })).status === 422);

  // Il piano che lo script del server legge: protetto dal segreto di cron
  const CRON = process.env.CRON_SECRET || "segreto-cron-solo-per-sviluppo-locale";
  T("piano di backup senza segreto -> 401", (await fetch(`${BASE}/api/v1/backup/piano`)).status === 401);
  T("piano di backup con segreto sbagliato -> 401", (await fetch(`${BASE}/api/v1/backup/piano`, { headers: { "x-cron-secret": "sbagliato" } })).status === 401);
  T("esito senza segreto -> 401", (await fetch(`${BASE}/api/v1/backup/esito`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status === 401);

  // Flusso completo: lo script chiede il piano, esegue e riporta l'esito
  const pianoBk = await fetch(`${BASE}/api/v1/backup/piano`, { headers: { "x-cron-secret": CRON } });
  const pianoDati = await pianoBk.json();
  T("piano di backup leggibile dallo script", pianoBk.status === 200 && pianoDati.esegui === true && pianoDati.ogniOre === 1, `${pianoBk.status} ${JSON.stringify(pianoDati).slice(0, 140)}`);
  T("piano senza destinazioni esterne attive", Array.isArray(pianoDati.destinazioni) && pianoDati.destinazioni.includes("locale") && !pianoDati.destinazioni.includes("ftp"), JSON.stringify(pianoDati.destinazioni));
  const esitoBk = await fetch(`${BASE}/api/v1/backup/esito`, {
    method: "POST",
    headers: { "x-cron-secret": CRON, "Content-Type": "application/json" },
    body: JSON.stringify({ esecuzioneId: pianoDati.esecuzioneId, esito: "ok", dimensioneByte: 3456789, file: "naboat-completo-test.tar.gz", messaggio: "backup di prova" }),
  });
  T("esito del backup registrato", esitoBk.status === 200, `${esitoBk.status}`);
  const bkDopo = await (await adm.fetch("/api/v1/admin/backup")).json();
  T("stato aggiornato nel pannello", bkDopo?.ultima?.esito === "ok" && bkDopo?.ultima?.dimensioneByte === 3456789, JSON.stringify(bkDopo?.ultima));
  T("esecuzione non trovata -> 404", (await fetch(`${BASE}/api/v1/backup/esito`, { method: "POST", headers: { "x-cron-secret": CRON, "Content-Type": "application/json" }, body: JSON.stringify({ esecuzioneId: "00000000-0000-0000-0000-000000000000", esito: "ok" }) })).status === 404);

  // ---- Registro completo delle modifiche ----
  await json("A", `/api/v1/bookings/${bkOggi.data.id}`, "PATCH", { prezzoEuro: "222,50" });
  const registroVoci = await json("A", "/api/v1/audit?limite=50");
  T("registro consultabile dall'azienda", registroVoci.status === 200 && Array.isArray(registroVoci.data), `${registroVoci.status}`);
  const voceRegistro = (registroVoci.data ?? []).find((v) => v.entitaId === bkOggi.data.id && v.dettagli?.cambi?.prezzoCent);
  T("modifica prenotazione tracciata con valore prima e dopo", !!voceRegistro && voceRegistro.dettagli.cambi.prezzoCent.dopo === 22250, JSON.stringify(voceRegistro?.dettagli?.cambi ?? null));
  T("registro riservato a chi ha fatto l'accesso", (await fetch(`${BASE}/api/v1/audit`)).status === 401);

  // upload mime errato
  const fd = new FormData();
  fd.append("file", new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" }), "x.pdf");
  fd.append("boatId", b.data.id);
  const up = await jar.fetch("/api/v1/uploads", { method: "POST", body: fd });
  T("upload mime errato 422", up.status === 422, `status=${up.status}`);

  // tenant B isolation
  const eb = `smokeB${Date.now()}@test.local`;
  const jarB = new Jar();
  await jarB.fetch("/api/v1/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(reg("Smoke B", eb)) });
  const list2 = await (await adm.fetch("/api/v1/admin/tenants")).json();
  const tB = list2.find((t) => t.nome === "Smoke B" && t.status === "pending");
  await adm.fetch("/api/v1/admin/tenants", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tB.id, azione: "approve" }) });
  await jarB.fetch("/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: eb, password: "password-smoke-123" }) });
  const boatsB = await (await jarB.fetch("/api/v1/boats")).json();
  T("B non vede barche di A", Array.isArray(boatsB) && boatsB.length === 0, `count=${boatsB?.length}`);
  const patchB = await jarB.fetch(`/api/v1/boats/${b.data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nome: "HACK" }) });
  T("B non modifica barca di A (404)", patchB.status === 404, `status=${patchB.status}`);
  const still = await (await jar.fetch("/api/v1/boats")).json();
  T("nome barca A invariato", still.find((x) => x.id === b.data.id)?.nome === "Smoke Boat");

  // isolamento pagamenti tra aziende
  const payB = await (await jarB.fetch("/api/v1/payments")).json();
  T("B non vede incassi di A", Array.isArray(payB) && payB.every((p) => p.tenantId === tB.id), `count=${payB?.length}`);
  T("B non rimborsa incasso di A (404)", (await jarB.fetch(`/api/v1/payments?id=${man.data.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "rimborso" }) })).status === 404);
  await jarB.fetch("/api/v1/payments/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stripeSecretKey: "sk_test_finta_b", stripeAttivo: true, pagamentiAttivi: true }) });
  const linkBsuA = await jarB.fetch("/api/v1/payments/checkout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: bk.data.id }) });
  T("B non genera link per prenotazione di A (404)", linkBsuA.status === 404, `${linkBsuA.status}`);

  // isolamento spese e resoconto
  const spesaBsuA = await jarB.fetch("/api/v1/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ descrizione: "X", importoEuro: "10", categoria: "altro", data: "2028-05-10", boatId: b.data.id }) });
  T("B non crea spesa su barca di A (404)", spesaBsuA.status === 404, `${spesaBsuA.status}`);
  const delBsuA = await jarB.fetch(`/api/v1/expenses?id=${sp.data.id}`, { method: "DELETE" });
  T("B non elimina spesa di A (404)", delBsuA.status === 404, `${delBsuA.status}`);
  const csvB = await jarB.fetch("/api/v1/reports/summary");
  const csvBText = await csvB.text();
  T("B non vede spese di A nel resoconto", !csvBText.includes("Carburante smoke"));
  T("B non crea scadenza su barca di A (404)", (await jarB.fetch("/api/v1/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ boatId: b.data.id, tipo: "altro", titolo: "Prova B" }) })).status === 404);
  const tarA = await json("A", "/api/v1/tariffe", "POST", { boatId: null, tipo: "giornata", stagione: "bassa", prezzoEuro: "180,00" });
  T("B non elimina una tariffa di A (404)", (await jarB.fetch(`/api/v1/tariffe?id=${tarA.data.id}`, { method: "DELETE" })).status === 404);
  await json("A", `/api/v1/tariffe?id=${tarA.data.id}`, "DELETE");
  T("B non vede i turni di A", (await (await jarB.fetch("/api/v1/turni")).json()).bookings?.length === 0);
  T("B non avvia cauzioni su prenotazioni di A (404)", (await jarB.fetch("/api/v1/payments/cauzione", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: bkOggi.data.id, cauzioneEuro: "500" }) })).status === 404);
  T("B non firma contratti di A (404)", (await jarB.fetch("/api/v1/bookings/" + bk.data.id + "/contratto", { method: "POST" })).status === 404);
  const delSp = await json("A", `/api/v1/expenses?id=${sp.data.id}`, "DELETE");
  T("spesa eliminata", delSp.status === 200, `${delSp.status}`);

  // ---- Abbonamento stagionale (i soldi vanno a NaBoat) ----
  const listinoIniziale = await adm.fetch("/api/v1/admin/subscriptions");
  T("NaBoat legge il listino servizi", listinoIniziale.status === 200);
  const setListino = await adm.fetch("/api/v1/admin/subscriptions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ azione: "listino", prezzoAttivazioneEuro: "800,00", canoneMensileEuro: "99,00", canoneStagionaleEuro: "490,00", feeNaboatPctDefault: 8, abbonamentoObbligatorio: false }),
  });
  const listinoSalvato = await setListino.json();
  T("NaBoat modifica il listino", setListino.status === 200 && listinoSalvato?.prezzoAttivazioneCent === 80000 && listinoSalvato?.canoneMensileCent === 9900 && listinoSalvato?.canoneStagionaleCent === 49000 && listinoSalvato?.feeNaboatPctDefault === 8, JSON.stringify(listinoSalvato));
  T("listino con importo non valido -> 422", (await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "listino", prezzoAttivazioneEuro: "abc", canoneMensileEuro: "99", canoneStagionaleEuro: "490", feeNaboatPctDefault: 8, abbonamentoObbligatorio: false }) })).status === 422);
  T("listino riservato a NaBoat", (await jar.fetch("/api/v1/admin/subscriptions")).status === 403);

  const statoSub0 = await json("A", "/api/v1/subscription");
  T("azienda legge stato servizi", statoSub0.status === 200 && statoSub0.data?.attivazione === null && statoSub0.data?.manutenzione === null);
  T("azienda vede la fee del canale NaBoat", statoSub0.data?.marketplace?.attivo === true && statoSub0.data?.marketplace?.feePct === 10, JSON.stringify(statoSub0.data?.marketplace));

  const prevMesi = await json("A", "/api/v1/subscription", "POST", { tipo: "manutenzione_mensile", quantita: 3 });
  T("preventivo 3 mesi = 297 EUR", prevMesi.data?.prezzoCent === 29700, JSON.stringify(prevMesi.data));
  const prevStag = await json("A", "/api/v1/subscription", "POST", { tipo: "manutenzione_stagionale", quantita: 1 });
  T("preventivo 1 stagione = 490 EUR", prevStag.data?.prezzoCent === 49000, JSON.stringify(prevStag.data));
  const prevAtt = await json("A", "/api/v1/subscription", "POST", { tipo: "attivazione", quantita: 1 });
  T("preventivo attivazione = 800 EUR", prevAtt.data?.prezzoCent === 80000, JSON.stringify(prevAtt.data));
  T("attivazione ripetuta -> 422", (await json("A", "/api/v1/subscription", "POST", { tipo: "attivazione", quantita: 2 })).status === 422);
  T("quantita fuori range -> 422", (await json("A", "/api/v1/subscription", "POST", { tipo: "manutenzione_mensile", quantita: 99 })).status === 422);
  T("uscita senza carta configurata -> 422", (await json("A", "/api/v1/subscription", "PUT", { tipo: "manutenzione_mensile", quantita: 1 })).status === 422);

  // Marketplace spento: nessuna fee sulle prenotazioni
  await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "condizioniAzienda", id: tA.id, moduloMarketplace: false, feeNaboatPct: 10 }) });
  const statoSubOff = await json("A", "/api/v1/subscription");
  T("marketplace spento: fee a zero", statoSubOff.data?.marketplace?.attivo === false && statoSubOff.data?.marketplace?.feePct === 0, JSON.stringify(statoSubOff.data?.marketplace));
  const payOff = await json("A", "/api/v1/payments/settings");
  T("marketplace spento: fee a zero anche nei pagamenti", payOff.data?.feeNaboatPct === 0 && payOff.data?.moduloMarketplace === false);
  await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "condizioniAzienda", id: tA.id, moduloMarketplace: true, feeNaboatPct: 10 }) });
  T("marketplace riattivato", (await json("A", "/api/v1/subscription")).data?.marketplace?.feePct === 10);

  // Accordi personalizzati per azienda
  const condPers = await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "condizioniAzienda", id: tA.id, moduloMarketplace: true, feeNaboatPct: 10, canoneMensileEuro: "49,00", prezzoAttivazioneEuro: "", canoneStagionaleEuro: "" }) });
  T("NaBoat imposta un canone personalizzato", condPers.status === 200 && (await condPers.json()).canoneMensileCent === 4900);
  T("listino aziendale usa l'accordo personalizzato", (await json("A", "/api/v1/subscription", "POST", { tipo: "manutenzione_mensile", quantita: 2 })).data?.prezzoCent === 9800);
  await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "condizioniAzienda", id: tA.id, moduloMarketplace: true, feeNaboatPct: 10, canoneMensileEuro: "" }) });
  T("accordo rimosso: torna il listino generale", (await json("A", "/api/v1/subscription", "POST", { tipo: "manutenzione_mensile", quantita: 2 })).data?.prezzoCent === 19800);

  // Attivazione registrata a mano (bonifico): una volta sola
  const creaAtt = await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "creaManuale", id: tA.id, tipo: "attivazione", quantita: 1 }) });
  const attDati = await creaAtt.json();
  T("NaBoat registra l'attivazione a mano", creaAtt.status === 201 && attDati?.stato === "attivo" && attDati?.prezzoCent === 80000 && attDati?.tipo === "attivazione", `${creaAtt.status} ${JSON.stringify(attDati)}`);
  T("attivazione già registrata -> 422", (await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "creaManuale", id: tA.id, tipo: "attivazione", quantita: 1 }) })).status === 422);
  T("azienda vede l'attivazione pagata", (await json("A", "/api/v1/subscription")).data?.attivazione?.prezzoCent === 80000);

  const creaSub = await adm.fetch("/api/v1/admin/subscriptions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ azione: "creaManuale", id: tA.id, tipo: "manutenzione_mensile", quantita: 3 }),
  });
  const subCreato = await creaSub.json();
  T("NaBoat attiva la manutenzione a mano (bonifico)", creaSub.status === 201 && subCreato?.stato === "attivo" && subCreato?.prezzoCent === 29700, `${creaSub.status} ${JSON.stringify(subCreato)}`);
  const statoSub1 = await json("A", "/api/v1/subscription");
  T("azienda vede manutenzione attiva con giorni residui", statoSub1.data?.manutenzione?.giorniResidui > 0, JSON.stringify(statoSub1.data?.manutenzione));

  // Con canone obbligatorio, un'azienda senza manutenzione viene bloccata
  await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "listino", prezzoAttivazioneEuro: "800,00", canoneMensileEuro: "99,00", canoneStagionaleEuro: "490,00", feeNaboatPctDefault: 8, abbonamentoObbligatorio: true }) });
  const bBloccata = await jarB.fetch("/api/v1/boats");
  T("B senza manutenzione bloccata (402)", bBloccata.status === 402, `${bBloccata.status}`);
  T("B può comunque accedere alla pagina servizi", (await jarB.fetch("/api/v1/subscription")).status === 200);
  T("B non può annullare un abbonamento di A (404)", (await jarB.fetch(`/api/v1/subscription?id=${subCreato.id}`, { method: "DELETE" })).status === 404);
  const annullaSub = await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "annulla", id: subCreato.id }) });
  T("NaBoat può annullare un abbonamento", annullaSub.status === 200 && (await annullaSub.json()).stato === "annullato");
  await adm.fetch("/api/v1/admin/subscriptions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ azione: "listino", prezzoAttivazioneEuro: "800,00", canoneMensileEuro: "99,00", canoneStagionaleEuro: "490,00", feeNaboatPctDefault: 8, abbonamentoObbligatorio: false }) });
  T("B torna operativa quando l'obbligo è tolto", (await jarB.fetch("/api/v1/boats")).status === 200);

  // NaBoat può disattivare i pagamenti (RFQ D4)
  const admPay = await adm.fetch("/api/v1/admin/payments");
  T("NaBoat vede stato pagamenti aziende", admPay.status === 200);
  const blocco = await adm.fetch("/api/v1/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tA.id, azione: "blocca" }) });
  T("NaBoat blocca pagamenti azienda", blocco.status === 200 && (await blocco.json()).pagamentiBloccatiNaBoat === true);
  T("azienda bloccata: link pubblico non disponibile -> 422", (await fetch(`${BASE}/api/v1/payments/public/${token}`)).status === 422);
  const psetBloccata = await json("A", "/api/v1/payments/settings");
  T("azienda bloccata: stato segnalato all'azienda", psetBloccata.data?.pagamentiBloccatiNaBoat === true, JSON.stringify(psetBloccata.data?.pagamentiBloccatiNaBoat));
  await adm.fetch("/api/v1/admin/payments", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: tA.id, azione: "sblocca" }) });
  T("NaBoat sblocca: link pubblico torna disponibile", (await fetch(`${BASE}/api/v1/payments/public/${token}`)).status === 200);

  // ---- Form «Contatti» del sito pubblico ----
  const ctPrima = (await (await adm.fetch("/api/v1/admin/contatti")).json()).richieste.length;
  const ctOk = await json("", "/api/v1/contatti", "POST", { nome: "Mario", cognome: "Prova", tipo: "noleggiare", telefono: "333 1234567", email: `contatti${Date.now()}@test.local`, messaggio: "Cerco una barca per 8 persone il 15 agosto. Guardate www.pubblicita.example", privacy: true, istante: Date.now() - 5000 });
  T("contatti: invio valido -> 201", ctOk.status === 201, `${ctOk.status} ${JSON.stringify(ctOk.data?.error)}`);
  T("contatti: senza consenso -> 422", (await json("", "/api/v1/contatti", "POST", { nome: "Mario", cognome: "Prova", telefono: "3331234567", email: "noprivacy@test.local", privacy: false, istante: Date.now() - 5000 })).status === 422);
  T("contatti: telefono non valido -> 422", (await json("", "/api/v1/contatti", "POST", { nome: "Mario", cognome: "Prova", telefono: "abc", email: "tel@test.local", privacy: true, istante: Date.now() - 5000 })).status === 422);
  T("contatti: invio istantaneo -> 422", (await json("", "/api/v1/contatti", "POST", { nome: "Mario", cognome: "Prova", telefono: "3331234567", email: "veloce@test.local", privacy: true, istante: Date.now() })).status === 422);
  const ctElenco1 = (await (await adm.fetch("/api/v1/admin/contatti")).json()).richieste;
  T("contatti: il messaggio valido entra nel pannello", ctElenco1.length === ctPrima + 1, `${ctPrima} -> ${ctElenco1.length}`);
  const ctTesto = ctElenco1[0]?.messaggio ?? "";
  T("contatti: il testo resta e il link viene tolto", ctTesto.includes("Cerco una barca per 8 persone") && !ctTesto.includes("www."), JSON.stringify(ctTesto));
  const ctEsca = await json("", "/api/v1/contatti", "POST", { nome: "Robot", cognome: "Spam", tipo: "altro", telefono: "3331234567", email: "robot@test.local", privacy: true, istante: Date.now() - 5000, azienda: "spam spa" });
  T("contatti: campo esca -> risposta finta senza salvare", ctEsca.status === 200, `${ctEsca.status}`);
  const ctSoloLink = await json("", "/api/v1/contatti", "POST", { nome: "Robot", cognome: "Link", tipo: "altro", telefono: "3331234567", email: `sololink${Date.now()}@test.local`, messaggio: "https://spam.example/promo", privacy: true, istante: Date.now() - 5000 });
  T("contatti: testo fatto solo di link -> risposta finta", ctSoloLink.status === 200, `${ctSoloLink.status}`);
  const ctElenco2 = (await (await adm.fetch("/api/v1/admin/contatti")).json()).richieste;
  T("contatti: esca e solo-link non entrano nel pannello", ctElenco2.length === ctElenco1.length, `${ctElenco1.length} -> ${ctElenco2.length}`);
  const ctPannello = await adm.fetch("/api/v1/admin/contatti");
  const ctB = await jarB.fetch("/api/v1/admin/contatti");
  T("contatti: pannello riservato a NaBoat", ctPannello.status === 200 && ctB.status === 403, `${ctPannello.status}/${ctB.status}`);

  // logout
  await jar.fetch("/api/v1/auth/logout", { method: "POST" });
  T("logout invalida sessione", (await jar.fetch("/api/v1/boats")).status === 401);

  console.log(`\n====================================\nRISULTATO: ${pass} PASS / ${fail} FAIL\n====================================`);
  if (issues.length) { console.log("PROBLEMI:"); issues.forEach((i) => console.log(" - " + i)); }
  process.exit(fail ? 1 : 0);
};

run().catch((e) => { console.error("Errore smoke test:", e); process.exit(2); });
