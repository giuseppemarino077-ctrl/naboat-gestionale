import { PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { mkdir, writeFile, unlink } from "fs/promises";
import { join } from "path";
import { randomUUID } from "crypto";
import sharp from "sharp";

export class InvalidPhotoError extends Error {}

export const MAX_BYTES = 5 * 1024 * 1024;
export const MIME_OK = ["image/jpeg", "image/png", "image/webp"];

const driver = process.env.STORAGE_DRIVER ?? "local";

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

export async function savePhoto(tenantId: string, bytes: Buffer, mime: string): Promise<string> {
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
  const key = `${tenantId}/${randomUUID()}.webp`;
  if (driver === "s3") {
    await s3client().send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key, Body: bytes, ContentType: mime }));
    const base = (process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
    return `${base}/${process.env.S3_BUCKET}/${key}`;
  }
  const dir = join(process.cwd(), "public", "uploads", tenantId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key.split("/")[1]), bytes);
  return `/uploads/${key}`;
}

export async function deletePhoto(url: string) {
  try {
    if (url.startsWith("/uploads/")) {
      await unlink(join(process.cwd(), "public", url));
    } else if (driver === "s3" && process.env.S3_BUCKET) {
      const base = (process.env.S3_PUBLIC_BASE_URL ?? process.env.S3_ENDPOINT ?? "").replace(/\/$/, "");
      const key = url.replace(`${base}/${process.env.S3_BUCKET}/`, "");
      if (key && key !== url) await s3client().send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: key }));
    }
  } catch { /* best effort */ }
}
