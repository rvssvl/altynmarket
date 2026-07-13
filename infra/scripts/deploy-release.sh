#!/usr/bin/env bash

set -Eeuo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: deploy-release.sh <commit-sha>" >&2
  exit 1
fi

release_id=$1
if [[ ! ${release_id} =~ ^[a-f0-9]{7,64}$ ]]; then
  echo "The release id must be a Git commit SHA." >&2
  exit 1
fi

app_root=${APP_ROOT:-/opt/altyn-market}
env_file=${ENV_FILE:-/etc/altyn-market/staging.env}
release_dir="${app_root}/releases/${release_id}"
current_link="${app_root}/current"
next_link="${app_root}/current.next"

test -d "${release_dir}"
test -f "${env_file}"

previous_target=""
if [[ -L ${current_link} ]]; then
  previous_target=$(readlink -f "${current_link}")
fi

ln -s "${release_dir}" "${next_link}"
mv -Tf "${next_link}" "${current_link}"

compose=(
  docker compose
  --project-name altyn-market-staging
  --env-file "${env_file}"
  --file "${current_link}/infra/compose/staging.yml"
)

deploy_stack() {
  "${compose[@]}" up --detach --build --remove-orphans
  # Caddyfile is bind-mounted from the immutable release. Compose does not
  # recreate a container when only that file changes, so reload it explicitly.
  "${compose[@]}" up --detach --no-deps --force-recreate caddy
}

if ! deploy_stack; then
  if [[ -n ${previous_target} ]]; then
    ln -s "${previous_target}" "${next_link}"
    mv -Tf "${next_link}" "${current_link}"
    deploy_stack || true
  fi
  exit 1
fi

"${compose[@]}" ps
docker image prune --force --filter "until=168h"
