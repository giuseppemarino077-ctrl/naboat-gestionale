import type { Prisma } from "@prisma/client";
import { chiaveDedupContatti, normalizzaNome } from "@/lib/anagrafica";
import { prisma } from "@/lib/db";

type Db = Prisma.TransactionClient | typeof prisma;

export type ClienteRisolto = {
  customerId: string;
  nome: string;
  telefono: string | null;
  email: string | null;
  riconosciuto: boolean;
};

const CAMPI = { id: true, nome: true, telefono: true, email: true } as const;

// Risolve l'anagrafica di una prenotazione: riconosce il cliente già salvato per
// telefono, email o nome e allinea i dati della prenotazione a quelli registrati.
// - se il nome è corretto ma il telefono è sbagliato/mancante, prevale quello salvato;
// - se il telefono è corretto ma il nome è sbagliato/mancante, prevale quello salvato;
// - i campi vuoti nell'anagrafica si completano con quelli forniti (mai sovrascritti).
// Non crea mai un doppione: riusa sempre il cliente riconosciuto.
export async function risolviCliente(
  db: Db,
  tenantId: string,
  input: { nome: string; telefono: string | null; email: string | null }
): Promise<ClienteRisolto> {
  const nome = input.nome.trim();
  const tel = input.telefono;
  const mail = input.email;

  const perTelefono = tel
    ? await db.customer.findFirst({ where: { tenantId, OR: [{ dedupKey: tel }, { telefono: tel }] }, select: CAMPI })
    : null;
  const perEmail = mail
    ? await db.customer.findFirst({ where: { tenantId, email: mail }, select: CAMPI })
    : null;

  // Il telefono è l'identificatore più forte; l'email si usa solo se il telefono
  // non riconosce nessuno. Il nome è il ripiego, su corrispondenza esatta.
  let trovato = perTelefono ?? perEmail ?? null;
  if (!trovato && normalizzaNome(nome).length >= 2) {
    const candidati = await db.customer.findMany({
      where: { tenantId, nome: { equals: nome, mode: "insensitive" } },
      select: CAMPI,
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    trovato = candidati.find((c) => c.telefono) ?? candidati[0] ?? null;
  }

  if (!trovato) {
    const dedupKey = chiaveDedupContatti(tel, mail, nome);
    const creato = await db.customer.upsert({
      where: { tenantId_dedupKey: { tenantId, dedupKey } },
      update: {},
      create: { tenantId, nome, telefono: tel, email: mail, dedupKey },
      select: CAMPI,
    });
    return { customerId: creato.id, nome: creato.nome, telefono: creato.telefono, email: creato.email, riconosciuto: false };
  }

  const dati: Prisma.CustomerUpdateInput = {};
  if (!trovato.telefono && tel) dati.telefono = tel;
  if (!trovato.email && mail) dati.email = mail;
  if (Object.keys(dati).length) await db.customer.update({ where: { id: trovato.id }, data: dati });

  return {
    customerId: trovato.id,
    nome: trovato.nome,
    telefono: trovato.telefono ?? tel,
    email: trovato.email ?? mail,
    riconosciuto: true,
  };
}
