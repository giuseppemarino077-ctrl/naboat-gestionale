import { Prisma, PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient; prismaAdmin?: PrismaClient };
export const prisma = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = prisma;

// RLS è difesa in profondità e resta SPENTA di default: senza RLS_ENABLED=true
// il comportamento è identico a prima e le query non aprono transazioni.
export const RLS_ENABLED = process.env.RLS_ENABLED === "true";

// Client per le rotte di piattaforma (superadmin, cron, backup): usano il ruolo
// dedicato naboat_admin (BYPASSRLS controllato). Se non configurato ricade sul
// client normale, così a RLS spenta non cambia nulla.
export function prismaPiattaforma(): PrismaClient {
  if (!RLS_ENABLED || !process.env.DATABASE_URL_ADMIN) return prisma;
  return (
    g.prismaAdmin ??
    (g.prismaAdmin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_ADMIN } } }))
  );
}

export type ClientTenant = PrismaClient | Prisma.TransactionClient;

// Esegue il lavoro di una singola azienda dentro una transazione con contesto
// tenant impostato con set_config(..., true): vale solo per la transazione.
// Con RLS spenta esegue la funzione sul client normale.
export async function conTenant<T>(tenantId: string, fn: (db: ClientTenant) => Promise<T>): Promise<T> {
  if (!RLS_ENABLED) return fn(prisma);
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
}
