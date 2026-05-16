#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
COMPOSE_FILE="${REPO_ROOT}/docker-compose.vps.yml"

read_env_value() {
  local key="$1"
  local raw
  raw="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n1 || true)"
  raw="${raw#*=}"
  raw="${raw%\"}"
  raw="${raw#\"}"
  echo "${raw}"
}

[[ -f "${ENV_FILE}" ]] || {
  echo ".env not found at ${ENV_FILE}" >&2
  exit 1
}

DOMAIN="$(read_env_value "DOMAIN")"
[[ -n "${DOMAIN}" ]] || {
  echo "DOMAIN is not set in .env" >&2
  exit 1
}

BASE_URL="https://${DOMAIN}"

curl_check() {
  local url="$1"
  local attempts="${2:-24}"
  local delay="${3:-5}"
  local n=1
  until curl -fsS "${url}" >/dev/null; do
    if [[ "${n}" -ge "${attempts}" ]]; then
      echo "Health check failed: ${url}" >&2
      return 1
    fi
    sleep "${delay}"
    n=$((n + 1))
  done
}

cd "${REPO_ROOT}"
docker compose -f "${COMPOSE_FILE}" ps

curl_check "${BASE_URL}/"
curl_check "${BASE_URL}/api/healthz"
curl_check "${BASE_URL}/api/readyz"
curl_check "${BASE_URL}/api/auth/me"

echo "Health checks passed for ${BASE_URL}"
