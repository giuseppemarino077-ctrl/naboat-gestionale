import { fail, ok } from "@/lib/api";
import { prisma } from "@/lib/db";
import { requireSuperadmin } from "@/lib/guard";
import { statoPosta } from "@/lib/mailer";
import { consegnaNotifiche } from "@/lib/notifiche";
import { z } from "zod";

const STATI = ["da_inviare", "inviata", "errore"] as const;

// Registro delle notifiche (outbox) riservato a NaBoat: esito, tentativi e ultimo
// errore. Non si restituiscono mai il corpo o i link riservati in chiaro.
export async function GET(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;

  const url = new URL(req.url);
  const statoParam = url.searchParams.get("stato");
  const evento = url.searchParams.get("evento")?.trim() || null;
  const tenantId = url.searchParams.get("tenantId")?.trim() || null;
  const limite = Math.min(Math.max(Number(url.searchParams.get("limite") ?? 100) || 100, 1), 200);
  const offset = Math.max(Number(url.searchParams.get("offset") ?? 0) || 0, 0);

  const stato = STATI.includes(statoParam as (typeof STATI)[number]) ? (statoParam as (typeof STATI)[number]) : null;

  const where = {
    ...(stato ? { stato } : {}),
    ...(evento ? { evento } : {}),
    ...(tenantId ? { tenantId } : {}),
  };

  const [items, gruppi, totale] = await Promise.all([
    prisma.notifica.findMany({
      where,
      orderBy: { creatoAt: "desc" },
      take: limite,
      skip: offset,
      select: {
        id: true,
        tenantId: true,
        evento: true,
        destinatario: true,
        oggetto: true,
        stato: true,
        tentativi: true,
        errore: true,
        creatoAt: true,
        inviataAt: true,
        ultimoTentativoAt: true,
      },
    }),
    prisma.notifica.groupBy({ by: ["stato"], _count: { _all: true } }),
    prisma.notifica.count({ where }),
  ]);

  const conteggi = { da_inviare: 0, inviata: 0, errore: 0 } as Record<string, number>;
  for (const riga of gruppi) conteggi[riga.stato] = riga._count._all;

  return ok({ items, totale, conteggi, posta: statoPosta() });
}

const PostSchema = z.object({ azione: z.literal("consegna"), limite: z.number().int().min(1).max(200).optional() });

// Nuovo tentativo di consegna per la coda (o un sottoinsieme) dei messaggi in attesa.
export async function POST(req: Request) {
  const g = await requireSuperadmin();
  if ("error" in g) return g.error;
  const p = PostSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return fail("Richiesta non valida", 422);
  const esito = await consegnaNotifiche({ limite: p.data.limite ?? 100 });
  return ok(esito);
}
