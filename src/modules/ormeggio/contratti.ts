// --- Ormeggio ---------------------------------------------------------------

export type SnapshotOrmeggio = {
  schema: "ormeggio/v1";
  generatoAt: string;
  azienda: { nome: string; logo: string | null; telefono: string | null; indirizzo: string | null };
  tipo: string;
  proprietario: { nome: string; telefono: string | null; email: string | null };
  barca: { nome: string; tipo: string | null; modello?: string | null };
  posto: string;
  area: string | null;
  inizioAt: string;
  finePrevistaAt: string | null;
  corrispettivoCent: number | null;
  servizi: { tipo: string; quantita: number | null; unita: string | null; prezzoCent: number | null }[];
};

export function snapshotOrmeggio(
  dati: {
    azienda: { nome: string; logo: string | null; telefono: string | null; indirizzo: string | null };
    tipo: string;
    proprietario: { nome: string; telefono: string | null; email: string | null };
    barca: { nome: string; tipo: string | null; modello?: string | null };
    posto: string;
    area: string | null;
    inizioAt: Date;
    finePrevistaAt: Date | null;
    corrispettivoCent: number | null;
    servizi: { tipo: string; quantita: number | null; unita: string | null; prezzoCent: number | null }[];
  },
  adesso: Date = new Date()
): SnapshotOrmeggio {
  return {
    schema: "ormeggio/v1",
    generatoAt: adesso.toISOString(),
    azienda: dati.azienda,
    tipo: dati.tipo,
    proprietario: dati.proprietario,
    barca: dati.barca,
    posto: dati.posto,
    area: dati.area,
    inizioAt: dati.inizioAt.toISOString(),
    finePrevistaAt: dati.finePrevistaAt ? dati.finePrevistaAt.toISOString() : null,
    corrispettivoCent: dati.corrispettivoCent,
    servizi: dati.servizi,
  };
}
