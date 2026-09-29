import { ok } from "@/lib/api";
import { clearClienteSession } from "@/lib/session";

export async function POST() {
  // Spegne solo il cookie del cliente: la sessione operatore resta attiva.
  await clearClienteSession();
  return ok({ ok: true });
}
