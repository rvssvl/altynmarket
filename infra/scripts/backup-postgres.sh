#!/usr/bin/env bash

set -Eeuo pipefail
umask 077

app_root=${APP_ROOT:-/opt/altyn-market}
app_env_file=${APP_ENV_FILE:-/etc/altyn-market/staging.env}
backup_env_file=${BACKUP_ENV_FILE:-/etc/altyn-market/staging-backup.env}
current_link="${app_root}/current"
compose_file="${current_link}/infra/compose/staging.yml"
backup_dir=${BACKUP_DIR:-/var/backups/altyn-market}
timestamp=$(date --utc +%Y-%m-%dT%H-%M-%SZ)
dump_file="${backup_dir}/staging-${timestamp}.dump"

if [[ ${EUID} -ne 0 ]]; then
  echo "Run this backup script as root so its secrets and dumps stay protected." >&2
  exit 1
fi

test -f "${app_env_file}"
test -f "${backup_env_file}"
test -f "${compose_file}"

# The two files are root-managed deployment configuration, not user input.
set -a
# shellcheck disable=SC1090
source "${app_env_file}"
# shellcheck disable=SC1090
source "${backup_env_file}"
set +a

mkdir -p "${backup_dir}"
trap 'rm -f "${dump_file}"' EXIT

compose=(
  docker compose
  --project-name altyn-market-staging
  --env-file "${app_env_file}"
  --file "${compose_file}"
)

"${compose[@]}" exec -T postgres sh -ceu \
  'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --compress=9' \
  > "${dump_file}"

if ! restic snapshots >/dev/null 2>&1; then
  restic init
fi

restic backup --tag altyn-market --tag staging "${dump_file}"
restic forget --tag altyn-market --keep-daily 14 --keep-weekly 8 --keep-monthly 12 --prune
restic check --read-data-subset=1/100
