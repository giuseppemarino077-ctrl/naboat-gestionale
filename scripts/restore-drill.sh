#!/usr/bin/env bash
# Restore drill: ripristina l'ultimo dump in un database "drill" separato e
# verifica che i dati siano leggibili. NON tocca il database di produzione.
#
# Uso (sul VPS, dalla cartella del compose):
#   ./scripts/restore-drill.sh [percorso-dump]
set -euo pipefail

DUMP="${1:-$(ls -1t ./backups/**/*.sql ./backups/**/*.gz ./backups/*.sql ./backups/*.gz 2>/dev/null | head -n1)}"
DRILL_DB="naboat_drill"

if [ -z "${DUMP:-}" ]; then echo "Nessun dump trovato in ./backups"; exit 1; fi
echo "Dump scelto: $DUMP"

echo "1) Ricreo il database di prova $DRILL_DB"
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS $DRILL_DB;"
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE $DRILL_DB;"

echo "2) Ripristino il dump"
if [[ "$DUMP" == *.gz ]]; then
  gunzip -c "$DUMP" | docker compose exec -T db psql -U "$POSTGRES_USER" -d "$DRILL_DB" >/dev/null
else
  docker compose exec -T db psql -U "$POSTGRES_USER" -d "$DRILL_DB" < "$DUMP" >/dev/null
fi

echo "3) Verifica integrità"
docker compose exec -T db psql -U "$POSTGRES_USER" -d "$DRILL_DB" -c 'SELECT
  (SELECT count(*) FROM "Tenant")  AS tenants,
  (SELECT count(*) FROM "User")    AS users,
  (SELECT count(*) FROM "Boat")    AS boats,
  (SELECT count(*) FROM "Booking") AS bookings;'

echo "4) Pulizia"
docker compose exec -T db psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE $DRILL_DB;"
echo "Restore drill completato."
