// Verifica la copertura RLS: elenca le tabelle con tenantId e controlla che abbiano
// RLS attiva e una policy di isolamento che usi app.tenant_id.
//
// Uso:
//   node scripts/verifica-rls.mjs            # report; esce 1 solo se una RLS attiva ha buchi
//   node scripts/verifica-rls.mjs --strict   # esce 1 al primo buco (anche a RLS spenta)
//
// In locale la RLS è volutamente spenta: il report lo segnala e l'uscita resta 0.
// Va eseguito DOVE è disponibile DATABASE_URL (host con .env oppure servizio tools).
import { PrismaClient } from "@prisma/client";

const strict = process.argv.includes("--strict");
const prisma = new PrismaClient();

const righe = await prisma.$queryRawUnsafe(`
  SELECT c.relname AS tabella,
         c.relrowsecurity AS rls_attiva,
         (SELECT count(*) FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy,
         (SELECT count(*) FROM pg_policies p
            WHERE p.schemaname = 'public' AND p.tablename = c.relname
              AND p.qual LIKE '%app.tenant_id%') AS policy_tenant
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = c.relname
        AND col.column_name = 'tenantId'
    )
  ORDER BY c.relname
`);

const ruolo = await prisma.$queryRawUnsafe(`
  SELECT current_user AS ruolo, rolsuper AS superuser, rolbypassrls AS bypass
  FROM pg_roles WHERE rolname = current_user
`);

const conTenant = righe.filter((r) => Number(r.policy_tenant) > 0);
const conRls = righe.filter((r) => r.rls_attiva);
const senzaPolicy = righe.filter((r) => !r.rls_attiva || Number(r.policy_tenant) === 0);
const rlsAttiva = conRls.length > 0;

console.log(`Ruolo collegato: ${ruolo[0]?.ruolo} (superuser=${ruolo[0]?.superuser}, bypassrls=${ruolo[0]?.bypass})`);
console.log(`Tabelle con tenantId: ${righe.length}`);
console.log(`  con RLS attiva:        ${conRls.length}`);
console.log(`  con policy tenant:     ${conTenant.length}`);
console.log(`  senza copertura RLS:   ${senzaPolicy.length}`);
console.log("");

for (const r of righe) {
  const stato = Number(r.policy_tenant) > 0 ? "ok" : r.rls_attiva ? "NO POLICY" : "RLS OFF";
  console.log(`  ${stato.padEnd(9)} ${r.tabella} (policy totali: ${r.policy})`);
}

console.log("");
if (!righe.length) {
  console.error("ERRORE: nessuna tabella con tenantId trovata: schema o database inatteso.");
  await prisma.$disconnect();
  process.exit(2);
}

if (!rlsAttiva) {
  console.log("RLS non attiva su questo database. In locale è atteso.");
  console.log("Per attivarla (su copia, con backup verificato) vedi DEPLOY.md §8.");
  if (strict) {
    console.error(`STRICT: ${senzaPolicy.length} tabelle con tenantId senza copertura RLS.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  await prisma.$disconnect();
  process.exit(0);
}

if (senzaPolicy.length) {
  console.error(`ERRORE: ${senzaPolicy.length} tabelle con tenantId senza copertura RLS:`);
  for (const r of senzaPolicy) console.error(`  - ${r.tabella}`);
  await prisma.$disconnect();
  process.exit(1);
}

console.log("Copertura RLS completa: ogni tabella con tenantId ha policy attiva.");
await prisma.$disconnect();
