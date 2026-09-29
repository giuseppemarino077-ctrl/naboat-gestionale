#!/usr/bin/env bash
# RIPRISTINO COMPLETO su un server nuovo, da un archivio creato con backup-completo.sh.
#
# Uso (sul VPS nuovo, dopo aver copiato il progetto e l'archivio):
#   ./scripts/ripristino-completo.sh /percorso/naboat-completo-AAAA-MM-GG_HHMM.tar.gz
#
# Cosa fa, in ordine:
#   1) estrae l'archivio in una cartella temporanea
#   2) rimette i file di configurazione (.env, docker-compose, Caddyfile) nella cartella del progetto
#   3) rimette le foto nella cartella uploads
#   4) riavvia database e cache e ricarica il dump completo
#   5) riavvia il portale e verifica che risponda
#
# NON sovrascrive i file di configurazione esistenti senza chiedere: li salva prima come .pre-ripristino

set -euo pipefail

ARCHIVIO="${1:-}"
if [ -z "$ARCHIVIO" ] || [ ! -f "$ARCHIVIO" ]; then
  echo "Uso: $0 /percorso/naboat-completo-AAAA-MM-GG_HHMM.tar.gz"
  exit 1
fi

echo "[$(date '+%F %T')] Ripristino completo da: $ARCHIVIO"
LAVORO=$(mktemp -d)
trap 'rm -rf "$LAVORO"' EXIT

echo "1) Estrazione archivio…"
tar -xzf "$ARCHIVIO" -C "$LAVORO"
[ -f "$LAVORO/database.sql" ] || { echo "ERRORE: database.sql non trovato nell'archivio"; exit 1; }

echo "2) File di configurazione…"
# .env deve essere letto per conoscere utente e nome del database
if [ -f "$LAVORO/portale/.env" ]; then
  if [ -f .env ]; then cp .env ".env.pre-ripristino-$(date +%Y%m%d%H%M)"; fi
  cp "$LAVORO/portale/.env" .env
  chmod 600 .env
  echo "   .env ripristinato (il precedente è stato salvato come .env.pre-ripristino-*)"
fi
for f in docker-compose.yml docker-compose.override.yml Caddyfile Dockerfile; do
  if [ -f "$LAVORO/portale/$f" ]; then
    if [ -f "$f" ]; then cp "$f" "$f.pre-ripristino-$(date +%Y%m%d%H%M)"; fi
    cp "$LAVORO/portale/$f" "$f"
    echo "   $f ripristinato"
  fi
done

leggi_env() {
  [ -f .env ] || { echo ""; return; }
  grep -E "^$1=" .env | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'" | tr -d '\r' || true
}
DB_USER="${POSTGRES_USER:-$(leggi_env POSTGRES_USER)}"
DB_NAME="${POSTGRES_DB:-$(leggi_env POSTGRES_DB)}"
DB_USER="${DB_USER:-naboat}"
DB_NAME="${DB_NAME:-naboat}"

echo "3) Foto e allegati…"
if [ -d "$LAVORO/portale/uploads" ]; then
  mkdir -p ./uploads
  cp -r "$LAVORO/portale/uploads/." ./uploads/
  echo "   copiate $(find ./uploads -type f | wc -l) foto"
else
  echo "   nessuna foto nell'archivio"
fi
# Archivio privato (patenti, verbali): fuori dalla cartella pubblica, permessi stretti.
if [ -d "$LAVORO/portale/uploads-privati" ]; then
  mkdir -p ./uploads-privati
  cp -r "$LAVORO/portale/uploads-privati/." ./uploads-privati/
  chmod -R go-rwx ./uploads-privati 2>/dev/null || true
  echo "   archivio privato: $(find ./uploads-privati -type f | wc -l) file"
fi

echo "4) Database e cache…"
docker compose up -d db redis
# attende che il database sia pronto
for i in $(seq 1 30); do
  if docker compose exec -T db pg_isready -U "$DB_USER" >/dev/null 2>&1; then break; fi
  sleep 2
done

echo "   ricarico il dump (database: $DB_NAME, utente: $DB_USER)…"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" >/dev/null
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" < "$LAVORO/database.sql" >/dev/null
echo "   contenuto ripristinato:"
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c 'SELECT
  (SELECT count(*) FROM "Tenant")  AS aziende,
  (SELECT count(*) FROM "User")    AS utenti,
  (SELECT count(*) FROM "Boat")    AS barche,
  (SELECT count(*) FROM "Booking") AS prenotazioni;'

echo "5) Avvio del portale…"
docker compose up -d --build app
sleep 15
if curl -fsS http://localhost/api/readyz >/dev/null 2>&1; then
  echo "   portale attivo e database raggiungibile"
else
  echo "   ATTENZIONE: il portale non risponde ancora. Controlla con: docker compose logs app --tail 50"
fi

echo "[$(date '+%F %T')] Ripristino completato."
echo "   Prossimi controlli: https://app.naboat.it (login), foto visibili, invio email, webhook Stripe."
