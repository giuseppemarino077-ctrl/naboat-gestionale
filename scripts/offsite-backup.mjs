// Copia offsite dei dump locali (./backups) su Aruba Object Storage / S3.
// Richiede S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY.
// Uso: node scripts/offsite-backup.mjs [cartellaDump=./backups]
import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";

const dir = process.argv[2] || "./backups";
const required = ["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY", "S3_SECRET_KEY"];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`Configurazione S3 mancante: ${missing.join(", ")}`);
  process.exit(2);
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || "auto",
  credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY },
  forcePathStyle: true,
});
const Bucket = process.env.S3_BUCKET;
const prefix = process.env.S3_BACKUP_PREFIX || "db-backups/";
const keepDays = Number(process.env.BACKUP_KEEP_DAYS || 30);

const walk = async (d) => {
  const out = [];
  for (const e of await readdir(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
};

const files = (await walk(dir)).filter((f) => /\.(sql|gz|dump)$/i.test(f));
if (!files.length) {
  console.log("Nessun dump da caricare.");
  process.exit(0);
}

let uploaded = 0;
for (const f of files) {
  const rel = f.replace(/\\/g, "/").replace(/^\.?\/?backups\//, "");
  const key = `${prefix}${rel}`;
  const body = await readFile(f);
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: body }));
  uploaded++;
  console.log(`caricato: ${key} (${(body.length / 1024 / 1024).toFixed(2)} MB)`);
}

// Retention offsite
const cutoff = Date.now() - keepDays * 86400000;
const listed = await s3.send(new ListObjectsV2Command({ Bucket, Prefix: prefix }));
let removed = 0;
for (const o of listed.Contents || []) {
  if (o.LastModified && o.LastModified.getTime() < cutoff && o.Key) {
    await s3.send(new DeleteObjectCommand({ Bucket, Key: o.Key }));
    removed++;
  }
}
console.log(`Completato: ${uploaded} caricati, ${removed} rimossi per retention (${keepDays}gg).`);
