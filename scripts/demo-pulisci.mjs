// Cancella i dati di prova dal database (aziende "Smoke …" e relative voci di registro).
// Di default NON cancella: mostra solo cosa verrebbe rimosso.
//   npm run demo:verifica                  -> elenco di cosa verrebbe cancellato
//   npm run demo:pulisci                   -> cancella davvero le aziende di test
//   npm run demo:pulisci -- --pattern "%"  -> cambia il filtro sui nomi
//
// La cancellazione di un Tenant rimuove a cascata barche, prenotazioni, clienti,
// incassi, spese, manutenzioni, tariffe, skipper, extra e abbonamenti.
// Le voci di AuditLog non hanno legame a cascata: vengono rimosse a parte.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const conferma = args.includes("--conferma");
const patternArg = args.find((a) => a.startsWith("--pattern="));
const pattern = patternArg ? patternArg.split("=")[1] : "Smoke %";

const main = async () => {
  const tenant = await prisma.tenant.findMany({
    where: { nome: { contains: pattern.replace(/%/g, "") } },
    select: { id: true, nome: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  if (!tenant.length) {
    console.log(`Nessuna azienda trovata con nome che contiene "${pattern.replace(/%/g, "")}". Niente da fare.`);
    return;
  }

  const ids = tenant.map((t) => t.id);

  const [barche, prenotazioni, clienti, incassi, spese, manutenzioni, tariffe, abbonamenti, utenti, registro] =
    await Promise.all([
      prisma.boat.count({ where: { tenantId: { in: ids } } }),
      prisma.booking.count({ where: { tenantId: { in: ids } } }),
      prisma.customer.count({ where: { tenantId: { in: ids } } }),
      prisma.payment.count({ where: { tenantId: { in: ids } } }),
      prisma.expense.count({ where: { tenantId: { in: ids } } }),
      prisma.maintenance.count({ where: { tenantId: { in: ids } } }),
      prisma.tariffa.count({ where: { tenantId: { in: ids } } }),
      prisma.subscription.count({ where: { tenantId: { in: ids } } }),
      prisma.user.count({ where: { tenantId: { in: ids } } }),
      prisma.auditLog.count({ where: { tenantId: { in: ids } } }),
    ]);

  console.log(`\nAziende che corrispondono a "${pattern.replace(/%/g, "")}": ${tenant.length}`);
  for (const t of tenant.slice(0, 10)) console.log(`  - ${t.nome} (${t.status})`);
  if (tenant.length > 10) console.log(`  … e altre ${tenant.length - 10}`);

  console.log(`\nDati collegati che verrebbero rimossi:`);
  console.log(`  utenti ${utenti} · barche ${barche} · prenotazioni ${prenotazioni} · clienti ${clienti}`);
  console.log(`  incassi ${incassi} · spese ${spese} · manutenzioni ${manutenzioni} · tariffe ${tariffe} · abbonamenti ${abbonamenti}`);
  console.log(`  voci di registro: ${registro} (rimosse a parte)`);

  if (!conferma) {
    console.log(`\nMODALITÀ VERIFICA: non è stato cancellato nulla.`);
    console.log(`Per cancellare davvero:  npm run demo:pulisci\n`);
    return;
  }

  await prisma.auditLog.deleteMany({ where: { tenantId: { in: ids } } });
  const rimosse = await prisma.tenant.deleteMany({ where: { id: { in: ids } } });

  const rimaste = await prisma.tenant.findMany({ select: { nome: true }, orderBy: { nome: "asc" } });
  console.log(`\nCancellate ${rimosse.count} aziende e ${registro} voci di registro.`);
  console.log(`Aziende rimaste nel database: ${rimaste.length ? rimaste.map((t) => t.nome).join(", ") : "nessuna"}\n`);
};

main()
  .catch((e) => {
    console.error("Errore:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
