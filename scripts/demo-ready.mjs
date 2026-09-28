// Dati dimostrativi completi per vedere tutte le funzioni in locale.
//   node scripts/demo-ready.mjs
// Non cancella le aziende: rimpiazza solo i dati operativi dei tenant demo.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { mkdir, writeFile, readFile } from "fs/promises";
import { join } from "path";
import { randomUUID, createHash, createCipheriv } from "crypto";
import { assicuraAmbienteDemo } from "./_guardia-ambiente.mjs";

assicuraAmbienteDemo("scripts/demo-ready.mjs");

const prisma = new PrismaClient();

// Cartella delle foto: in locale public/uploads, sul server il volume montato (es. /app/uploads).
const UPLOADS = process.env.UPLOADS_DIR || join(process.cwd(), "public", "uploads");

// AUTH_SECRET serve per cifrare il numero della patente come fa l'applicazione.
async function authSecret() {
  if (process.env.AUTH_SECRET) return process.env.AUTH_SECRET;
  try {
    const t = await readFile(join(process.cwd(), ".env.local"), "utf8");
    const m = t.match(/^AUTH_SECRET=(.*)$/m);
    return m ? m[1].trim().replace(/^['"]|['"]$/g, "") : "locale-dev-auth-secret-0123456789ABCDEF";
  } catch {
    return "locale-dev-auth-secret-0123456789ABCDEF";
  }
}
async function cifra(testo) {
  const key = createHash("sha256").update(await authSecret()).digest();
  const iv = randomUUID().replace(/-/g, "").slice(0, 24);
  const c = createCipheriv("aes-256-gcm", key, Buffer.from(iv, "hex"));
  const enc = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return `${iv}:${c.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

async function foto(tenantId, label, c1, c2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
    <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${c1}"/><stop offset="100%" stop-color="${c2}"/></linearGradient></defs>
    <rect width="1200" height="800" fill="url(#g)"/>
    <circle cx="950" cy="170" r="95" fill="#ffffff" opacity="0.22"/>
    <path d="M0 620 Q300 560 600 620 T1200 620 V800 H0 Z" fill="#ffffff" opacity="0.16"/>
    <text x="60" y="130" font-family="Helvetica, Arial" font-size="56" fill="#ffffff" font-weight="bold">${label}</text>
    <text x="60" y="190" font-family="Helvetica, Arial" font-size="30" fill="#ffffff" opacity="0.85">NaBoat · demo</text>
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 82 }).toBuffer();
  const dir = join(UPLOADS, tenantId);
  await mkdir(dir, { recursive: true });
  const name = `${randomUUID()}.webp`;
  await writeFile(join(dir, name), buf);
  return `/uploads/${tenantId}/${name}`;
}

const romeAt = (offset, h, m = 0) => {
  const base = new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + offset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 2, m));
};
const euroCent = (v) => Math.round(v * 100);

async function utenteDemo(email, password, nome, role, tenantId) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.user.upsert({
    where: { email },
    update: { tenantId, role, nome, passwordHash, emailVerified: true },
    create: { tenantId, email, role, nome, passwordHash, emailVerified: true },
  });
}

// Crea le aziende e gli account demo se non esistono (server appena allestito).
async function assicuraDemo() {
  let charter = await prisma.tenant.findFirst({ where: { nome: "Demo Charter Napoli" } });
  if (!charter) charter = await prisma.tenant.create({ data: { nome: "Demo Charter Napoli", status: "active", tipoModulo: "noleggio", indirizzoPartenza: "Porto di Napoli — Molo Luise" } });
  await utenteDemo("titolare@demo.naboat.it", "Demo-Titolare-2026!", "Marco Titolare", "owner", charter.id);
  await utenteDemo("operatore@demo.naboat.it", "Demo-Operatore-2026!", "Sara Operatrice", "operatore", charter.id);
  await utenteDemo("skipper@demo.naboat.it", "Demo-Skipper-2026!", "Luigi Skipper", "skipper", charter.id);

  let orm = await prisma.tenant.findFirst({ where: { nome: "Ormeggio Demo" } });
  if (!orm) orm = await prisma.tenant.create({ data: { nome: "Ormeggio Demo", status: "active", tipoModulo: "ormeggio", moduloOrmeggio: true, indirizzoPartenza: "Porto di Napoli — Molo Luise", telefonoContatto: "+39 081 555 0200" } });
  else await prisma.tenant.update({ where: { id: orm.id }, data: { tipoModulo: "ormeggio", moduloOrmeggio: true, status: "active" } });
  await utenteDemo("ormeggiatore@demo.naboat.it", "Demo-Ormeggio-2026!", "Ormeggiatore Demo", "owner", orm.id);
}

async function pulisciOperativo(tenantId) {
  await prisma.recensione.deleteMany({ where: { tenantId } });
  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.block.deleteMany({ where: { tenantId } });
}

async function demoCharter() {
  const t = await prisma.tenant.findFirst({ where: { nome: "Demo Charter Napoli" } });
  if (!t) return console.log("Demo Charter Napoli non trovata: salto.");
  const tenantId = t.id;
  await pulisciOperativo(tenantId);

  await prisma.tenant.update({
    where: { id: tenantId },
    data: {
      slug: "demo-charter-napoli", verificata: true, citta: "Napoli", annoFondazione: 2014,
      descrizione: "Noleggio barche a Napoli con e senza skipper. Esperienza dal 2014, base al Molo Luise.",
      lingue: "italiano, inglese", orarioImbarco: "9:00", orarioRientro: "18:00",
      politicaCancellazione: "Rimborso del 50% fino a 48 ore prima dell'uscita.",
      telefonoContatto: "+39 081 555 0100", pianoTipo: "pro", pianoScadenzaAt: null,
    },
  });

  const porto = await prisma.porto.upsert({
    where: { id: (await prisma.porto.findFirst({ where: { tenantId, nome: "Porto di Napoli — Molo Luise" } }))?.id ?? randomUUID() },
    update: { indirizzo: "Molo Luise, Napoli", lat: 40.8397, lon: 14.2544, note: "Ingresso dal varco est, pontile 4.", orari: "8:00–20:00" },
    create: { tenantId, nome: "Porto di Napoli — Molo Luise", indirizzo: "Molo Luise, Napoli", lat: 40.8397, lon: 14.2544, note: "Ingresso dal varco est, pontile 4.", orari: "8:00–20:00" },
  });

  const barcheDef = [
    { nome: "Gozzo Sorrentino 7.5", tipo: "gozzo", capienza: 8, potenzaCv: 40, patenteRichiesta: false, lunghezzaM: 7.5, cabine: 1, c1: "#0e7490", c2: "#1e3a5f", prezzo: 250 },
    { nome: "Open 21 Premium", tipo: "open", capienza: 6, potenzaCv: 150, patenteRichiesta: true, lunghezzaM: 6.4, cabine: 0, c1: "#b45309", c2: "#7c2d12", prezzo: 320 },
    { nome: "Gommone 650 Sport", tipo: "gommone", capienza: 8, potenzaCv: 115, patenteRichiesta: false, lunghezzaM: 6.5, cabine: 0, c1: "#15803d", c2: "#14532d", prezzo: 190 },
  ];
  const barche = {};
  for (const def of barcheDef) {
    const b = await prisma.boat.findFirst({ where: { tenantId, nome: def.nome } });
    if (!b) continue;
    const gallery = [await foto(tenantId, def.nome, def.c1, def.c2), await foto(tenantId, "A bordo", def.c2, def.c1), await foto(tenantId, "In navigazione", "#0f766e", def.c1)];
    const agg = await prisma.boat.update({
      where: { id: b.id },
      data: {
        tipo: def.tipo, capienza: def.capienza, potenzaCv: def.potenzaCv, patenteRichiesta: def.patenteRichiesta,
        uso: "noleggio", stato: "disponibile", pubblicata: true, inPausa: false, archiviato: false, portoId: porto.id,
        lunghezzaM: def.lunghezzaM, cabine: def.cabine, etaMinima: 18, cauzioneCent: euroCent(500),
        carburante: "Benzina, pieno iniziale incluso", dotazioni: ["Prendisole", "Tendalino", "Doccia", "Audio", "Kit snorkeling"],
        descrizione: `${def.nome}: barca comoda e stabile, ideale per una giornata a Capri o Ischia.`,
        fotoGallery: gallery, fotoCopertina: gallery[0], lat: 40.8397, lon: 14.2544,
      },
    });
    barche[def.nome] = agg;
    await prisma.tariffa.deleteMany({ where: { tenantId, boatId: b.id } });
    await prisma.tariffa.createMany({ data: [
      { tenantId, boatId: b.id, tipo: "giornata", stagione: "alta", prezzoCent: euroCent(def.prezzo), attivo: true },
      { tenantId, boatId: b.id, tipo: "giornata", stagione: "bassa", prezzoCent: euroCent(def.prezzo - 70), attivo: true },
      { tenantId, boatId: b.id, tipo: "mezza_giornata", stagione: "tutto_anno", prezzoCent: euroCent(Math.round(def.prezzo / 2)), attivo: true },
    ] });
  }

  await prisma.extra.deleteMany({ where: { tenantId } });
  for (const e of [
    { nome: "Pranzo a bordo", prezzo: 50, unita: "persona", quantitaMax: 10 },
    { nome: "Kit snorkeling", prezzo: 15, unita: "persona", quantitaMax: 8 },
    { nome: "Tender", prezzo: 40, unita: "noleggio", quantitaMax: null },
  ]) await prisma.extra.create({ data: { tenantId, ...e } });

  for (const s of [{ nome: "Luigi Parisi", telefono: "333111222" }, { nome: "Anna Marina", telefono: "333333444" }]) {
    const ex = await prisma.skipper.findFirst({ where: { tenantId, nome: s.nome } });
    if (!ex) await prisma.skipper.create({ data: { tenantId, ...s } });
  }
  const skipper = await prisma.skipper.findFirst({ where: { tenantId } });

  const clientiDef = [
    { nome: "Andrea Rossi", telefono: "+39 333 000111", email: "rossi@mail.test" },
    { nome: "Lucia Esposito", telefono: "+39 333 222333", email: "lucia@mail.test" },
    { nome: "Thomas Meyer", telefono: "+39 333 444555", email: null },
    { nome: "Giulia Conti", telefono: "+39 333 666777", email: "giulia@mail.test" },
  ];
  const clienti = {};
  for (const c of clientiDef) {
    const dedupKey = c.telefono.replace(/\D/g, "").slice(-15);
    clienti[c.nome] = await prisma.customer.upsert({
      where: { tenantId_dedupKey: { tenantId, dedupKey } },
      update: { nome: c.nome, email: c.email },
      create: { tenantId, nome: c.nome, telefono: c.telefono, email: c.email, dedupKey },
    });
  }

  const gozzo = barche["Gozzo Sorrentino 7.5"], open = barche["Open 21 Premium"], gommone = barche["Gommone 650 Sport"];
  const bInMare = await prisma.booking.create({ data: { tenantId, boatId: gozzo.id, customerId: clienti["Andrea Rossi"].id, startAt: romeAt(0, 10), endAt: romeAt(0, 17), stato: "in_mare", passeggeri: 6, clienteNome: "Andrea Rossi", telefono: clienti["Andrea Rossi"].telefono, destinazione: "Capri", formula: "Giornaliera", patenteOk: true, prezzoCent: euroCent(250), origineCanale: "diretto" } });
  await prisma.booking.create({ data: { tenantId, boatId: open.id, customerId: clienti["Lucia Esposito"].id, startAt: romeAt(0, 11), endAt: romeAt(0, 18), stato: "prenotata", passeggeri: 5, clienteNome: "Lucia Esposito", telefono: clienti["Lucia Esposito"].telefono, destinazione: "Ischia", skipperId: skipper?.id ?? null, prezzoCent: euroCent(320), origineCanale: "diretto" } });
  const bRientrata = await prisma.booking.create({ data: { tenantId, boatId: gommone.id, customerId: clienti["Thomas Meyer"].id, startAt: romeAt(-1, 9), endAt: romeAt(-1, 17), stato: "rientrata", passeggeri: 6, clienteNome: "Thomas Meyer", telefono: clienti["Thomas Meyer"].telefono, destinazione: "Nisida", prezzoCent: euroCent(190), checkinAt: romeAt(-1, 9), checkoutAt: romeAt(-1, 17), origineCanale: "diretto" } });
  await prisma.booking.create({ data: { tenantId, boatId: gozzo.id, customerId: clienti["Giulia Conti"].id, startAt: romeAt(3, 10), endAt: romeAt(3, 18), stato: "prenotata", passeggeri: 4, clienteNome: "Giulia Conti", telefono: clienti["Giulia Conti"].telefono, destinazione: "Amalfi", prezzoCent: euroCent(250), origineCanale: "diretto" } });
  await prisma.booking.create({ data: { tenantId, boatId: open.id, customerId: clienti["Andrea Rossi"].id, startAt: romeAt(5, 10), endAt: romeAt(5, 16), stato: "da_confermare", passeggeri: 4, clienteNome: "Andrea Rossi", telefono: clienti["Andrea Rossi"].telefono, destinazione: "Procida", prezzoCent: euroCent(320), origineCanale: "naboat" } });

  await prisma.payment.create({ data: { tenantId, bookingId: bInMare.id, provider: "stripe", tipo: "acconto", importoCent: euroCent(75), feeNaboatCent: 0, feeProviderCent: 0, totaleCent: euroCent(75), stato: "pagato", metodo: "carta", paidAt: romeAt(0, 8), descrizione: "Acconto online" } });

  await prisma.recensione.create({ data: { tenantId, bookingId: bRientrata.id, customerId: clienti["Thomas Meyer"].id, voto: 5, commento: "Giornata splendida, barca pulitissima e personale gentilissimo.", stato: "pubblicata" } });

  return { tenantId, barche, clienti };
}

async function clienteDemo(charter) {
  const email = "cliente@demo.naboat.it";
  let account = await prisma.clienteAccount.findUnique({ where: { email } });
  if (!account) {
    account = await prisma.clienteAccount.create({ data: { email, nome: "Cliente Demo", telefono: "+39 340 1112222", passwordHash: await bcrypt.hash("demo-cliente-123", 12), emailVerified: true } });
  }
  // prenotazioni del cliente (una conclusa + una futura)
  await prisma.recensione.deleteMany({ where: { clienteAccountId: account.id } });
  const vecchie = await prisma.booking.findMany({ where: { clienteAccountId: account.id }, select: { id: true } });
  await prisma.payment.deleteMany({ where: { bookingId: { in: vecchie.map((b) => b.id) } } });
  await prisma.booking.deleteMany({ where: { clienteAccountId: account.id } });

  const { tenantId, barche, clienti } = charter;
  const gozzo = barche["Gozzo Sorrentino 7.5"], open = barche["Open 21 Premium"];
  const conclusa = await prisma.booking.create({ data: { tenantId, boatId: gozzo.id, customerId: clienti["Andrea Rossi"].id, clienteAccountId: account.id, startAt: romeAt(-12, 10), endAt: romeAt(-12, 17), stato: "rientrata", passeggeri: 4, clienteNome: "Cliente Demo", telefono: "+39 340 1112222", destinazione: "Capri", prezzoCent: euroCent(250), checkinAt: romeAt(-12, 10), checkoutAt: romeAt(-12, 17), origineCanale: "naboat" } });
  await prisma.payment.create({ data: { tenantId, bookingId: conclusa.id, provider: "stripe", tipo: "totale", importoCent: euroCent(250), totaleCent: euroCent(250), stato: "pagato", metodo: "carta", paidAt: romeAt(-12, 9), descrizione: "Noleggio pagato" } });
  const futura = await prisma.booking.create({ data: { tenantId, boatId: open.id, customerId: clienti["Andrea Rossi"].id, clienteAccountId: account.id, startAt: romeAt(8, 10), endAt: romeAt(8, 18), stato: "prenotata", passeggeri: 5, clienteNome: "Cliente Demo", telefono: "+39 340 1112222", destinazione: "Ischia", prezzoCent: euroCent(320), origineCanale: "naboat" } });
  await prisma.payment.create({ data: { tenantId, bookingId: futura.id, provider: "stripe", tipo: "acconto", importoCent: euroCent(96), totaleCent: euroCent(96), stato: "pagato", metodo: "carta", paidAt: romeAt(-1, 9), descrizione: "Acconto 30%" } });

  // patente in verifica (foto privata + numero cifrato)
  const dir = join(UPLOADS, "privato", `patenti-${account.id}`);
  await mkdir(dir, { recursive: true });
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="600"><rect width="900" height="600" fill="#f4f1ea"/><rect x="40" y="40" width="820" height="520" fill="#ffffff" stroke="#d8cfc2"/><text x="80" y="130" font-family="Helvetica" font-size="34" fill="#33241c" font-weight="bold">PATENTE NAUTICA</text><text x="80" y="200" font-family="Helvetica" font-size="26" fill="#8a7568">Cliente Demo</text><text x="80" y="260" font-family="Helvetica" font-size="26" fill="#8a7568">NA-123456</text><text x="80" y="500" font-family="Helvetica" font-size="20" fill="#b9ada0">Documento dimostrativo</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
  const name = `${randomUUID()}.webp`;
  await writeFile(join(dir, name), buf);
  const fotoUrl = `/api/v1/uploads/privato/privato/patenti-${account.id}/${name}`;
  await prisma.patenteNautica.upsert({
    where: { accountId: account.id },
    update: { numeroCifrato: await cifra("NA-123456"), fotoUrl, stato: "in_verifica", motivoRifiuto: null },
    create: { accountId: account.id, numeroCifrato: await cifra("NA-123456"), fotoUrl },
  });
  return account;
}

async function ormeggioDemo() {
  const t = await prisma.tenant.findFirst({ where: { nome: "Ormeggio Demo" } });
  if (!t) return console.log("Ormeggio Demo non trovata: salto.");
  const tenantId = t.id;

  await prisma.payment.deleteMany({ where: { tenantId } });
  await prisma.addebito.deleteMany({ where: { tenantId } });
  await prisma.attivita.deleteMany({ where: { tenantId } });
  await prisma.movimento.deleteMany({ where: { tenantId } });
  await prisma.contrattoOrmeggio.deleteMany({ where: { tenantId } }).catch(() => {});
  await prisma.permanenza.deleteMany({ where: { tenantId } });
  await prisma.area.deleteMany({ where: { tenantId } });
  await prisma.servizioCatalogo.deleteMany({ where: { tenantId } });
  await prisma.boat.deleteMany({ where: { tenantId, uso: "custodia" } });
  await prisma.proprietario.deleteMany({ where: { tenantId } });

  const area = await prisma.area.create({ data: { tenantId, nome: "Area ormeggio", righe: 3, colonne: 4, ordine: 0 } });
  const posti = {};
  for (let r = 1; r <= 3; r++) for (let c = 1; c <= 4; c++) {
    const codice = `${String.fromCharCode(64 + r)}${c}`;
    posti[codice] = await prisma.posto.create({ data: { tenantId, areaId: area.id, riga: r, colonna: c, codice, bloccato: codice === "C4" } });
  }

  for (const s of [
    { nome: "Lavaggio", prezzoCent: euroCent(25), unita: "fisso" },
    { nome: "Carburante", prezzoCent: euroCent(1.8), unita: "litri" },
    { nome: "Manutenzione motore", prezzoCent: euroCent(80), unita: "fisso" },
  ]) await prisma.servizioCatalogo.create({ data: { tenantId, ...s } });

  const p1 = await prisma.proprietario.create({ data: { tenantId, nome: "Mario Rossi", telefono: "+39 338 1110000", email: "mario.rossi@mail.test", dedupKey: "t:3381110000" } });
  const p2 = await prisma.proprietario.create({ data: { tenantId, nome: "Anna Verdi", telefono: "+39 338 2220000", dedupKey: "t:3382220000" } });
  const b1 = await prisma.boat.create({ data: { tenantId, proprietarioId: p1.id, nome: "Aurora", tipo: "gozzo", uso: "custodia", capienza: 6, pubblicata: false } });
  const b2 = await prisma.boat.create({ data: { tenantId, proprietarioId: p2.id, nome: "Bella", tipo: "open", uso: "custodia", capienza: 5, pubblicata: false } });

  const perm1 = await prisma.permanenza.create({ data: { tenantId, boatId: b1.id, postoId: posti["A1"].id, tipo: "ormeggio_custodia", inizioAt: romeAt(-60, 9), finePrevistaAt: romeAt(30, 18), stato: "attiva", corrispettivoCent: euroCent(200) } });
  const perm2 = await prisma.permanenza.create({ data: { tenantId, boatId: b2.id, postoId: posti["B2"].id, tipo: "ormeggio_custodia", inizioAt: romeAt(-20, 9), stato: "attiva", corrispettivoCent: euroCent(150) } });

  // Caso numerico del brief: 200 (custodia) + 25 (lavaggio) + 72 (40 L × 1,80) = 297; incassato 100; residuo 197.
  await prisma.addebito.createMany({ data: [
    { tenantId, permanenzaId: perm1.id, descrizione: "Custodia", importoCent: euroCent(200), origine: "custodia" },
    { tenantId, permanenzaId: perm1.id, descrizione: "Lavaggio", importoCent: euroCent(25), origine: "servizio" },
    { tenantId, permanenzaId: perm1.id, descrizione: "Carburante 40 L", importoCent: euroCent(72), origine: "carburante" },
    { tenantId, permanenzaId: perm2.id, descrizione: "Custodia", importoCent: euroCent(150), origine: "custodia" },
  ] });
  await prisma.payment.create({ data: { tenantId, permanenzaId: perm1.id, provider: "manuale", tipo: "acconto", importoCent: euroCent(100), totaleCent: euroCent(100), stato: "pagato", metodo: "contanti", paidAt: romeAt(-5, 10), descrizione: "Acconto custodia" } });

  await prisma.attivita.createMany({ data: [
    { tenantId, permanenzaId: perm1.id, tipo: "Lavaggio", stato: "completato", dataPrevista: romeAt(-2, 9), completatoAt: romeAt(-2, 11), prezzoCent: euroCent(25), incluso: false },
    { tenantId, permanenzaId: perm1.id, tipo: "Cambio olio", stato: "da_fare", dataPrevista: romeAt(2, 9), prezzoCent: euroCent(80), incluso: false },
    { tenantId, permanenzaId: perm2.id, tipo: "Rifornimento", stato: "in_corso", dataPrevista: romeAt(1, 9), quantita: 30, unita: "litri", prezzoCent: euroCent(1.8), incluso: false },
  ] });
  await prisma.movimento.createMany({ data: [
    { tenantId, permanenzaId: perm1.id, boatId: b1.id, tipo: "uscita", previstoAt: romeAt(-1, 9), effettivoAt: romeAt(-1, 9, 30) },
    { tenantId, permanenzaId: perm1.id, boatId: b1.id, tipo: "rientro", previstoAt: romeAt(-1, 18), effettivoAt: romeAt(-1, 17, 45) },
  ] });

  return { tenantId };
}

async function main() {
  await assicuraDemo();
  const charter = await demoCharter();
  if (charter) await clienteDemo(charter);
  await ormeggioDemo();
  console.log("Dati demo pronti.");
  console.log("  Noleggio: titolare@demo.naboat.it / Demo-Titolare-2026!");
  console.log("  Cliente:  cliente@demo.naboat.it / demo-cliente-123");
  console.log("  Ormeggio: ormeggiatore@demo.naboat.it / Demo-Ormeggio-2026!");
  console.log("  NaBoat:   admin@naboat.it / (password in .env.local)");
}

main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
