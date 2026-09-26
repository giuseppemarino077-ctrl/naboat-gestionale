// Controlla che i backup siano recenti. Pensato per il cron: se qualcosa non va
// esce con codice diverso da zero, così l'avviso via email parte da solo.
//
// Uso: node scripts/backup-verifica.mjs [cartella=./backups] [oreMassime=36]
import { readdir, stat } from "fs/promises";
import { join } from "path";

const cartella = process.argv[2] || "./backups";
const oreMassime = Number(process.argv[3] || 36);

const walk = async (d) => {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
};

let file = [];
try {
  file = (await walk(cartella)).filter((f) => /\.(sql|gz|dump)$/i.test(f));
} catch {
  console.error(`ERRORE: cartella ${cartella} non trovata.`);
  process.exit(2);
}

if (!file.length) {
  console.error(`ERRORE: nessun backup trovato in ${cartella}.`);
  process.exit(2);
}

let recente = null;
let dimensione = 0;
for (const f of file) {
  const info = await stat(f);
  if (!recente || info.mtime > recente.info.mtime) recente = { f, info };
}
dimensione = recente.info.size;

const ore = (Date.now() - recente.info.mtime.getTime()) / 3600000;
const giorni = (ore / 24).toFixed(1);
console.log(`Ultimo backup: ${recente.f} — ${giorni} giorni fa (${(dimensione / 1024 / 1024).toFixed(2)} MB)`);
console.log(`Copie presenti: ${file.length}`);

// Un archivio vuoto o troncato è sospetto. Con il database vuoto l'archivio è di pochi KB:
// la soglia serve solo a intercettare i casi in cui il dump non è stato prodotto.
if (dimensione < 4000) {
  console.error("ERRORE: l'ultimo backup è sospettosamente piccolo (possibile dump mancante).");
  process.exit(2);
}

if (ore > oreMassime) {
  console.error(`ERRORE: l'ultimo backup ha più di ${oreMassime} ore. Controllare il servizio di backup.`);
  process.exit(1);
}

console.log("Backup regolare.");
