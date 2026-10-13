import { PrismaClient } from "@prisma/client";
import { assicuraAmbienteDemo } from "./_guardia-ambiente.mjs";
import { pianoPulizia, applicaPulizia } from "./_dati-automatici.mjs";

assicuraAmbienteDemo("scripts/demo-pulisci.mjs");
const args = process.argv.slice(2);
if (args.some(arg => arg !== "--conferma")) throw new Error("Sono ammessi solo l’anteprima e --conferma: nessuna cancellazione per nome o pattern.");
const db = new PrismaClient();
try {
  const piano = await pianoPulizia(db);
  console.log("Dati riconosciuti come automatici:", JSON.stringify(Object.fromEntries(Object.entries(piano.ids).map(([k,v])=>[k,v.length]))));
  console.log("Aziende conservate:", JSON.stringify(piano.aziendeConservate));
  if (args.includes("--conferma")) {
    console.log("Rimossi:", JSON.stringify(await applicaPulizia(db,piano)));
  } else {
    console.log("Solo anteprima: nessun dato modificato. Per applicare: npm run demo:pulisci.");
  }
} catch(e) {
  console.error("Pulizia interrotta:",e.message);
  process.exitCode = 1;
} finally {
  await db.$disconnect();
}
