// Azienda dimostrativa per le prove visive (produzione o altro ambiente).
//   node scripts/demo-produzione.mjs            → crea l'azienda demo con utenti, barche e prenotazioni
//   node scripts/demo-produzione.mjs --elimina  → cancella tutto ciò che è stato creato
// Sul VPS (dove Node non è installato sull'host):
//   docker compose run --rm -T tools node scripts/demo-produzione.mjs
// Prima di andare online con clienti veri: lanciare --elimina.
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assicuraAmbienteDemo } from "./_guardia-ambiente.mjs";

assicuraAmbienteDemo("scripts/demo-produzione.mjs");

const prisma = new PrismaClient();
const DOMINIO = "demo.naboat.it";
const AZIENDA = "Demo Charter Napoli";

const UTENTI = [
  { email: `titolare@${DOMINIO}`, password: "Demo-Titolare-2026!", role: "owner", nome: "Marco Titolare" },
  { email: `operatore@${DOMINIO}`, password: "Demo-Operatore-2026!", role: "operatore", nome: "Sara Operatrice" },
  { email: `skipper@${DOMINIO}`, password: "Demo-Skipper-2026!", role: "skipper", nome: "Luigi Skipper" },
];

// Orario "da calendario" italiano (settembre = UTC+2) come nel seed di prova locale.
const romeAt = (giorni, h, m = 0) => {
  const base = new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + giorni);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 2, m));
};

const elimina = async () => {
  const t = await prisma.tenant.findFirst({ where: { nome: AZIENDA } });
  if (t) {
    await prisma.tenant.delete({ where: { id: t.id } });
    console.log(`azienda demo eliminata (${t.id}) insieme a barche, prenotazioni e clienti`);
  } else {
    console.log("azienda demo non trovata");
  }
  const u = await prisma.user.deleteMany({ where: { email: { endsWith: `@${DOMINIO}` } } });
  console.log(`utenti demo eliminati: ${u.count}`);
};

