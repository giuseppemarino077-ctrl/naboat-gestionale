// Cambia le password degli account con password nota (demo e di prova) e le stampa una volta.
// Di default NON cambia nulla: mostra solo quali account verrebbero protetti.
//   npm run demo:proteggi            -> elenco degli account coinvolti
//   npm run demo:proteggi -- --conferma   -> genera e applica nuove password
//
// Vengono protetti: il superadmin NaBoat, gli utenti delle aziende di prova ("Smoke …")
// e gli account demo noti (es. marco@golfo.test, op@golfo.test).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { assicuraAmbienteDemo } from "./_guardia-ambiente.mjs";

assicuraAmbienteDemo("scripts/demo-proteggi.mjs");

const prisma = new PrismaClient();

const DEMO_EMAILS = ["marco@golfo.test", "op@golfo.test"];
const args = process.argv.slice(2);
const conferma = args.includes("--conferma");

function passwordSicura() {
  const alfabeto = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = randomBytes(16);
  return [...bytes].map((b) => alfabeto[b % alfabeto.length]).join("");
}

const main = async () => {
  const aziendeTest = await prisma.tenant.findMany({
    where: { nome: { contains: "Smoke" } },
    select: { id: true },
  });
  const idsTest = aziendeTest.map((t) => t.id);

  const utenti = await prisma.user.findMany({
    where: {
      OR: [
        { role: "superadmin" },
        { tenantId: { in: idsTest } },
        { email: { in: DEMO_EMAILS } },
      ],
    },
    select: { id: true, email: true, role: true },
    orderBy: { email: "asc" },
  });

  console.log(`\nAccount con password nota da proteggere: ${utenti.length}`);
  for (const u of utenti.slice(0, 12)) console.log(`  - ${u.email} (${u.role})`);
  if (utenti.length > 12) console.log(`  … e altri ${utenti.length - 12}`);

  if (!conferma) {
    console.log(`\nMODALITÀ VERIFICA: nessuna password cambiata.`);
    console.log(`Per cambiarle davvero:  npm run demo:proteggi -- --conferma\n`);
    return;
  }

  console.log(`\nNuove password (salvale in un posto sicuro, non vengono mostrate di nuovo):\n`);
  for (const u of utenti) {
    const nuova = passwordSicura();
    await prisma.user.update({
      where: { id: u.id },
      data: { passwordHash: await bcrypt.hash(nuova, 12), totpSecret: null, totpEnabled: false },
    });
    console.log(`  ${u.email.padEnd(34)} ${nuova}`);
  }
  console.log(`\nFatto: ${utenti.length} password cambiate. 2FA azzerata per quegli account.\n`);
};

main()
  .catch((e) => {
    console.error("Errore:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
