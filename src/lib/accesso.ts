// Destinazione dopo l'accesso, decisa in un solo posto.
// Non importa il database: la usano sia il client (login) sia eventuali pagine server.

export type DatiAccesso = {
  role: string;
  tenantStatus?: string | null;
  tenantModulo?: string | null;
  tenantOrmeggio?: boolean;
};

// Percorsi consentiti a un'azienda NON ancora attiva: stato, sicurezza, rinnovo
// dell'abbonamento e verifica email. Tutto il resto riporta alla pagina di attesa.
export const PERCORSI_ATTESA = [
  "/gestionale/stato",
  "/gestionale/impostazioni/sicurezza",
  "/gestionale/impostazioni/piano",
  "/gestionale/verifica-email",
];

export function aziendaNonAttiva(status?: string | null): boolean {
  return !!status && status !== "active";
}

export function percorsoConsentitoInAttesa(pathname: string): boolean {
  return PERCORSI_ATTESA.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function destinazioneAccesso(u: DatiAccesso): string {
  if (u.role === "superadmin") return "/admin";
  if (u.role === "cliente") return "/area";
  if (aziendaNonAttiva(u.tenantStatus)) return "/gestionale/stato";
  if (u.tenantOrmeggio && u.tenantModulo !== "entrambi") return "/gestionale/ormeggio";
  return "/gestionale/oggi";
}
