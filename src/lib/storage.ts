import { PutObjectCommand, S3Client, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import { join, normalize } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";

export class InvalidPhotoError extends Error {}

export const MAX_BYTES = 5 * 1024 * 1024;
export const MIME_OK = ["image/jpeg", "image/png", "image/webp"];

const driver = process.env.STORAGE_DRIVER ?? "local";

// I file privati (patenti, verbali di check-in/out) NON stanno sotto public/:
// una cartella pubblica verrebbe servita staticamente da Next in sviluppo e da un
// eventuale proxy in produzione, aggirando i controlli di accesso. Stanno quindi
// fuori dall'albero web e si leggono solo dalle rotte autenticate.
const DIR_PRIVATO = process.env.PRIVATE_UPLOADS_DIR || join(process.cwd(), "uploads-privati");
const DIR_PUBBLICO = join(process.cwd(), "public", "uploads");

let s3: S3Client | null = null;
function s3client() {
  if (!s3) {
    if (!process.env.S3_ENDPOINT || !process.env.S3_BUCKET) throw new Error("Storage S3 non configurato");
    s3 = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION ?? "auto",
      credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? "", secretAccessKey: process.env.S3_SECRET_KEY ?? "" },
      forcePathStyle: true,
    });
  }
  return s3;
}

// Le foto pubbliche (barche, loghi, sfondi) stanno sotto /uploads/<tenant>.
// Le foto private stanno nel deposito privato e si servono solo dalle rotte
// autenticate /api/v1/uploads/privato/... e /api/v1/patenti/foto/...
export async function savePhoto(tenantId: string, bytes: Buffer, mime: string, opts: { privato?: boolean } = {}): Promise<string> {
  if (!MIME_OK.includes(mime) || !bytes.length || bytes.length > MAX_BYTES) {
    throw new InvalidPhotoError("Immagine non valida o superiore a 5 MB");
  }
  try {
    const image = sharp(bytes, { limitInputPixels: 25000000, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.format || !["jpeg", "png", "webp"].includes(metadata.format) || (metadata.pages ?? 1) > 1) {
      throw new InvalidPhotoError("Formato immagine non supportato o immagine animata");
    }
    bytes = await image.rotate().resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
  } catch {
    throw new InvalidPhotoError("Immagine non valida: usare JPEG, PNG o WebP non animati, massimo 25 megapixel");
  }
  mime = "image/webp";

  if (opts.privato) {
    const nome = `${randomUUID()}.webp`;
    if (driver === "s3") {
      await s3client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: `privato/${tenantId}/${nome}`, Body: bytes, ContentType: mime }));
    } else {
      await mkdir(join(DIR_PRIVATO, tenantId), { recursive: true });
      await writeFile(join(DIR_PRIVATO, tenantId, nome), bytes);
    }
    // URL interno: la risoluzione richiede autenticazione, non è un link pubblico.
    return `/api/v1/uploads/privato/${tenantId}/${nome}`;
  }

  const key = `${tenantId}/${randomUUID()}.webp`;
  if (driver === "s3") {
    await s3client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: bytes, ContentType: mime }));
    const base = (process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
    return `${base}/${process.env.S3_BUCKET}/${key}`;
  }
  await mkdir(join(DIR_PUBBLICO, tenantId), { recursive: true });
  await writeFile(join(DIR_PUBBLICO, tenantId, key.split("/").pop()!), bytes);
  return `/uploads/${key}`;
}

// Normalizza un percorso privato, rimuovendo l'eventuale prefisso legacy duplicato
// "privato/". Ritorna [tenantId, ...segmentiFile] oppure null se non valido.
export function normalizzaPercorsoPrivato(segmenti: string[]): string[] | null {
  const puliti = segmenti.filter((s) => s && s !== ".");
  if (puliti[0] === "privato") puliti.shift();
  if (puliti.length < 2) return null;
  if (puliti.some((s) => s === ".." || s.includes("/") || s.includes("\\"))) return null;
  return puliti;
}

// Legge un file privato provando il deposito privato, la vecchia posizione sotto
// public/uploads/privato (compatibilità con i file già archiviati) e, se attivo, S3.
export async function leggiFilePrivato(segmenti: string[]): Promise<Buffer | null> {
  const puliti = normalizzaPercorsoPrivato(segmenti);
  if (!puliti) return null;
  const [tenant, ...resto] = puliti;
  const rel = join(tenant, ...resto);

  const nuovo = normalize(join(DIR_PRIVATO, rel));
  if (nuovo.startsWith(normalize(DIR_PRIVATO))) {
    try { return await readFile(nuovo); } catch { /* provo le altre posizioni */ }
  }
  const legacy = normalize(join(DIR_PUBBLICO, "privato", rel));
  if (legacy.startsWith(normalize(join(DIR_PUBBLICO, "privato")))) {
    try { return await readFile(legacy); } catch { /* provo S3 */ }
  }
  if (driver === "s3" && process.env.S3_BUCKET) {
    try {
      const r = await s3client().send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `privato/${rel}` }));
      const corpo = await r.Body?.transformToByteArray();
      if (corpo) return Buffer.from(corpo);
    } catch { /* non trovato */ }
  }
  return null;
}

export async function deletePhoto(url: string) {
  try {
    if (url.startsWith("/api/v1/uploads/privato/")) {
      const segmenti = url.replace("/api/v1/uploads/privato/", "").split("/");
      const puliti = normalizzaPercorsoPrivato(segmenti);
      if (puliti) {
        const rel = join(...puliti);
        const nuovo = normalize(join(DIR_PRIVATO, rel));
        if (nuovo.startsWith(normalize(DIR_PRIVATO))) await unlink(nuovo).catch(() => {});
        const legacy = normalize(join(DIR_PUBBLICO, "privato", rel));
        if (legacy.startsWith(normalize(join(DIR_PUBBLICO, "privato")))) await unlink(legacy).catch(() => {});
      }
      if (driver === "s3" && process.env.S3_BUCKET && puliti) {
        await s3client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET, Key: `privato/${join(...puliti)}` })).catch(() => {});
      }
      return;
    }
    if (url.startsWith("/uploads/")) {
      const interno = url.replace("/uploads/", "");
      const base = normalize(DIR_PUBBLICO);
      const file = normalize(join(base, interno));
      if (file.startsWith(base)) await unlink(file).catch(() => {});
      return;
    }
    if (driver === "s3" && process.env.S3_BUCKET) {
      const base = (process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
      const key = url.replace(`${base}/${process.env.S3_BUCKET}/`, "");
      if (key && key !== url) await s3client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    }
  } catch { /* best effort */ }
}
