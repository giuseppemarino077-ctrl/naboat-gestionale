import { ok } from "@/lib/api";
import { pagamentiPerBarca } from "@/lib/payments";
import { requireAzienda } from "@/lib/tenant";
import { prisma } from "@/lib/db";

// Esito effettivo dei pagamenti online per una barca (o per l'azienda senza boatId).
// Unica fonte usata da dettaglio prenotazione, form e liste.
export async function GET(req: Request) {
  const t = await requireAzienda(req);
  if ("error" in t) return t.error;
  const boatId = new URL(req.url).searchParams.get("boatId");
  const abil = await pagamentiPerBarca(t.tenantId, boatId);
  const azienda = await prisma.tenant.findUnique({
    where: { id: t.tenantId },
    select: { pagamentiAttivi: true, pagamentiBloccatiNaBoat: true, stripeAttivo: true, stripeSecretEnc: true, status: true },
  });
  return ok({
    ...abil,
    azienda: {
      pagamentiAttivi: azienda?.pagamentiAttivi ?? false,
      bloccatiNaBoat: azienda?.pagamentiBloccatiNaBoat ?? false,
      providerConfigurato: !!azienda?.stripeAttivo && !!azienda?.stripeSecretEnc,
      status: azienda?.status ?? "pending",
    },
  });
}
