import crypto from "crypto";

export function saltHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}

// Cifratura simmetrica AES-256-GCM con chiave derivata da AUTH_SECRET.
// Usata per i dati sensibili (es. numero della patente nautica).
function chiave(): Buffer {
  return crypto.createHash("sha256").update(process.env.AUTH_SECRET ?? "").digest();
}

export function cifra(testo: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", chiave(), iv);
  const enc = Buffer.concat([c.update(testo, "utf8"), c.final()]);
  return `${iv.toString("hex")}:${c.getAuthTag().toString("hex")}:${enc.toString("hex")}`;
}

export function decifra(payload: string): string | null {
  try {
    const [iv, tag, enc] = payload.split(":");
    const d = crypto.createDecipheriv("aes-256-gcm", chiave(), Buffer.from(iv, "hex"));
    d.setAuthTag(Buffer.from(tag, "hex"));
    return Buffer.concat([d.update(Buffer.from(enc, "hex")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
