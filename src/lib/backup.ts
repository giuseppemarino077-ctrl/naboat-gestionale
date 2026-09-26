import { prisma } from "@/lib/db";

// Copie di sicurezza: impostazioni scelte da NaBoat dal pannello.
// Lo script sul server (scripts/backup-orchestrator.sh) chiede qui il "piano" da eseguire,
// così gli interruttori del pannello comandano davvero i backup senza toccare il crontab.

export type ImpostazioniBackup = {
  attivo: boolean;
  ogniOre: number;
  retentionCopie: number;
  includiFoto: boolean;
  destinazioneLocale: boolean;
  destinazioneObjectStorage: boolean;
  destinazioneFtp: boolean;
  soloDatabase: boolean;
  macchinaDelTempo: boolean;
  replicaAttiva: boolean;
  replicaHost: string | null;
  registroCompleto: boolean;
  avvisoEmail: string | null;
};

export async function impostazioni(): Promise<ImpostazioniBackup> {
  return prisma.backupSettings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
    select: {
      attivo: true,
      ogniOre: true,
      retentionCopie: true,
      includiFoto: true,
      destinazioneLocale: true,
      destinazioneObjectStorage: true,
      destinazioneFtp: true,
      soloDatabase: true,
      macchinaDelTempo: true,
      replicaAttiva: true,
      replicaHost: true,
      registroCompleto: true,
      avvisoEmail: true,
    },
  });
}

export type Piano = {
  esegui: boolean;
  motivo?: string;
  ogniOre: number;
  retentionCopie: number;
  includiFoto: boolean;
  soloDatabase: boolean;
  destinazioni: string[];
  macchinaDelTempo: boolean;
  replicaAttiva: boolean;
  replicaHost: string | null;
};

// Il piano dice allo script cosa fare in questa esecuzione.
export async function piano(): Promise<Piano> {
  const s = await impostazioni();

  if (!s.attivo) {
    return {
      esegui: false,
      motivo: "Backup disattivati dal pannello NaBoat",
      ogniOre: s.ogniOre,
      retentionCopie: s.retentionCopie,
      includiFoto: s.includiFoto,
      soloDatabase: s.soloDatabase,
      destinazioni: [],
      macchinaDelTempo: s.macchinaDelTempo,
      replicaAttiva: s.replicaAttiva,
      replicaHost: s.replicaHost,
    };
  }

  const destinazioni: string[] = [];
  if (s.destinazioneLocale) destinazioni.push("locale");
  if (s.destinazioneObjectStorage) destinazioni.push("s3");
  if (s.destinazioneFtp) destinazioni.push("ftp");

  // Con il solo dump del database non serve ricostruire l'archivio completo.
  return {
    esegui: true,
    ogniOre: s.ogniOre,
    retentionCopie: s.retentionCopie,
    includiFoto: s.includiFoto && !s.soloDatabase,
    soloDatabase: s.soloDatabase,
    destinazioni,
    macchinaDelTempo: s.macchinaDelTempo,
    replicaAttiva: s.replicaAttiva,
    replicaHost: s.replicaHost,
  };
}

// Stato riassuntivo mostrato nel pannello.
export async function stato() {
  const s = await impostazioni();
  const esecuzioni = await prisma.backupRun.findMany({ orderBy: { iniziatoAt: "desc" }, take: 20 });

  const ultima = esecuzioni[0] ?? null;
  const oreDaUltima = ultima ? (Date.now() - ultima.iniziatoAt.getTime()) / 3600000 : null;
  const oreMassime = Math.max(s.ogniOre * 2, 6);
  const regolare = !!ultima && ultima.esito === "ok" && oreDaUltima !== null && oreDaUltima <= oreMassime;

  const settimana = await prisma.backupRun.count({ where: { esito: "ok", iniziatoAt: { gte: new Date(Date.now() - 7 * 86400000) } } });
  const errori = await prisma.backupRun.count({ where: { esito: "errore", iniziatoAt: { gte: new Date(Date.now() - 7 * 86400000) } } });

  return {
    impostazioni: s,
    ultima,
    esecuzioni,
    oreDaUltima: oreDaUltima === null ? null : Math.round(oreDaUltima * 10) / 10,
    regolare,
    ultimi7giorni: { riusciti: settimana, errori },
  };
}

// Frequenza in formato cron (ora/minuto) per lo script del server.
export function cronOrario(ogniOre: number): string {
  const ore = [1, 2, 3, 4, 6, 8, 12, 24].includes(ogniOre) ? ogniOre : 24;
  if (ore === 24) return "0 3 * * *";
  return `0 */${ore} * * *`;
}

// Righe di crontab pronte da installare sul server, in base a ciò che è attivo.
export function crontab(): string[] {
  return [
    `# NaBoat — una sola riga: esegue ciò che è attivo nel pannello /admin/backup`,
    `${cronOrario(0)} cd /opt/naboat && ./scripts/backup-orchestrator.sh >> ./backups/backup.log 2>&1`,
    `# Controllo giornaliero: avvisa se il backup non è regolare`,
    `0 8 * * * cd /opt/naboat && docker compose run --rm -T tools node scripts/backup-verifica.mjs /app/backups >> ./backups/backup.log 2>&1`,
  ];
}

// Firma di ogni riga di crontab: nella pagina si copia quella giusta.
export function istruzioniMacchinaDelTempo(): string[] {
  return [
    "Sul VPS, nel file docker-compose.yml del database, aggiungere:",
    '  command: ["postgres", "-c", "wal_level=replica", "-c", "archive_mode=on", "-c", "archive_command=test ! -f /wal-archive/%f && cp %p /wal-archive/%f"]',
    "e montare una cartella dedicata: - ./wal-archive:/wal-archive",
    "Poi sincronizzare ./wal-archive su Aruba Object Storage (stessa riga di cron del backup) per avere il ritorno a qualsiasi secondo anche fuori dal server.",
  ];
}
