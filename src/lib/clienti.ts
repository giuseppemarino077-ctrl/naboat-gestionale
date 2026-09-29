import { fail } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getClienteSession } from "@/lib/session";

// Guardia per l'area del cliente finale: la sessione ha ruolo "cliente" e sub = id account.
// Legge SOLO il cookie del cliente (nb_cliente): la sessione operatore (nb_session) non è
// accettata, e viceversa.
export async function requireCliente() {
  const s = await getClienteSession();
  if (!s || s.role !== "cliente") return { error: fail("Non autenticato", 401) as never };
  const account = await prisma.clienteAccount.findUnique({
    where: { id: s.sub },
    select: { id: true, email: true, nome: true, telefono: true, sessionVersion: true, emailVerified: true },
  });
  if (!account) return { error: fail("Sessione non più valida: accedi di nuovo", 401) as never };
  if ((s.ver ?? 0) !== account.sessionVersion) return { error: fail("Sessione scaduta: accedi di nuovo", 401) as never };
  return { account };
}

// Stato della patente rilevante per il requisito operativo.
export type PatenteStato = { stato: string; scadenzaAt: Date | null } | null | undefined;

// Una patente è una verifica valida solo se NaBoat l'ha approvata e il documento non è
// scaduto. Una patente in verifica, rifiutata o scaduta NON soddisfa il requisito.
export function patenteValida(p: PatenteStato, adesso: Date = new Date()): boolean {
  if (!p || p.stato !== "approvata") return false;
  return !p.scadenzaAt || p.scadenzaAt.getTime() >= adesso.getTime();
}

export function motivoPatente(p: PatenteStato): string {
  if (!p) return "patente non caricata";
  if (p.stato === "rifiutata") return "patente rifiutata";
  if (p.stato === "in_verifica") return "patente in verifica";
  return "patente scaduta";
}

// Requisito patente di una prenotazione, applicato allo stato finale.
// Cliente registrato (account collegato): conta SOLO la patente verificata dallo staff
// NaBoat e non scaduta; l'attestazione manuale patenteOk NON sostituisce la verifica.
// Cliente occasionale (senza account): vale l'attestazione manuale patenteOk.
export function esitoPatente(
  boat: { patenteRichiesta: boolean },
  dati: { patenteOk: boolean; skipperId?: string | null; clienteAccountId?: string | null; patente: PatenteStato },
  adesso: Date = new Date()
): string | null {
  if (!boat.patenteRichiesta || dati.skipperId) return null;
  if (dati.clienteAccountId) {
    if (patenteValida(dati.patente, adesso)) return null;
    return `Patente del cliente non valida (${motivoPatente(dati.patente)}): serve una verifica approvata e non scaduta, l'attestazione manuale non basta`;
  }
  return dati.patenteOk ? null : "Patente richiesta: indicare patente oppure skipper";
}
