import crypto from "crypto";

export function saltHex(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("hex");
}
