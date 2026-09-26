import crypto from "crypto";

// TOTP (RFC 6238) implementato con crypto di Node: nessuna dipendenza esterna.
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  return base32Encode(buf);
}

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const c of clean) {
    const idx = ALPHABET.indexOf(c);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export function totp(secretBase32: string, when = Date.now(), step = 30): string {
  return hotp(base32Decode(secretBase32), Math.floor(when / 1000 / step));
}

// Verifica con tolleranza di +/- `window` finestre (default +/-1 = 30s).
export function verifyTotp(secretBase32: string, token: string, window = 1): boolean {
  const t = token.replace(/\D/g, "");
  if (t.length !== 6) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    if (crypto.timingSafeEqual(Buffer.from(totp(secretBase32, now + i * 30000)), Buffer.from(t))) return true;
  }
  return false;
}

export function otpauthUri(secretBase32: string, account: string, issuer = "NaBoat") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
