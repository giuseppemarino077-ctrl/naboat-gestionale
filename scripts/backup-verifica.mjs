// Controlla che i backup siano recenti E che esista una prova di ripristino
// recente: un file di backup non basta, va dimostrato che si ripristina.
// Pensato per il cron: se qualcosa non va esce con codice diverso da zero,
// così l'avviso via email parte da solo.
//
// Uso: node scripts/backup-verifica.mjs [cartella=./backups] [oreMassime=36]
// Variabili:
//   PROVA_RIPRISTINO_FILE=./backups/ripristino-ok.txt  (prova scritta da verifica-ripristino.sh)
//   PROVA_RIPRISTINO_GIORNI=35                          (validità della prova)
//   PROVA_RIPRISTINO_OBBLIGATORIA=false                 (disattiva il controllo, sconsigliato)
import { readdir, stat } from "fs/promises";
import { join } from "path";

const cartella = process.argv[2] || "./backups";
const oreMassime = Number(process.argv[3] || 36);
const provaFile = process.env.PROVA_RIPRISTINO_FILE || join(cartella, "ripristino-ok.txt");
const provaGiorni = Number(process.env.PROVA_RIPRISTINO_GIORNI || 35);
const provaObbligatoria = !["false", "0", "no"].includes((process.env.PROVA_RIPRISTINO_OBBLIGATORIA || "true").toLowerCase());

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
for (const f of file) {
  const info = await stat(f);
  if (!recente || info.mtime > recente.info.mtime) recente = { f, info };
}
const dimensione = recente.info.size;

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

// La verifica è legata al ripristino: senza una prova recente il backup non è
// considerato affidabile. La prova la scrive scripts/verifica-ripristino.sh.
let provaOk = false;
try {
  const p = await stat(provaFile);
  const giorniProva = (Date.now() - p.mtime.getTime()) / 86400000;
  if (giorniProva <= provaGiorni) {
    provaOk = true;
    console.log(`Prova di ripristino: ${provaFile} — ${giorniProva.toFixed(1)} giorni fa (valida).`);
  } else {
    console.error(`ERRORE: la prova di ripristino ha ${giorniProva.toFixed(1)} giorni (max ${provaGiorni}). Esegui ./scripts/verifica-ripristino.sh.`);
  }
} catch {
  console.error(`ERRORE: prova di ripristino assente (${provaFile}). Esegui ./scripts/verifica-ripristino.sh.`);
}

if (ore > oreMassime) {
  console.error(`ERRORE: l'ultimo backup ha più di ${oreMassime} ore. Controllare il servizio di backup.`);
  process.exit(1);
}
if (!provaOk) {
  if (provaObbligatoria) process.exit(1);
  console.error("ATTENZIONE: prova di ripristino mancante o vecchia (controllo non bloccante).");
}

console.log("Backup regolare e prova di ripristino valida.");
