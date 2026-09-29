#!/usr/bin/env bash
# Restore drill: ripristina un backup in un database SEPARATO e verifica che i
# dati siano leggibili. NON tocca il database di produzione.
#
# Da questa versione il drill è un richiamo a scripts/verifica-ripristino.sh,
# che oltre al database controlla anche le foto e scrive la prova usata da
# scripts/backup-verifica.mjs.
#
# Uso (sul VPS o in locale, dalla cartella del compose):
#   ./scripts/restore-drill.sh [percorso-archivio]
set -euo pipefail

ARCHIVIO="${1:-}"
if [ -z "$ARCHIVIO" ]; then
  ARCHIVIO=$(ls -1t ./backups/completi/naboat-completo-*.tar.gz ./backups/completi/naboat-db-*.sql.gz \
    ./backups/*.tar.gz ./backups/*.sql.gz ./backups/*.sql 2>/dev/null | head -n1 || true)
fi

if [ -z "${ARCHIVIO:-}" ] || [ ! -f "$ARCHIVIO" ]; then
  echo "Nessun archivio trovato in ./backups. Uso: $0 /percorso/archivio.tar.gz"
  exit 1
fi

exec "$(dirname "$0")/verifica-ripristino.sh" "$ARCHIVIO"
