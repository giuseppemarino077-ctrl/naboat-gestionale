import { headers } from "next/headers";
import { appBase, hostSito } from "@/lib/sito";

// Contesto delle pagine del sito pubblico: indirizzo del portale e dominio di provenienza.
export async function contestoSito() {
  const h = await headers();
  const host = h.get("host") ?? "";
  return { host, sulSito: hostSito(host), appBase: appBase(host) };
}
