#!/usr/bin/env bash
# Prova di ripristino ISOLATA: dimostra che un archivio di backup si ripristina
# davvero, senza toccare il database né le foto in uso.
#
# Cosa fa:
#   1) prende l'ultimo archivio completo (o un dump .sql/.sql.gz);
#   2) estrae in una cartella temporanea;
#   3) ricostruisce il database in un database TEMPORANEO separato (stesso
#      container Postgres, nessun contatto con il database dell'app);
#   4) rimette i file in una cartella temporanea e li conta;
#   5) alla fine cancella tutto e, se il ripristino è riuscito, scrive la prova
#      in ./backups/ripristino-ok.txt (la usa scripts/backup-verifica.mjs).
#
# Uso (sul VPS o in locale, dalla cartella del compose):
#   ./scripts/verifica-ripristino.sh [archivio]
#
# Gira sull'host perché ha bisogno di Docker. Su un archivio mancante o non
# ripristinabile esce con codice diverso da zero.

set -euo pipefail

ARCHIVIO="${1:-}"
if [ -z "$ARCHIVIO" ]; then
  ARCHIVIO=$(ls -1t ./backups/completi/naboat-completo-*.tar.gz ./backups/completi/naboat-db-*.sql.gz \
    ./backups/*.tar.gz ./backups/*.sql.gz ./backups/*.sql 2>/dev/null | head -n1 || true)
fi
if [ -z "${ARCHIVIO:-}" ] || [ ! -f "$ARCHIVIO" ]; then
  echo "ERRORE: nessun archivio da verificare. Uso: $0 /percorso/naboat-completo-AAA-MM-GG_HHMM.tar.gz"
  exit 1
fi

PROVA="${PROVA_RIPRISTINO_FILE:-./backups/ripristino-ok.txt}"
DRILL_DB="${DRILL_DB:-naboat_ripristino}"
LOG="$(mktemp -d)"

leggi_env() {
  [ -f .env ] || { echo ""; return; }
  grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true
}
DB_USER="${POSTGRES_USER:-$(leggi_env POSTGRES_USER)}"; DB_USER="${DB_USER:-naboat}"

# Anche in caso di errore il database temporaneo e i file estratti vengono rimossi.
pulizia() {
  rm -rf "$LOG"
  docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null 2>&1 || true
}
trap pulizia EXIT

echo "[$(date '+%F %T')] Prova di ripristino da: $ARCHIVIO"

DBFILE=""
CARTELLA_FOTO=""
case "$ARCHIVIO" in
  *.tar.gz|*.tgz)
    echo "1) Estrazione archivio completo…"
    tar -xzf "$ARCHIVIO" -C "$LOG"
    [ -f "$LOG/database.sql" ] || { echo "ERRORE: database.sql non trovato nell'archivio."; exit 1; }
    DBFILE="$LOG/database.sql"
    [ -d "$LOG/portale/uploads" ] && CARTELLA_FOTO="$LOG/portale/uploads"
    ;;
  *.sql.gz)
    echo "1) Decompressione dump…"
    gunzip -c "$ARCHIVIO" > "$LOG/database.sql"
    DBFILE="$LOG/database.sql"
    ;;
  *.sql)
    DBFILE="$ARCHIVIO"
    ;;
  *)
    echo "ERRORE: formato non riconosciuto (attesi .tar.gz, .sql.gz o .sql)."
    exit 1
    ;;
esac

if [ ! -s "$DBFILE" ]; then
  echo "ERRORE: dump del database vuoto: archivio non ripristinabile."
  exit 1
fi
RIGHE=$(wc -l < "$DBFILE" | tr -d ' ')
echo "   dump: $RIGHE righe"

echo "2) Ripristino in database temporaneo «${DRILL_DB}»…"
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "CREATE DATABASE \"$DRILL_DB\";" >/dev/null
docker compose exec -T db psql -U "$DB_USER" -d "$DRILL_DB" < "$DBFILE" >/dev/null

echo "3) Verifica integrità del database ripristinato…"
CONTI=$(docker compose exec -T db psql -U "$DB_USER" -d "$DRILL_DB" -t -A -F'|' -c 'SELECT
  (SELECT count(*) FROM "Tenant"),
  (SELECT count(*) FROM "User"),
  (SELECT count(*) FROM "Boat"),
  (SELECT count(*) FROM "Booking"),
  (SELECT count(*) FROM _prisma_migrations);')
TENANTS=$(echo "$CONTI" | cut -d'|' -f1)
MIGRAZIONI=$(echo "$CONTI" | cut -d'|' -f5)
echo "   aziende=${TENANTS} utenti=$(echo "$CONTI" | cut -d'|' -f2) barche=$(echo "$CONTI" | cut -d'|' -f3) prenotazioni=$(echo "$CONTI" | cut -d'|' -f4) migrazioni=${MIGRAZIONI}"

if [ "${TENANTS:-0}" -lt 1 ] || [ "${MIGRAZIONI:-0}" -lt 1 ]; then
  echo "ERRORE: il database ripristinato è vuoto o privo di migrazioni: archivio non valido."
  exit 1
fi

FOTO="0"
if [ -n "$CARTELLA_FOTO" ]; then
  echo "4) Verifica dei file (foto e allegati)…"
  DEST=$(mktemp -d)
  cp -R "$CARTELLA_FOTO/." "$DEST/"
  FOTO=$(find "$DEST" -type f | wc -l | tr -d ' ')
  BYTE=$(find "$DEST" -type f -exec wc -c {} + 2>/dev/null | tail -1 | awk '{print $1}')
  echo "   file ripristinati: ${FOTO} (${BYTE:-0} byte da ${CARTELLA_FOTO})"
  rm -rf "$DEST"
else
  echo "4) Nessun file nell'archivio (solo database)."
fi

echo "5) Pulizia del database temporaneo…"
docker compose exec -T db psql -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$DRILL_DB\";" >/dev/null

SUM=$(shasum -a 256 "$ARCHIVIO" 2>/dev/null | awk '{print $1}' || true)
[ -n "$SUM" ] || SUM=$(sha256sum "$ARCHIVIO" 2>/dev/null | awk '{print $1}' || true)
[ -n "$SUM" ] || SUM="n/d"
mkdir -p "$(dirname "$PROVA")"
cat > "$PROVA" <<EOF
ripristino-ok: $(date '+%Y-%m-%dT%H:%M:%S%z')
archivio: $(basename "$ARCHIVIO")
sha256: $SUM
database: aziende=$TENANTS migrazioni=$MIGRAZIONI
file: $FOTO
EOF
echo "   prova scritta in $PROVA"
echo "[$(date '+%F %T')] Ripristino verificato: database e file leggibili in ambiente separato."
