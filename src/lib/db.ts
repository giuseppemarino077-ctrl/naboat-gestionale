import { AsyncLocalStorage } from "node:async_hooks";
import { Prisma, PrismaClient } from "@prisma/client";

const g = globalThis as unknown as { prisma?: PrismaClient; prismaAdmin?: PrismaClient };
const principale = g.prisma ?? new PrismaClient();
if (process.env.NODE_ENV !== "production") g.prisma = principale;
const transazioni = new AsyncLocalStorage<Prisma.TransactionClient>();
export const prisma = new Proxy(principale, {
  get(target, property) {
    const tx = transazioni.getStore();
    if (tx && property === "$transaction") return (work: ((client: Prisma.TransactionClient) => unknown) | Promise<unknown>[]) => typeof work === "function" ? work(tx) : Promise.all(work);
    const source = tx && property in tx ? tx : target;
    const value = Reflect.get(source, property);
    return typeof value === "function" ? value.bind(source) : value;
  },
});
export function transazioneCondivisa<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const existing = transazioni.getStore();
  if (existing) return fn(existing);
  return principale.$transaction((tx) => transazioni.run(tx, () => fn(tx)), { timeout: 15000 });
}

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
