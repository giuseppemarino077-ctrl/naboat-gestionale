#!/usr/bin/env bash
# Orchestratore dei backup: UNA sola riga di crontab sul server.
# Chiede al portale cosa è attivo nel pannello /admin/backup ed esegue solo quello.
#
# Installazione (sul VPS, dalla cartella /opt/naboat):
#   crontab -e
#   0 3 * * * cd /opt/naboat && ./scripts/backup-orchestrator.sh >> ./backups/backup.log 2>&1
#
# Serve CRON_SECRET nel file .env (già usato anche per i promemoria).

set -euo pipefail

# Indirizzo del portale: si legge da APP_URL nel .env (l'app non è esposta su localhost,
# la porta 80 risponde solo per il dominio pubblico).
BASE="${APP_BASE:-$(grep -E '^APP_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)}"
BASE="${BASE:-https://app.naboat.it}"
SECRET=$(grep -E '^CRON_SECRET=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true)
CARTELLA="${BACKUP_DIR:-./backups/completi}"
GIORNI="${BACKUP_KEEP_DAYS:-14}"

if [ -z "$SECRET" ]; then
  echo "[$(date '+%F %T')] ERRORE: CRON_SECRET non impostato nel .env"
  exit 1
fi

echo "[$(date '+%F %T')] Chiedo al portale il piano di backup…"
PIANO=$(curl -fsS "$BASE/api/v1/backup/piano" -H "x-cron-secret: $SECRET") || {
  echo "ERRORE: il portale non risponde: backup non eseguito."
  exit 1
}

leggi() { echo "$PIANO" | grep -o "\"$1\":[^,}]*" | head -1 | cut -d: -f2- | tr -d '"' ; }

ESEGUI=$(leggi esegui)
ESECUZIONE=$(leggi esecuzioneId)
OGNI=$(leggi ogniOre)
RETENTION=$(leggi retentionCopie)
FOTO=$(leggi includiFoto)
SOLODB=$(leggi soloDatabase)
DEST=$(leggi destinazioni)
TEMPO=$(leggi macchinaDelTempo)

if [ "$ESEGUI" != "true" ]; then
  MOTIVO=$(leggi motivo)
  echo "Backup saltato: ${MOTIVO:-disattivati dal pannello}"
  curl -fsS -X POST "$BASE/api/v1/backup/esito" -H "x-cron-secret: $SECRET" -H "Content-Type: application/json" \
    -d "{\"esecuzioneId\":\"$ESECUZIONE\",\"esito\":\"saltato\",\"messaggio\":\"Disattivati dal pannello\"}" >/dev/null || true
  exit 0
fi

# Attesa della frequenza scelta: se l'ultimo backup è più recente di "ogniOre", salta.
# Gli script Node girano nel container "tools": sul VPS Node non è installato sull'host.
TOOLS="docker compose run --rm -T tools"
ULTIMO=$($TOOLS node scripts/backup-verifica.mjs /app/backups 999999 2>/dev/null | grep -o '[0-9.]* giorni fa' | grep -o '^[0-9.]*' || true)
if [ -n "${ULTIMO:-}" ] && [ "$OGNI" -gt 0 ]; then
  ORE=$(awk "BEGIN {print $ULTIMO*24}")
  SALTA=$(awk "BEGIN {print ($ORE < $OGNI) ? 1 : 0}")
  if [ "$SALTA" = "1" ]; then
    echo "Ultimo backup recente (${ORE} ore fa, frequenza ${OGNI}h): salto questa esecuzione."
    curl -fsS -X POST "$BASE/api/v1/backup/esito" -H "x-cron-secret: $SECRET" -H "Content-Type: application/json" \
      -d "{\"esecuzioneId\":\"$ESECUZIONE\",\"esito\":\"saltato\",\"messaggio\":\"Backup recente\"}" >/dev/null || true
    exit 0
  fi
fi

ESITO="ok"
MESSAGGIO=""
FILE=""

if [ "$SOLODB" = "true" ]; then
  echo "Modalità solo database."
  mkdir -p "$CARTELLA"
  FILE="$CARTELLA/naboat-db-$(date +%Y-%m-%d_%H%M).sql.gz"
  docker compose exec -T db pg_dump -U "${POSTGRES_USER:-naboat}" -d "${POSTGRES_DB:-naboat}" | gzip > "$FILE" || ESITO="errore"
else
  echo "Archivio completo (database + foto + configurazione)…"
  ./scripts/backup-completo.sh || ESITO="errore"
  FILE=$(ls -t "$CARTELLA"/naboat-completo-*.tar.gz 2>/dev/null | head -1 || true)
fi

if [ "$ESITO" = "ok" ]; then
  # Retention
  find "$CARTELLA" -type f \( -name 'naboat-*.tar.gz' -o -name 'naboat-*.sql.gz' \) -mtime "+$GIORNI" -delete 2>/dev/null || true

  # Copie esterne, solo quelle attive nel pannello
  case ",$DEST," in
    *,s3,*) echo "Copia su Object Storage…"; $TOOLS node scripts/offsite-backup.mjs /app/backups || { ESITO="errore"; MESSAGGIO="Copia Object Storage non riuscita"; } ;;
  esac
  case ",$DEST," in
    *,ftp,*) echo "Copia FTP sull'hosting…"; $TOOLS node scripts/backup-ftp.mjs /app/backups || { ESITO="errore"; MESSAGGIO="Copia FTP non riuscita"; } ;;
  esac

  # Macchina del tempo: sincronizza l'archivio continuo del database, se attiva
  if [ "$TEMPO" = "true" ] && [ -d ./wal-archive ]; then
    echo "Sincronizzazione archivio continuo del database…"
    tar -czf "$CARTELLA/wal-$(date +%Y-%m-%d_%H%M).tar.gz" -C ./wal-archive . 2>/dev/null || true
  fi
fi

# Retention anche sulle cartelle di lavoro
find "$CARTELLA" -type f -mtime "+$GIORNI" -delete 2>/dev/null || true

DIM=0
[ -n "$FILE" ] && [ -f "$FILE" ] && DIM=$(wc -c < "$FILE" | tr -d ' ')

echo "[$(date '+%F %T')] Esito: $ESITO (${DIM} byte) — destinazioni: ${DEST:-locale}"
curl -fsS -X POST "$BASE/api/v1/backup/esito" -H "x-cron-secret: $SECRET" -H "Content-Type: application/json" \
  -d "{\"esecuzioneId\":\"$ESECUZIONE\",\"esito\":\"$ESITO\",\"dimensioneByte\":$DIM,\"file\":\"$(basename "${FILE:-}")\",\"messaggio\":\"${MESSAGGIO:-completato}\"}" >/dev/null || echo "ATTENZIONE: esito non registrato nel portale."

if [ "$ESITO" != "ok" ]; then exit 1; fi
