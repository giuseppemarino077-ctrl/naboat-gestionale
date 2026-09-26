#!/usr/bin/env bash
# Backup COMPLETO del portale in un solo file: database + foto/allegati + configurazione.
# Va eseguito SUL VPS (sull'host, non dentro i container).
#
# Uso da cron (ogni notte alle 3):
#   0 3 * * * cd /opt/naboat && ./scripts/backup-completo.sh >> ./backups/backup.log 2>&1
#
# Con questo archivio si ricostruisce tutto su un server nuovo:
#   ./scripts/ripristino-completo.sh backups/completi/naboat-completo-2026-09-18_0300.tar.gz
#
# Contiene: dump completo del database, cartella uploads (foto barche, loghi,
# foto di check-in/check-out), file di configurazione (.env, docker-compose, Caddyfile).
# ATTENZIONE: l'archivio contiene segreti (.env) e foto dei clienti: va conservato
# in un posto protetto (permessi 600, destinazioni private, mai in una cartella pubblica).

set -euo pipefail

CARTELLA="${BACKUP_DIR:-./backups/completi}"
GIORNI="${BACKUP_KEEP_DAYS:-14}"

umask 077
mkdir -p "$CARTELLA"

# Variabili del database lette dal .env (senza caricare il file: contiene spazi e caratteri speciali)
leggi_env() {
  [ -f .env ] || { echo ""; return; }
  grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" || true
}
DB_USER="${POSTGRES_USER:-$(leggi_env POSTGRES_USER)}"
DB_NAME="${POSTGRES_DB:-$(leggi_env POSTGRES_DB)}"
DB_USER="${DB_USER:-naboat}"
DB_NAME="${DB_NAME:-naboat}"

DATA=$(date +%Y-%m-%d_%H%M)
LAVORO=$(mktemp -d)
trap 'rm -rf "$LAVORO"' EXIT

echo "[$(date '+%F %T')] Avvio backup completo del portale"

# 1) Database completo (struttura + dati + migrazioni)
echo "  1/3 database…"
docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" > "$LAVORO/database.sql"
if [ ! -s "$LAVORO/database.sql" ]; then
  echo "ERRORE: il dump del database è vuoto. Backup annullato."
  exit 1
fi
RIGHE=$(wc -l < "$LAVORO/database.sql")
echo "     dump: $RIGHE righe"

# 2) Foto e allegati + configurazione
echo "  2/3 foto e configurazione…"
mkdir -p "$LAVORO/portale"
# In produzione le foto stanno in ./uploads (volume del container); in locale in ./public/uploads.
CARTELLA_FOTO=""
if [ -d ./uploads ]; then CARTELLA_FOTO="./uploads"; elif [ -d ./public/uploads ]; then CARTELLA_FOTO="./public/uploads"; fi
if [ -n "$CARTELLA_FOTO" ]; then
  cp -r "$CARTELLA_FOTO" "$LAVORO/portale/uploads"
  FOTO=$(find "$LAVORO/portale/uploads" -type f | wc -l)
  echo "     foto: $FOTO file (da $CARTELLA_FOTO)"
else
  echo "     (nessuna cartella uploads: nessuna foto da salvare)"
fi
for f in .env docker-compose.yml docker-compose.override.yml Caddyfile Dockerfile; do
  [ -f "$f" ] && cp "$f" "$LAVORO/portale/"
done

# 3) Archivio unico compresso
echo "  3/3 archivio…"
FILE="$CARTELLA/naboat-completo-$DATA.tar.gz"
tar -czf "$FILE" -C "$LAVORO" .
chmod 600 "$FILE"

# Retention locale
find "$CARTELLA" -name 'naboat-completo-*.tar.gz' -type f -mtime "+$GIORNI" -delete
CONSERVATI=$(find "$CARTELLA" -name 'naboat-completo-*.tar.gz' -type f | wc -l)
DIM=$(du -h "$FILE" | cut -f1)

echo "[$(date '+%F %T')] Fatto: $FILE ($DIM) — copie conservate: $CONSERVATI (retention ${GIORNI} giorni)"
echo "   Prossimi passi consigliati: copia offsite (Object Storage) e copia FTP sull'hosting."
