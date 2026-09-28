// Seed superadmin NaBoat: npm run db:seed
// Legge SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD da env (o .env).
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { assicuraAmbienteDemo } from "../scripts/_guardia-ambiente.mjs";

assicuraAmbienteDemo("prisma/seed.mjs");

const prisma = new PrismaClient();

// Nessuna password predefinita: un segreto noto nel codice è una porta aperta.
const email = (process.env.SUPERADMIN_EMAIL || "admin@naboat.it").toLowerCase();
const password = process.env.SUPERADMIN_PASSWORD || "";

if (!password) throw new Error("SUPERADMIN_PASSWORD non impostata: definisci un segreto non prevedibile");
if (password.length < 12) throw new Error("SUPERADMIN_PASSWORD troppo corta (min 12)");

const main = async () => {
  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    console.log(`superadmin già presente: ${email}`);
    return;
  }
  await prisma.user.create({
    data: { email, passwordHash: await bcrypt.hash(password, 12), role: "superadmin", nome: "NaBoat Admin" },
  });
  console.log(`superadmin creato: ${email}`);
};

main().finally(() => prisma.$disconnect());
