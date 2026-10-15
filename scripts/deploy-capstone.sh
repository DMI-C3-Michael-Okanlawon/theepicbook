#!/usr/bin/env bash
set -euo pipefail
umask 077

tag="${1:?Supply the Azure Pipelines build ID}"
[[ "$tag" =~ ^[0-9]+$ ]] || {
  echo "Invalid build ID."
  exit 1
}

cd /home/azureuser/epicbook-docker-capstone
exec 9>.capstone-deploy.lock
flock -n 9 || {
  echo "Another deployment is running."
  exit 1
}

test -f .env
mkdir -p backups
previous_env=$(mktemp backups/deployment-env.XXXXXX)
cp .env "$previous_env"

apply_images() {
  sudo -n docker compose up -d --no-deps --no-build \
    --wait --wait-timeout 180 backend || return
  sudo -n docker compose up -d --no-deps --no-build \
    --wait --wait-timeout 180 frontend || return
  sudo -n docker compose up -d --no-deps --force-recreate \
    --wait --wait-timeout 180 reverse-proxy || return
}

rollback() {
  result=$?
  trap - EXIT
  if [ "$result" -ne 0 ]; then
    echo "Deployment failed; restoring previous image settings."
    cp "$previous_env" .env
    if apply_images; then
      echo "Previous containers restored; investigate the failed deployment."
    else
      echo "Recovery needs attention. Environment backup: $previous_env"
    fi
  fi
  exit "$result"
}

python3 - "$tag" <<'PY'
import sys
from pathlib import Path

path = Path(".env")
tag = sys.argv[1]
lines = [
    line for line in path.read_text().splitlines()
    if not line.startswith(("FRONTEND_IMAGE=", "BACKEND_IMAGE="))
]
lines.extend([
    f"FRONTEND_IMAGE=michaelokanlawon/epicbook-frontend:{tag}",
    f"BACKEND_IMAGE=michaelokanlawon/epicbook-backend:{tag}",
])
path.write_text("\n".join(lines) + "\n")
path.chmod(0o600)
PY

trap rollback EXIT

sudo -n docker compose config --quiet
sudo -n docker compose pull backend frontend
apply_images

hostname=epicbook-michael-c3-2026.eastus.cloudapp.azure.com
for route in / '/api/books?limit=1'; do
  curl --fail --silent --show-error \
    --retry 5 --retry-delay 3 --retry-all-errors \
    --connect-timeout 5 --max-time 20 \
    --resolve "${hostname}:443:127.0.0.1" \
    --output /dev/null "https://${hostname}${route}"
done

sudo -n docker compose ps
echo "Deployment verified successfully: build $tag"
echo "Previous environment retained at: $previous_env"
trap - EXIT
