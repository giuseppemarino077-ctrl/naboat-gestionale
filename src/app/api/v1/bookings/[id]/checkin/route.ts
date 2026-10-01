import { fail, ok } from "@/lib/api";
import { registraCheckin } from "@/lib/presenze";
import { requireTenant } from "@/lib/tenant";
import { z } from "zod";

const Schema = z.object({
  note: z.string().max(2000).optional().nullable(),
});

// Check-in alla partenza («barca partita»): presenza e stato avanzano insieme.
// L'evento di storico è scritto una sola volta dall'helper.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const t = await requireTenant(req);
  if ("error" in t) return t.error;
  const { id } = await ctx.params;

  const p = Schema.safeParse(await req.json().catch(() => ({})));
  if (!p.success) return fail("Dati non validi", 422);

  const r = await registraCheckin(t.tenantId, t.userId, id, p.data);
  if (!r.ok) return fail(r.errore, r.stato);
  return ok(r.booking);
}
