// Seed dati dimostrativi: npm run db:seed:test
// Pulisce bookings/blocks/customers/boats/skippers/extras del tenant demo e ricrea
// una flotta realistica con prenotazioni relative a OGGI (così Oggi/Calendario si popolano).
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const OWNER_EMAIL = (process.env.SEED_OWNER_EMAIL || "marco@golfo.test").toLowerCase();

// Costruisce orario wall-clock Europe/Rome (settembre = UTC+2) come timestamptz.
const romeAt = (dayOffset, h, m = 0) => {
  const base = new Date();
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + dayOffset);
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), h - 2, m));
};

const main = async () => {
  const owner = await prisma.user.findUnique({ where: { email: OWNER_EMAIL }, include: { tenant: true } });
  if (!owner?.tenant) throw new Error(`Owner ${OWNER_EMAIL} o tenant non trovato`);
  const tenantId = owner.tenant.id;
  console.log(`tenant: ${owner.tenant.nome} (${tenantId})`);

  await prisma.bookingExtra.deleteMany({ where: { booking: { tenantId } } });
  await prisma.booking.deleteMany({ where: { tenantId } });
  await prisma.block.deleteMany({ where: { tenantId } });
  await prisma.customer.deleteMany({ where: { tenantId } });
  await prisma.boat.deleteMany({ where: { tenantId } });
  await prisma.skipper.deleteMany({ where: { tenantId } });
  await prisma.extra.deleteMany({ where: { tenantId } });

  const [gozzo, open, gommone] = await Promise.all([
    prisma.boat.create({ data: { tenantId, nome: "Gozzo Sorrentino 7.5", tipo: "GOZZO", capienza: 8, potenzaCv: 40, patenteRichiesta: false, stato: "disponibile" } }),
    prisma.boat.create({ data: { tenantId, nome: "Open 21 Premium", tipo: "OPEN", capienza: 6, potenzaCv: 150, patenteRichiesta: true, stato: "disponibile" } }),
    prisma.boat.create({ data: { tenantId, nome: "Gommone 650 Sport", tipo: "GOMMONE", capienza: 8, potenzaCv: 115, patenteRichiesta: false, stato: "disponibile" } }),
  ]);
  const [luigi, anna] = await Promise.all([
    prisma.skipper.create({ data: { tenantId, nome: "Luigi Parisi", telefono: "333111222" } }),
    prisma.skipper.create({ data: { tenantId, nome: "Anna Marina", telefono: "333333444" } }),
  ]);
  const [pranzo, snorkeling, tender] = await Promise.all([
    prisma.extra.create({ data: { tenantId, nome: "Pranzo a bordo", prezzo: 50 } }),
    prisma.extra.create({ data: { tenantId, nome: "Kit snorkeling", prezzo: 15 } }),
    prisma.extra.create({ data: { tenantId, nome: "Tender", prezzo: 40 } }),
  ]);

  const mkCustomer = (nome, telefono, email) =>
    prisma.customer.create({ data: { tenantId, nome, telefono, email, dedupKey: telefono.replace(/\D/g, "").slice(-15) } });
  const rossi = await mkCustomer("Andrea Rossi", "+39 333 000111", "rossi@mail.test");
  const lucia = await mkCustomer("Lucia Esposito", "+39 333 222333", "lucia@mail.test");
  const thomas = await mkCustomer("Thomas Meyer", "+39 333 444555", null);
  const giulia = await mkCustomer("Giulia Conti", "+39 333 666777", "giulia@mail.test");

  const mkBooking = (b) => prisma.booking.create({ data: { tenantId, ...b } });
  await mkBooking({ boatId: gozzo.id, customerId: rossi.id, startAt: romeAt(0, 10), endAt: romeAt(0, 18), stato: "prenotata", passeggeri: 6, clienteNome: rossi.nome, telefono: rossi.telefono, destinazione: "Capri", formula: "Giornaliera", patenteOk: true, extras: { create: [{ extraId: snorkeling.id }] } });
  await mkBooking({ boatId: open.id, customerId: lucia.id, startAt: romeAt(0, 10, 30), endAt: romeAt(0, 17, 30), stato: "in_mare", passeggeri: 5, clienteNome: lucia.nome, telefono: lucia.telefono, destinazione: "Ischia", skipperId: luigi.id, patenteOk: false, extras: { create: [{ extraId: pranzo.id }] } });
  await mkBooking({ boatId: gommone.id, customerId: thomas.id, startAt: romeAt(0, 11), endAt: romeAt(0, 17), stato: "prenotata", passeggeri: 8, clienteNome: thomas.nome, telefono: thomas.telefono, destinazione: "Procida", patenteOk: true });
  await mkBooking({ boatId: gozzo.id, customerId: giulia.id, startAt: romeAt(1, 9, 30), endAt: romeAt(1, 17, 30), stato: "prenotata", passeggeri: 7, clienteNome: giulia.nome, telefono: giulia.telefono, destinazione: "Amalfi", patenteOk: true });
  await mkBooking({ boatId: gommone.id, customerId: rossi.id, startAt: romeAt(-1, 9), endAt: romeAt(-1, 17), stato: "rientrata", passeggeri: 6, clienteNome: rossi.nome, telefono: rossi.telefono, destinazione: "Nisida", patenteOk: true });
  await mkBooking({ boatId: open.id, customerId: giulia.id, startAt: romeAt(3, 10), endAt: romeAt(3, 18), stato: "prenotata", passeggeri: 4, clienteNome: giulia.nome, telefono: giulia.telefono, destinazione: "Capri", skipperId: anna.id, patenteOk: false, extras: { create: [{ extraId: tender.id }] } });

  await prisma.block.create({ data: { tenantId, boatId: open.id, startAt: romeAt(5, 0), endAt: romeAt(6, 23, 59), motivo: "Tagliando motore" } });

  const counts = await Promise.all([
    prisma.boat.count({ where: { tenantId } }),
    prisma.booking.count({ where: { tenantId } }),
    prisma.customer.count({ where: { tenantId } }),
    prisma.block.count({ where: { tenantId } }),
  ]);
  console.log(`seed ok: ${counts[0]} barche, ${counts[1]} prenotazioni, ${counts[2]} clienti, ${counts[3]} blocchi`);
};

main().finally(() => prisma.$disconnect());