const crea = async () => {
  const esiste = await prisma.tenant.findFirst({ where: { nome: AZIENDA } });
  if (esiste) {
    console.log(`l'azienda demo esiste già (${esiste.id}): nessuna modifica. Per toglierla: --elimina`);
    return;
  }

  const tenant = await prisma.tenant.create({
    data: {
      nome: AZIENDA,
      status: "active",
      indirizzoPartenza: "Porto di Napoli — Molo Luise",
      telefonoContatto: "+39 081 555 0100",
    },
  });
  const tenantId = tenant.id;

  for (const u of UTENTI) {
    await prisma.user.create({
      data: {
        tenantId,
        email: u.email,
        passwordHash: await bcrypt.hash(u.password, 12),
        role: u.role,
        nome: u.nome,
        emailVerified: true,
      },
    });
  }

  const utenteSkipper = await prisma.user.findUniqueOrThrow({ where: { email: `skipper@${DOMINIO}` } });
  const [luigi, anna] = await Promise.all([
    prisma.skipper.create({ data: { tenantId, nome: "Luigi Skipper", telefono: "333 111 2222", userId: utenteSkipper.id } }),
    prisma.skipper.create({ data: { tenantId, nome: "Anna Marina", telefono: "333 333 4444" } }),
  ]);

  const [gozzo, open, gommone] = await Promise.all([
    prisma.boat.create({ data: { tenantId, nome: "Gozzo Sorrentino 7.5", tipo: "GOZZO", capienza: 8, potenzaCv: 40, patenteRichiesta: false, stato: "disponibile", lat: 40.8396, lon: 14.2516 } }),
    prisma.boat.create({ data: { tenantId, nome: "Open 21 Premium", tipo: "OPEN", capienza: 6, potenzaCv: 150, patenteRichiesta: true, stato: "disponibile", lat: 40.8396, lon: 14.2516 } }),
    prisma.boat.create({ data: { tenantId, nome: "Gommone 650 Sport", tipo: "GOMMONE", capienza: 8, potenzaCv: 115, patenteRichiesta: false, stato: "disponibile", lat: 40.8396, lon: 14.2516 } }),
  ]);

  const [pranzo, snorkeling, tender] = await Promise.all([
    prisma.extra.create({ data: { tenantId, nome: "Pranzo a bordo", prezzo: 50 } }),
    prisma.extra.create({ data: { tenantId, nome: "Kit snorkeling", prezzo: 15 } }),
    prisma.extra.create({ data: { tenantId, nome: "Tender", prezzo: 40 } }),
  ]);

  await Promise.all([
    prisma.tariffa.create({ data: { tenantId, boatId: gozzo.id, tipo: "giornata", prezzoCent: 35000 } }),
    prisma.tariffa.create({ data: { tenantId, boatId: open.id, tipo: "giornata", prezzoCent: 55000 } }),
    prisma.tariffa.create({ data: { tenantId, boatId: gommone.id, tipo: "mezza_giornata", prezzoCent: 18000 } }),
  ]);

  const mkCustomer = (nome, telefono, email) =>
    prisma.customer.create({ data: { tenantId, nome, telefono, email, dedupKey: telefono.replace(/\D/g, "").slice(-15) } });
  const rossi = await mkCustomer("Andrea Rossi", "+39 333 000111", "rossi@mail.test");
  const lucia = await mkCustomer("Lucia Esposito", "+39 333 222333", "lucia@mail.test");
  const thomas = await mkCustomer("Thomas Meyer", "+49 170 444555", null);
  const giulia = await mkCustomer("Giulia Conti", "+39 333 666777", "giulia@mail.test");

  const mkBooking = (b) => prisma.booking.create({ data: { tenantId, ...b } });
  const bGozzoOggi = await mkBooking({ boatId: gozzo.id, customerId: rossi.id, startAt: romeAt(0, 10), endAt: romeAt(0, 18), stato: "prenotata", passeggeri: 6, clienteNome: rossi.nome, telefono: rossi.telefono, destinazione: "Capri", formula: "Giornaliera", patenteOk: true, prezzoCent: 35000, cauzioneCent: 50000, cauzioneStato: "autorizzata", origineCanale: "naboat", extras: { create: [{ extraId: snorkeling.id }] } });
  await mkBooking({ boatId: open.id, customerId: lucia.id, startAt: romeAt(0, 10, 30), endAt: romeAt(0, 17, 30), stato: "in_mare", passeggeri: 5, clienteNome: lucia.nome, telefono: lucia.telefono, destinazione: "Ischia", skipperId: luigi.id, patenteOk: false, prezzoCent: 55000, extras: { create: [{ extraId: pranzo.id }] } });
  await mkBooking({ boatId: gommone.id, customerId: thomas.id, startAt: romeAt(0, 11), endAt: romeAt(0, 17), stato: "prenotata", passeggeri: 8, clienteNome: thomas.nome, telefono: thomas.telefono, destinazione: "Procida", patenteOk: true, prezzoCent: 25000 });
  await mkBooking({ boatId: gozzo.id, customerId: giulia.id, startAt: romeAt(1, 9, 30), endAt: romeAt(1, 17, 30), stato: "prenotata", passeggeri: 7, clienteNome: giulia.nome, telefono: giulia.telefono, destinazione: "Amalfi", patenteOk: true, prezzoCent: 35000 });
  const bPassata = await mkBooking({ boatId: gommone.id, customerId: rossi.id, startAt: romeAt(-1, 9), endAt: romeAt(-1, 17), stato: "rientrata", passeggeri: 6, clienteNome: rossi.nome, telefono: rossi.telefono, destinazione: "Nisida", patenteOk: true, prezzoCent: 25000 });
  await mkBooking({ boatId: open.id, customerId: giulia.id, startAt: romeAt(3, 10), endAt: romeAt(3, 18), stato: "prenotata", passeggeri: 4, clienteNome: giulia.nome, telefono: giulia.telefono, destinazione: "Capri", skipperId: anna.id, patenteOk: false, prezzoCent: 55000, extras: { create: [{ extraId: tender.id }] } });

  // Incassi: uno da incassare (con fee NaBoat, canale marketplace) e uno già pagato.
  await prisma.payment.create({ data: { tenantId, bookingId: bGozzoOggi.id, provider: "stripe", tipo: "totale", importoCent: 35000, feeNaboatCent: 2800, feeProviderCent: 700, totaleCent: 38500, stato: "in_attesa", metodo: "carta", descrizione: "Noleggio Gozzo Sorrentino 7.5 · Capri" } });
  await prisma.payment.create({ data: { tenantId, bookingId: bPassata.id, provider: "stripe", tipo: "totale", importoCent: 25000, feeNaboatCent: 0, feeProviderCent: 0, totaleCent: 25000, stato: "pagato", metodo: "carta", descrizione: "Noleggio Gommone 650 Sport · Nisida", paidAt: romeAt(-1, 9) } });

  await prisma.block.create({ data: { tenantId, boatId: open.id, startAt: romeAt(5, 0), endAt: romeAt(6, 23, 59), motivo: "Tagliando motore" } });

  await prisma.expense.create({ data: { tenantId, boatId: open.id, categoria: "carburante", descrizione: "Carburante uscite del weekend", importoCent: 18000, data: romeAt(-2, 12) } });
  await prisma.expense.create({ data: { tenantId, categoria: "pulizia", descrizione: "Pulizia e lavaggio flotta", importoCent: 6000, data: romeAt(-1, 18) } });
  await prisma.maintenance.create({ data: { tenantId, boatId: open.id, tipo: "tagliando", titolo: "Tagliando 200 ore motore", dataScadenza: romeAt(20, 9) } });
  await prisma.maintenance.create({ data: { tenantId, boatId: gommone.id, tipo: "assicurazione", titolo: "Rinnovo assicurazione", dataScadenza: romeAt(45, 9) } });

  const [barche, prenotazioni, clienti] = await Promise.all([
    prisma.boat.count({ where: { tenantId } }),
    prisma.booking.count({ where: { tenantId } }),
    prisma.customer.count({ where: { tenantId } }),
  ]);
  console.log(`azienda demo creata (${tenantId}): ${barche} barche, ${prenotazioni} prenotazioni, ${clienti} clienti`);
  console.log("");
  console.log("Accessi creati:");
  for (const u of UTENTI) console.log(`  ${u.role.padEnd(9)} ${u.email}  /  ${u.password}`);
};

const main = process.argv.includes("--elimina") ? elimina : crea;
main().finally(() => prisma.$disconnect());
