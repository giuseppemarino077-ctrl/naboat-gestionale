// Copia di sicurezza GRATUITA sull'hosting Aruba del dominio (via FTP), in una cartella dedicata.
// È la seconda destinazione, oltre all'Object Storage: se il server muore, gli archivi
// restano anche sull'hosting che già pagate.
//
// Configurazione nel .env:
//   FTP_HOST=ftp.naboat.it
//   FTP_USER=utente@naboat.it
//   FTP_PASS=password
//   FTP_PORT=21
//   FTP_SECURE=true          (usa FTPS se l'hosting lo supporta)
//   FTP_CARTELLA=/backup-naboat
//   BACKUP_KEEP_DAYS=30      (retention anche qui)
//
// Uso: node scripts/backup-ftp.mjs [cartellaLocale=./backups]
import { Client } from "basic-ftp";
import { readdir, stat } from "fs/promises";
import { join } from "path";

const cartella = process.argv[2] || "./backups";
const richieste = ["FTP_HOST", "FTP_USER", "FTP_PASS"];
const mancanti = richieste.filter((k) => !process.env[k]);
if (mancanti.length) {
  console.error(`Configurazione FTP mancante: ${mancanti.join(", ")}`);
  process.exit(2);
}

const CARTELLA_REMOTA = process.env.FTP_CARTELLA || "/backup-naboat";
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 30);

// Raccoglie i file di backup (dump del database e archivi completi)
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
  console.log(`Cartella ${cartella} non trovata: niente da caricare.`);
  process.exit(0);
}
if (!file.length) {
  console.log("Nessun file di backup da caricare.");
  process.exit(0);
}

const client = new Client();
client.ftp.verbose = false;

try {
  console.log(`Connessione a ${process.env.FTP_HOST}…`);
  await client.access({
    host: process.env.FTP_HOST,
    port: Number(process.env.FTP_PORT || 21),
    user: process.env.FTP_USER,
    password: process.env.FTP_PASS,
    secure: process.env.FTP_SECURE === "true",
  });

  await client.ensureDir(CARTELLA_REMOTA);
  await client.cd(CARTELLA_REMOTA);

  let caricati = 0;
  for (const f of file) {
    const nome = f.replace(/\\/g, "/").split("/").pop();
    if (!nome) continue;
    const info = await stat(f);
    await client.uploadFrom(f, nome);
    caricati++;
    console.log(`caricato: ${nome} (${(info.size / 1024).toFixed(0)} KB)`);
  }

  // Retention anche sull'hosting
  const elenco = await client.list();
  const cutoff = Date.now() - keepDays * 86400000;
  let rimossi = 0;
  for (const voce of elenco) {
    if (voce.isFile && /\.(sql|gz|dump)$/i.test(voce.name) && voce.modifiedAt && voce.modifiedAt.getTime() < cutoff) {
      await client.remove(voce.name);
      rimossi++;
    }
  }

  console.log(`Completato: ${caricati} caricati, ${rimossi} rimossi per retention (${keepDays} giorni) in ${CARTELLA_REMOTA}`);
} catch (e) {
  console.error("Copia FTP non riuscita:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  client.close();
}
